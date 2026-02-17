import { Client, GatewayIntentBits, Partials, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { humanPost } from './services/humanizer.js';
import { generateAnnouncement } from './services/announcer.js';
import { getRedisClient } from './services/redisClient.js';
import fetch from 'node-fetch';

const FALLBACK_STYLE = 'Professional, confident, concise crypto-native tone.';

function splitCsv(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function getDiscordBotToken() {
  return process.env.DISCORD_BOT_TOKEN || '';
}

function getAdminIds() {
  return splitCsv(process.env.ADMIN_USER_IDS || process.env.ADMIN_USER_ID || '');
}

function getAnnounceChannels() {
  return splitCsv(process.env.ANNOUNCE_CHANNEL_IDS || process.env.ANNOUNCE_CHANNEL_ID || '');
}

function getQueryChannelId() {
  return (process.env.QUERY_CHANNEL_ID || process.env.COMMAND_CHANNEL_ID || '').trim();
}

function getAutoCooldownMs() {
  return Number(process.env.AUTO_COOLDOWN_MS || 3_600_000);
}

function getAutoTopics() {
  const topics = splitCsv(process.env.AUTO_TOPICS || 'Latest project update');
  return topics.length ? topics : ['Latest project update'];
}

function getDefaultStyle() {
  return process.env.DEFAULT_STYLE || FALLBACK_STYLE;
}

function getKillSwitchFlag() {
  return process.env.KILL_SWITCH === 'true';
}

const MAX_SLASH_INPUT_LENGTH = 1500;

let AUTO_MODE = false;
let KILL_SWITCH = false;
let STYLE_MEMORY = FALLBACK_STYLE;
let LAST_AUTO_POST_TIME = Date.now();
let autoLoopTimer = null;
let autoTopicIndex = 0;

// --- Approval flow state ---
let APPROVAL_MODE = true; // when true, webhook posts require admin approval
const pendingApprovals = new Map(); // id -> { text, rewritten, url, timestamp }

// --- Last webhook post (stored when existing Zap sends to /webhook) ---
let lastWebhookPost = null; // { text, url, receivedAt }

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
];

const partials = [Partials.Channel];

let client;

// --- Style memory persistence ---
async function loadStyleMemory(logger) {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const saved = await redis.get('style:memory');
      if (saved && typeof saved === 'string') {
        STYLE_MEMORY = saved;
        logger?.info?.('style memory restored from redis');
        return;
      }
    }
  } catch (err) {
    logger?.warn?.({ err: err?.message }, 'style memory redis load failed');
  }
  STYLE_MEMORY = getDefaultStyle();
}

function isAdmin(userId) {
  return getAdminIds().includes(userId);
}

// --- Post to announce channels (used by webhook + slash commands) ---
async function postToAnnounceChannels(text, logger, { url } = {}) {
  if (!client) {
    logger?.warn?.('discord client not ready; cannot post');
    return 0;
  }

  const targetChannels = getAnnounceChannels();
  if (!targetChannels.length) {
    logger?.warn?.('no announce channels configured; skipping post');
    return 0;
  }

  let finalText = text;
  if (url) {
    finalText += `\n\nThread:\n${url}`;
  }

  let posted = 0;
  for (const channelId of targetChannels) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel?.isTextBased?.()) {
        await humanPost(channel, finalText);
        posted++;
      }
    } catch (err) {
      logger?.error?.({ err, channelId }, 'post to channel failed');
    }
  }
  return posted;
}

// --- Slash command definitions ---
const SLASH_COMMANDS = [
  {
    name: 'announce',
    description: 'Generate and post a humanized announcement',
    options: [
      {
        name: 'topic',
        description: 'Announcement topic or text to rewrite',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'draft',
    description: 'Re-draft announcement from the last Metricool post received via Zapier',
  },
  {
    name: 'auto',
    description: 'Toggle autonomous posting mode',
    options: [
      {
        name: 'state',
        description: 'on or off',
        type: 3, // STRING
        required: true,
        choices: [
          { name: 'on', value: 'on' },
          { name: 'off', value: 'off' },
        ],
      },
    ],
  },
  {
    name: 'kill',
    description: 'Emergency stop - disable all auto-posting immediately',
  },
  {
    name: 'unkill',
    description: 'Re-enable auto-posting after a kill switch',
  },
  {
    name: 'status',
    description: 'Show current bot status (auto mode, kill switch, approval mode)',
  },
  {
    name: 'approve',
    description: 'Toggle webhook approval mode or review pending posts',
    options: [
      {
        name: 'action',
        description: 'on/off to toggle, or "pending" to see queued approvals',
        type: 3, // STRING
        required: true,
        choices: [
          { name: 'on', value: 'on' },
          { name: 'off', value: 'off' },
          { name: 'pending', value: 'pending' },
        ],
      },
    ],
  },
  {
    name: 'help',
    description: 'Show all available commands and what they do',
  },
  {
    name: 'ping',
    description: 'Check if the bot is alive and responsive',
  },
  {
    name: 'delete',
    description: 'Delete the last N bot messages from announce channels',
    options: [
      {
        name: 'count',
        description: 'Number of bot messages to delete (1-10)',
        type: 4, // INTEGER
        required: true,
        min_value: 1,
        max_value: 10,
      },
    ],
  },
];

async function registerSlashCommands(bot, logger) {
  try {
    const rest = new REST({ version: '10' }).setToken(getDiscordBotToken());
    const guildIds = splitCsv(process.env.GUILD_ID || '');
    if (guildIds.length) {
      for (const guildId of guildIds) {
        await rest.put(Routes.applicationGuildCommands(bot.user.id, guildId), { body: SLASH_COMMANDS });
        logger?.info?.({ commands: SLASH_COMMANDS.length, guildId }, 'guild slash commands registered (instant)');
      }
    } else {
      await rest.put(Routes.applicationCommands(bot.user.id), { body: SLASH_COMMANDS });
      logger?.info?.({ commands: SLASH_COMMANDS.length }, 'global slash commands registered (may take up to 1hr)');
    }
  } catch (err) {
    logger?.error?.({ err }, 'slash command registration failed');
  }
}

// --- Interaction handler ---
async function handleInteraction(interaction, logger) {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const queryChannelId = getQueryChannelId();

  // Hard restriction: slash commands only work in configured query channel.
  if (queryChannelId && interaction.channelId !== queryChannelId) {
    return interaction.reply({
      content: `Use slash commands in <#${queryChannelId}> only.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // /announce
  if (commandName === 'announce') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
    }
    const topic = interaction.options.getString('topic');
    if (!topic || topic.length > MAX_SLASH_INPUT_LENGTH) {
      return interaction.reply({ content: `Topic must be 1-${MAX_SLASH_INPUT_LENGTH} characters.`, flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let draft;
    try {
      draft = await generateAnnouncement(topic, STYLE_MEMORY);
    } catch (err) {
      logger?.error?.({ err }, 'announcement generation failed');
      return interaction.editReply({ content: `Generation failed: ${err.message}` });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('announce_post').setLabel('Post').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('announce_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
    );

    const response = await interaction.editReply({
      content: `**Draft:**\n${draft}\n\nApprove or cancel:`,
      components: [row],
    });

    try {
      const btnInteraction = await response.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        time: 300_000,
      });

      if (btnInteraction.customId === 'announce_post') {
        const posted = await postToAnnounceChannels(draft, logger);
        await btnInteraction.update({ content: `Posted to ${posted} channel(s).`, components: [] });
        logger?.info?.({ topic, channels: posted }, 'announcement posted');
      } else {
        await btnInteraction.update({ content: 'Cancelled.', components: [] });
      }
    } catch {
      await interaction.editReply({ content: 'Timed out. Cancelled.', components: [] });
    }
    return;
  }

  // /draft - re-generate announcement from the last Metricool post received via Zapier webhook
  if (commandName === 'draft') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
    }
    if (!lastWebhookPost || !lastWebhookPost.text) {
      return interaction.reply({
        content: 'No Metricool posts received yet. Wait for Zapier to send one to `/webhook`, then try again.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const ago = Math.round((Date.now() - lastWebhookPost.receivedAt) / 60_000);
    const agoStr = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let draft;
    try {
      draft = await generateAnnouncement(
        `Rewrite this for Discord:\n\n${lastWebhookPost.text}${lastWebhookPost.url ? `\n\nOriginal post URL: ${lastWebhookPost.url}` : ''}`,
        STYLE_MEMORY,
      );
    } catch (err) {
      logger?.error?.({ err }, 'draft generation failed');
      return interaction.editReply({ content: `AI generation failed: ${err.message}` });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('draft_post').setLabel('Post').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('draft_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
    );

    const response = await interaction.editReply({
      content: `**Draft from last Metricool post** (received ${agoStr}):\n${draft}\n\nPost or cancel:`,
      components: [row],
    });

    try {
      const btnInteraction = await response.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        time: 300_000,
      });
      if (btnInteraction.customId === 'draft_post') {
        const posted = await postToAnnounceChannels(draft, logger, { url: lastWebhookPost.url });
        await btnInteraction.update({ content: `Posted to ${posted} channel(s).`, components: [] });
        logger?.info?.({ channels: posted }, 'draft posted');
      } else {
        await btnInteraction.update({ content: 'Cancelled.', components: [] });
      }
    } catch {
      await interaction.editReply({ content: 'Timed out. Cancelled.', components: [] });
    }
    return;
  }

  // /auto
  if (commandName === 'auto') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
    }
    const state = interaction.options.getString('state');
    if (state === 'on' && KILL_SWITCH) {
      return interaction.reply({ content: 'Kill switch is active. Use /unkill first.', flags: MessageFlags.Ephemeral });
    }
    AUTO_MODE = state === 'on';
    logger?.info?.({ autoMode: AUTO_MODE }, 'auto mode toggled');
    return interaction.reply({ content: `Auto mode ${AUTO_MODE ? 'enabled' : 'disabled'}.`, flags: MessageFlags.Ephemeral });
  }

  // /kill
  if (commandName === 'kill') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
    }
    KILL_SWITCH = true;
    AUTO_MODE = false;
    logger?.info?.('kill switch activated');
    return interaction.reply({ content: 'Kill switch activated. All auto-posting disabled.', flags: MessageFlags.Ephemeral });
  }

  // /unkill
  if (commandName === 'unkill') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
    }
    KILL_SWITCH = false;
    logger?.info?.('kill switch deactivated');
    return interaction.reply({ content: 'Kill switch deactivated. You can now use /auto on.', flags: MessageFlags.Ephemeral });
  }

  // /status
  if (commandName === 'status') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
    }
    const qCh = getQueryChannelId();
    const lines = [
      `**Auto mode:** ${AUTO_MODE ? 'ON' : 'OFF'}`,
      `**Kill switch:** ${KILL_SWITCH ? 'ACTIVE' : 'off'}`,
      `**Style:** ${STYLE_MEMORY}`,
      `**Query channel:** ${qCh ? `<#${qCh}>` : 'not configured'}`,
      `**Announce channels:** ${getAnnounceChannels().length || 'none configured'}`,
      `**Last auto-post:** ${LAST_AUTO_POST_TIME ? new Date(LAST_AUTO_POST_TIME).toISOString() : 'never'}`,
      `**Approval mode:** ${APPROVAL_MODE ? 'ON' : 'OFF'}`,
      `**Pending approvals:** ${pendingApprovals.size}`,
    ];
    return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  }

  // /approve
  if (commandName === 'approve') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
    }
    const action = interaction.options.getString('action');

    if (action === 'on') {
      APPROVAL_MODE = true;
      return interaction.reply({ content: 'Approval mode **enabled**. Webhook posts will require admin approval.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'off') {
      APPROVAL_MODE = false;
      return interaction.reply({ content: 'Approval mode **disabled**. Webhook posts will auto-publish.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'pending') {
      if (pendingApprovals.size === 0) {
        return interaction.reply({ content: 'No pending approvals.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const entries = [...pendingApprovals.entries()].slice(0, 5);
      for (const [id, item] of entries) {
        const preview = item.rewritten.slice(0, 300) + (item.rewritten.length > 300 ? '...' : '');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`approval_yes_${id}`).setLabel('Post').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`approval_no_${id}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
        );
        await interaction.followUp({
          content: `**Pending #${id}:**\n${preview}${item.url ? `\n\nURL: ${item.url}` : ''}`,
          components: [row],
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }
  }

  // /help
  if (commandName === 'help') {
    const helpText = [
      '**Bot Commands Guide**',
      '',
      '**Announcements**',
      '`/announce topic:` - Generate and post an announcement (shows draft first)',
      '`/draft` - Re-draft announcement from the last Metricool post received via Zapier',
      '',
      '**Auto-Posting**',
      '`/auto on/off` - Toggle autonomous posting',
      '`/kill` - Emergency stop all auto-posting',
      '`/unkill` - Re-enable after kill switch',
      '',
      '**Approval**',
      '`/approve on/off/pending` - Toggle webhook approval mode or review pending posts',
      '',
      '**Info**',
      '`/status` - Show bot status',
      '`/ping` - Check if bot is alive',
      '`/delete count:` - Delete last N bot messages from announce channels',
      '`/help` - This message',
    ];
    return interaction.reply({ content: helpText.join('\n'), flags: MessageFlags.Ephemeral });
  }

  // /delete
  if (commandName === 'delete') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
    }
    const count = interaction.options.getInteger('count');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetChannels = getAnnounceChannels();
    if (!targetChannels.length) {
      return interaction.editReply({ content: 'No announce channels configured.' });
    }

    let totalDeleted = 0;
    for (const channelId of targetChannels) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased?.()) continue;
        const messages = await channel.messages.fetch({ limit: 50 });
        const botMsgs = messages.filter((m) => m.author.id === client.user.id);
        const toDelete = [...botMsgs.values()].slice(0, count);
        for (const msg of toDelete) {
          await msg.delete();
          totalDeleted++;
        }
      } catch (err) {
        logger?.error?.({ err, channelId }, 'delete from channel failed');
      }
    }
    return interaction.editReply({ content: `Deleted ${totalDeleted} bot message(s) across ${targetChannels.length} channel(s).` });
  }

  // /ping
  if (commandName === 'ping') {
    const uptime = Math.round(process.uptime());
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    return interaction.reply({ content: `Pong. Uptime: ${h}h ${m}m ${s}s. WS latency: ${client.ws.ping}ms.`, flags: MessageFlags.Ephemeral });
  }
}

// --- Auto-loop (chained setTimeout to prevent overlap) ---
function startAutoLoop(bot, logger) {
  if (autoLoopTimer) return;
  const scheduleNext = () => {
    autoLoopTimer = setTimeout(tick, 30_000);
  };
  const tick = async () => {
    if (!AUTO_MODE || KILL_SWITCH) { scheduleNext(); return; }
    const cooldownMs = getAutoCooldownMs();
    if (Date.now() - LAST_AUTO_POST_TIME < cooldownMs) { scheduleNext(); return; }

    const topics = getAutoTopics();
    const topic = topics[autoTopicIndex % topics.length];
    autoTopicIndex++;

    try {
      const draft = await generateAnnouncement(topic, STYLE_MEMORY);
      const posted = await postToAnnounceChannels(draft, logger);
      LAST_AUTO_POST_TIME = Date.now();
      logger?.info?.({ topic, channels: posted }, 'auto-post sent');
    } catch (err) {
      logger?.error?.({ err }, 'auto-post generation failed');
    }
    scheduleNext();
  };
  scheduleNext();
  logger?.info?.('auto-loop started');
}

function stopAutoLoop() {
  if (autoLoopTimer) {
    clearTimeout(autoLoopTimer);
    autoLoopTimer = null;
  }
}

function createClient(logger) {
  const bot = new Client({ intents, partials });

  bot.once('ready', async () => {
    logger?.info?.({ bot: bot.user?.tag }, 'discord bot ready');
    await loadStyleMemory(logger);
    await registerSlashCommands(bot, logger);
    startAutoLoop(bot, logger);
  });

  bot.on('interactionCreate', async (interaction) => {
    // Handle approval buttons (Upgrade 1)
    if (interaction.isButton() && interaction.customId.startsWith('approval_')) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({ content: 'Unauthorized.', flags: MessageFlags.Ephemeral });
      }
      const parts = interaction.customId.split('_');
      const action = parts[1]; // 'yes' or 'no'
      const approvalId = parts.slice(2).join('_');
      const item = pendingApprovals.get(approvalId);
      if (!item) {
        return interaction.update({ content: 'This approval has expired or was already handled.', components: [] });
      }
      if (action === 'yes') {
        try {
          const posted = await postToAnnounceChannels(item.rewritten, logger, { url: item.url });
          pendingApprovals.delete(approvalId);
          return interaction.update({ content: `✅ Posted to ${posted} channel(s).`, components: [] });
        } catch (err) {
          logger?.error?.({ err }, 'approval post failed');
          return interaction.update({ content: `Failed to post: ${err.message}`, components: [] });
        }
      } else {
        pendingApprovals.delete(approvalId);
        return interaction.update({ content: '❌ Rejected and removed.', components: [] });
      }
    }

    try {
      await handleInteraction(interaction, logger);
    } catch (err) {
      logger?.error?.({ err }, 'interaction handler failed');
      try {
        const msg = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(msg);
        } else {
          await interaction.reply(msg);
        }
      } catch { /* swallow reply error */ }
    }
  });

  bot.on('error', (err) => {
    logger?.error?.({ err }, 'discord client error');
  });

  return bot;
}

function startDiscordGateway({ logger = console } = {}) {
  if (client) return client;
  KILL_SWITCH = getKillSwitchFlag();
  const token = getDiscordBotToken();
  if (!token) {
    logger?.warn?.('DISCORD_BOT_TOKEN missing; gateway not started');
    return null;
  }
  client = createClient(logger);
  client
    .login(token)
    .then(() => logger?.info?.('discord gateway started'))
    .catch((err) => {
      logger?.error?.({ err }, 'discord login failed');
    });
  return client;
}

function stopDiscordGateway() {
  stopAutoLoop();
  if (client) {
    client.destroy();
    client = null;
  }
}

function setLastWebhookPost(text, url) {
  lastWebhookPost = { text, url: url || null, receivedAt: Date.now() };
}

export {
  startDiscordGateway,
  stopDiscordGateway,
  postToAnnounceChannels,
  pendingApprovals,
  getApprovalMode,
  setLastWebhookPost,
};

function getApprovalMode() { return APPROVAL_MODE; }
