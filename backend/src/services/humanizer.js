// Humanizer Engine — typing delay, emoji randomization, text cleanup, humanized posting.

function getHumanizerConfig() {
  return {
    minDelay: Number(process.env.HUMANIZER_MIN_DELAY_MS || 1500),
    maxDelay: Number(process.env.HUMANIZER_MAX_DELAY_MS || 5000),
    emojiChance: Number(process.env.HUMANIZER_EMOJI_CHANCE || 0.4),
    emojiSet: (process.env.HUMANIZER_EMOJI_SET || '🚀,🔥,⚡,🧠,📈,✨').split(',').map(s => s.trim()).filter(Boolean),
  };
}

/**
 * Returns a promise that resolves after a random human-like delay.
 */
export function humanDelay() {
  const cfg = getHumanizerConfig();
  const ms = cfg.minDelay + Math.random() * (cfg.maxDelay - cfg.minDelay);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Applies humanizing transformations to text:
 * - Collapses triple+ newlines to double
 * - Probabilistically appends a random emoji
 */
export function humanizeText(text) {
  if (typeof text !== 'string') return '';
  const cfg = getHumanizerConfig();
  let result = text.replace(/\n{3,}/g, '\n\n').trim();
  if (cfg.emojiSet.length && Math.random() < cfg.emojiChance) {
    const emoji = cfg.emojiSet[Math.floor(Math.random() * cfg.emojiSet.length)];
    result += ' ' + emoji;
  }
  return result;
}

/**
 * Sends a message to a Discord channel with human-like typing simulation.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} content
 * @returns {Promise<import('discord.js').Message>}
 */
export async function humanPost(channel, content) {
  await channel.sendTyping();
  await humanDelay();
  return channel.send(humanizeText(content));
}
