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
    '3) Static CTA line: always include "Like. RT. Bookmark. Comment." plus a context-specific action (tag someone, quote tweet, etc.)',
    '4) After the static CTA, add a unique 🧠 **X Algo Tip** section. Pick ONE tip from the list below. NEVER repeat the same tip across posts. Each tip is 3-5 short punchy lines explaining an X algorithm insight.',
    '5) Post link with 🔗 emoji (only if URL provided)',
    '6) @Social Media Booster tag at the end',
    '',
    'X ALGO TIP POOL (pick one per post, never repeat):',
    '1. Reply Timing Clusters - 8-15 replies in 5-10 min window triggers "conversation forming" flag',
    '2. Bookmark Velocity - early bookmark spikes signal "future reference value", extends post lifespan',
    '3. The First 30 Minutes - engagement threshold in first 30 min shifts post to discovery feeds',
    '4. Conversation Depth - replies that trigger follow-up replies get labeled "high retention conversation"',
    '5. Quote Originality - unique quote tweets with added context rank higher than plain RTs',
    '6. Engagement Order - reply first, quote second, like last. Replies signal active conversation, likes signal passive',
    '7. Network Spread - replies from different social graphs expand distribution pools beyond your circle',
    '8. Scroll-Stop Dwell Time - if users pause before interacting, X boosts the post. Screenshots and charts increase dwell time',
    '9. The Compounding Engagement Paradox - technical posts underperform initially but saves/shares spike weeks later',
    '10. Profile Click Weight - if engagement leads to profile visits, X treats the post as "discovery worthy"',
    '11. Thread Completion Rate - if users read to the end of a thread, X boosts all posts in it',
    '12. Reply Length Signal - longer thoughtful replies signal quality conversation, short "nice" replies get filtered',
    '13. Cross-Format Amplification - posts that get engagement across text, image, and video formats rank higher',
    '14. The Repost Chain Effect - when a repost gets reposted again, X treats it as viral signal and expands testing',
    '15. Follower-to-Engagement Ratio - high engagement from non-followers signals broad appeal, triggers explore page',
    '16. The Silent Boost - sharing via DM counts as private engagement, X tracks it and boosts public reach',
    '17. Hashtag Timing - hashtags added at post time perform differently than edited in later. Original tags get indexed faster',
    '18. The Media Advantage - posts with images get 2-3x more dwell time. Charts and data visuals perform best in crypto',
    '19. Reply Position Matters - being in the first 3-5 replies gets exponentially more visibility than reply #50',
    '20. The Engagement Echo - engaging with replies on a post you shared boosts YOUR version of the share',
    '21. Impression-to-Engagement Conversion - X measures what % of impressions convert to action. Higher ratio = more distribution',
    '22. The Quote Tweet Ladder - quote tweets that add genuine insight outperform those that just add emojis',
    '23. Notification Trigger Stacking - likes + replies + bookmarks from same user in sequence triggers priority notification for the poster',
    '',
    'RULES:',
    '- Keep it punchy. Short sentences. No walls of text.',
    '- Use **bold** for hook lines, section headers, and key emphasis.',
    '- Use emojis generously throughout. Match emojis to context (mining = ⛏️💪, speed = ⚡, fire = 🔥, alert = 🚨, target = 🎯, rocket = 🚀, chart = 📈, brain = 🧠, link = 🔗, warning = ⚠️, check = ✅, eyes = 👀, point down = 🔽).',
    '- Use bullet points (•) inside raid objectives if needed.',
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
      content: `**RAID ALERT: EPOCH 200 PROFITABILITY REPORT IS LIVE** 🚨\nCPU miners, this one is for you. ⛏️\n\nQubic just dropped the latest Epoch 200 data and the numbers speak loud 📈\n\n🔗 https://x.com/_qubic_/status/2024832523054813476\n\nLike. RT. Bookmark. Comment. Drop a sharp take about Useful PoW and tag a CPU miner 👀\n\n🧠 **X Algo Tip — Reply Timing Clusters:**\nX doesn't just count replies. It measures when they land.\nIf 8-15 replies hit within a tight 5-10 minute window, X flags it as "conversation forming" and expands testing 🚀\n\nSlow trickle = capped reach.\nFast cluster = distribution unlock ⚡\nDo it now, not later. That's how you trigger the cluster 💪\n@Social Media Booster`,
    },
    {
      role: 'user',
      content: 'Dogecoin mining is coming to Qubic. Design phase done. Project plan finalized. Two workstreams running in parallel. Target mainnet launch April 1 2026. Qubic already took over Monero network with its miners.\n\nOriginal post URL: https://x.com/_qubic_/status/2024862746517426493',
    },
    {
      role: 'assistant',
      content: `**NEW POST LIVE: DOGECOIN MINING IS COMING TO QUBIC** 🚀🐕\nDesign phase done ✅ Project plan finalized ✅ Two workstreams running in parallel.\nTarget mainnet launch: April 1, 2026 📅\n\nQubic already took over the Monero network with its miners ⛏️ Now Dogecoin is next. Same energy, same infrastructure, more utility. Useful Proof of Work keeps expanding into a universal compute engine 🧠\n\nOne of the biggest communities in crypto is about to meet one of the most undervalued compute networks in the space 🔥 This is the kind of post that bridges two worlds.\n\n🔗 https://x.com/_qubic_/status/2024862746517426493\n\nLike. RT. Bookmark. Comment. Quote tweet and tag every DOGE holder and miner you know 📣\n\n🧠 **X Algo Tip — Bookmark Velocity:**\nMost people skip bookmarks. The algorithm doesn't 📌\nWhen bookmarks spike early, X assumes "future reference value" and keeps testing the post longer.\nLikes fade. Bookmarks extend lifespan ⏳\nDon't sleep on it. Bookmark now 🔥\n@Social Media Booster`,
    },
    {
      role: 'user',
      content: 'Qubic All-Hands recap. Neuraxon 2.0 published and running. Oracle Machines live on mainnet with 11000+ queries. DogeCoin ASIC mining architecture locked. Five major milestones shipping in next 60 days.\n\nOriginal post URL: https://x.com/_qubic_/status/2024907910468235582',
    },
    {
      role: 'assistant',
      content: `**NEW POST LIVE: QUBIC ALL-HANDS RECAP** 📢🔥\nNeuraxon 2.0 🧠 AI research ⚡ Oracle infrastructure 🔮 Mining expansion ⛏️ Governance 🏛️ Wallet tooling 🛠️\n\nAll moving at the same time, all hitting mainnet in the next 60 days 🚀\nOne All-Hands. Five major milestones. Every single one of them shipping ✅\n\nThis is the post that shows what Qubic actually looks like when everything clicks 💪\n\n🔗 https://x.com/_qubic_/status/2024907910468235582\n\nLike. RT. Bookmark. Comment. Quote tweet and tag anyone building in AI, mining, or DeFi infrastructure 📣\n\n🧠 **X Algo Tip — The First 30 Minutes:**\nIf meaningful engagement crosses a threshold in the first 30 minutes, X shifts the post into discovery feeds 📈\nMiss that window and reach compresses hard.\nEarly action compounds. Late action barely registers ⏰\nEngage now. Not later. That's the unlock 🔓\n@Social Media Booster`,
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
