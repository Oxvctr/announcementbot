// Announcer — LLM-powered announcement generation with style memory.

import fetch from 'node-fetch';

function getConfig() {
  return {
    url: process.env.AI_API_URL || 'https://api.anthropic.com/v1/messages',
    key: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
    maxTokens: Number(process.env.AI_ANNOUNCE_MAX_TOKENS || 500),
    timeout: Number(process.env.AI_REQUEST_TIMEOUT_MS || 10_000),
  };
}

/**
 * Generate a humanized Discord announcement via LLM.
 * @param {string} topic - The announcement topic or source text to rewrite.
 * @param {string} styleMemory - Tone/persona instruction for the system prompt.
 * @returns {Promise<string>} The generated announcement text.
 */
export async function generateAnnouncement(topic, styleMemory) {
  const cfg = getConfig();
  if (!cfg.key) {
    return `[AI disabled] Announcement about: ${topic}`;
  }

  const systemPrompt = [
    'You write Discord raid-style community announcements for Qubic ($QUBIC).',
    'You MUST follow the exact structure shown in the conversation examples.',
    '',
    'STRUCTURE:',
    '1) Bold hook line with emojis (**RAID ALERT: TOPIC** 🚨 or **NEW POST LIVE: TOPIC** 🔥)',
    '2) Brief context - 2 to 4 short sentences summarizing the news. Punchy, not paragraphs.',
    '3) CTA section: a unique short X algorithm tip or trick that teaches WHY engagement matters. Different every time. Examples: reply timing clusters, bookmark velocity, quote originality, engagement order, scroll-stop dwell time, network spread, first 30 minutes rule, conversation depth. Weave the Like/RT/Bookmark/Comment actions INTO the tip naturally.',
    '4) Instruction to share it beyond the Qubic community.',
    '5) Post link with 🔗 emoji (only if URL provided)',
    '6) @Social Media Booster tag at the end',
    '',
    'RULES:',
    '- Keep it punchy. Short sentences. No walls of text.',
    '- Use **bold** for hook lines, section headers, and key emphasis.',
    '- Use emojis generously throughout. Match emojis to context (mining = ⛏️💪, speed = ⚡, fire = 🔥, alert = 🚨, target = 🎯, rocket = 🚀, chart = 📈, brain = 🧠, link = 🔗, warning = ⚠️, check = ✅, eyes = 👀, point down = 🔽).',
    '- Use bullet points (•) inside raid objectives.',
    '- Twitter handle is @_Qubic_ (with underscores).',
    '- Always end with @Social Media Booster.',
    '- Include the post URL inline with 🔗 if provided.',
    '- Vary the hook style: RAID ALERT, NEW POST LIVE, COMMUNITY ALERT, etc.',
    '- 250 words max.',
  ].join('\n');

  // Few-shot examples: show the AI exact input→output pairs so it pattern-matches
  const fewShotMessages = [
    {
      role: 'user',
      content: 'Qubic just dropped the latest Epoch 200 data. CPU miners are profitable. Qubic earns $0.72/day, Monero + Tari $0.58/day. Top Up Bonus 29%.\n\nOriginal post URL: https://x.com/_qubic_/status/2024832523054813476',
    },
    {
      role: 'assistant',
      content: `**RAID ALERT: EPOCH 200 PROFITABILITY REPORT IS LIVE** 🚨\nCPU miners, this one is for you. ⛏️\n\nQubic just dropped the latest Epoch 200 data and the numbers speak loud 📈\n\n🔗 https://x.com/_qubic_/status/2024832523054813476\n\n🧠 **X Algo Tip — Reply Timing Clusters:**\nX doesn't just count replies. It measures when they land.\nIf 8-15 replies hit within a tight 5-10 minute window, X flags it as "conversation forming" and expands testing 🚀\n\nSlow trickle = capped reach.\nFast cluster = distribution unlock ⚡\n\nLike. Repost. Drop a sharp comment about Useful PoW. Tag a CPU miner 👀\nDo it now, not later. That's how you trigger the cluster 💪\n@Social Media Booster`,
    },
    {
      role: 'user',
      content: 'Dogecoin mining is coming to Qubic. Design phase done. Project plan finalized. Two workstreams running in parallel. Target mainnet launch April 1 2026. Qubic already took over Monero network with its miners.\n\nOriginal post URL: https://x.com/_qubic_/status/2024862746517426493',
    },
    {
      role: 'assistant',
      content: `**NEW POST LIVE: DOGECOIN MINING IS COMING TO QUBIC** 🚀🐕\nDesign phase done ✅ Project plan finalized ✅ Two workstreams running in parallel.\nTarget mainnet launch: April 1, 2026 📅\n\nQubic already took over the Monero network with its miners ⛏️ Now Dogecoin is next. Same energy, same infrastructure, more utility. Useful Proof of Work keeps expanding into a universal compute engine 🧠\n\nOne of the biggest communities in crypto is about to meet one of the most undervalued compute networks in the space 🔥 This is the kind of post that bridges two worlds.\n\n🔗 https://x.com/_qubic_/status/2024862746517426493\n\n🧠 **X Algo Tip — Bookmark Velocity:**\nMost people skip bookmarks. The algorithm doesn't 📌\nWhen bookmarks spike early, X assumes "future reference value" and keeps testing the post longer.\n\nLikes fade. Bookmarks extend lifespan ⏳\n\nRT. Quote tweet and tag every DOGE holder and miner you know 📣\nBut also bookmark. It quietly extends reach beyond the first hour 🔥\nDon't let it sit quiet 🤐\n@Social Media Booster`,
    },
    {
      role: 'user',
      content: 'Qubic All-Hands recap. Neuraxon 2.0 published and running. Oracle Machines live on mainnet with 11000+ queries. DogeCoin ASIC mining architecture locked. Five major milestones shipping in next 60 days.\n\nOriginal post URL: https://x.com/_qubic_/status/2024907910468235582',
    },
    {
      role: 'assistant',
      content: `**NEW POST LIVE: QUBIC ALL-HANDS RECAP** 📢🔥\nNeuraxon 2.0 🧠 AI research ⚡ Oracle infrastructure 🔮 Mining expansion ⛏️ Governance 🏛️ Wallet tooling 🛠️\n\nAll moving at the same time, all hitting mainnet in the next 60 days 🚀\nOne All-Hands. Five major milestones. Every single one of them shipping ✅\n\nThis is the post that shows what Qubic actually looks like when everything clicks 💪\n\n🔗 https://x.com/_qubic_/status/2024907910468235582\n\n🧠 **X Algo Tip — The First 30 Minutes:**\nIf meaningful engagement crosses a threshold in the first 30 minutes, X shifts the post into discovery feeds 📈\nMiss that window and reach compresses hard.\n\nEarly action compounds. Late action barely registers ⏰\n\nLike. RT. Comment. Quote tweet and tag anyone building in AI, mining, or DeFi infrastructure 📣\nEngage now. Not later. That's the unlock 🔓\n@Social Media Booster`,
    },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeout);

  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
          ...fewShotMessages,
          { role: 'user', content: topic },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`AI API error: ${res.status}`);
    }

    const data = await res.json();
    let reply = data.content?.[0]?.text || data.choices?.[0]?.message?.content;
    if (Array.isArray(reply)) {
      reply = reply.map((p) => (typeof p === 'string' ? p : p.text || '')).join('\n');
    }
    if (typeof reply === 'string') {
      // Light sanitization: keep bold and bullets, strip unwanted markdown
      let clean = reply
        .replace(/[—–]/g, '-')                    // em/en dashes → hyphens
        .replace(/^#+\s+/gm, '')                  // strip headers (# text)
        .replace(/^\s*>\s+/gm, '')                // strip blockquotes
        .replace(/`([^`]+)`/g, '$1')              // strip inline code
        .trim();
      return clean;
    }
    return `[AI returned empty] Topic: ${topic}`;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('AI announcement generation timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
