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
    '1) Bold hook line with emojis. Use a varied prefix AND a creative contextual subtitle.',
    '   Prefix options: RAID ALERT, NEW POST LIVE, SMART RAID ALERT, COMMUNITY ALERT, SIGNAL DROP, ALPHA ALERT, BREAKING, ENGAGEMENT MISSION',
    '   The subtitle should be a punchy contextual phrase, NOT just the topic name.',
    '2) ONE single paragraph of context that frames WHY this post matters. Do NOT summarize the post content. Talk ABOUT the post - why it is significant, what it means for the space, why people should engage. 2-4 punchy sentences. NEVER multiple paragraphs.',
    '3) CTA checklist - each action on its own line with ✅ emoji, text in **bold**:',
    '   ✅ **Like**',
    '   ✅ **RT**',
    '   ✅ **Bookmark**',
    '   ✅ **Comment**',
    '4) 🔗 Post link (only if URL provided)',
    '5) Quote tweet action - a specific engagement prompt relevant to the post topic (e.g. "Quote tweet with your take on X vs Y")',
    '6) Algo closer line: "Lets fire up the algo!" or a variation',
    '7) @Social Media Booster tag at the end',
    '',
    'RULES:',
    '- Keep it punchy. Short sentences. No walls of text. Context is always ONE paragraph.',
    '- Use **bold** for hook line and CTA checklist items.',
    '- Use emojis throughout. Match emojis to context (mining = ⛏️💪, speed = ⚡, fire = 🔥, alert = 🚨, target = 🎯, rocket = 🚀, chart = 📈, brain = 🧠, link = 🔗, warning = ⚠️, check = ✅, eyes = 👀).',
    '- Twitter handle is @_Qubic_ (with underscores).',
    '- Always end with @Social Media Booster.',
    '- Vary the hook prefix every time. Never use the same prefix twice in a row.',
    '- 150 words max.',
  ].join('\n');

  // Few-shot examples: show the AI exact input→output pairs so it pattern-matches
  const fewShotMessages = [
    {
      role: 'user',
      content: 'Qubic energy efficiency post. Training GPT-3 required energy comparable to powering 120 homes for a year. GPT-4 uses far more. Qubic Neuraxon v2.0 takes a different approach to AI scaling.\n\nOriginal post URL: https://x.com/_Qubic_/status/2026312478523629614',
    },
    {
      role: 'assistant',
      content: `**RAID ALERT: THE ENERGY QUESTION EVERY BLOCKCHAIN SHOULD ANSWER** 🔥🧠\nThis post flips the entire AI narrative. While everyone's racing to bigger models and bigger power bills, Qubic is asking the uncomfortable question: what if we're building it wrong? Neuraxon v2.0 isn't just tech - it's a philosophical challenge to the industry 💡⚡\n\n✅ **Like**\n✅ **RT**\n✅ **Bookmark**\n✅ **Comment**\n\n🔗 https://x.com/_Qubic_/status/2026312478523629614\n\nQuote tweet with your take on efficient AI vs. brute force scaling 🤔\n\nLets fire up the algo!\n\n@Social Media Booster`,
    },
    {
      role: 'user',
      content: 'Dogecoin mining is coming to Qubic. Design phase done. Project plan finalized. Two workstreams running in parallel. Target mainnet launch April 1 2026. Qubic already took over Monero network with its miners.\n\nOriginal post URL: https://x.com/_qubic_/status/2024862746517426493',
    },
    {
      role: 'assistant',
      content: `**COMMUNITY ALERT: QUBIC IS COMING FOR DOGECOIN** 🚀🐕\nThis post bridges two of the biggest communities in crypto. If it reaches the right DOGE holders and miners, the replies will be massive. One of the most undervalued compute networks just declared it's coming for one of the most recognized coins in the space ⛏️🔥\n\n✅ **Like**\n✅ **RT**\n✅ **Bookmark**\n✅ **Comment**\n\n🔗 https://x.com/_qubic_/status/2024862746517426493\n\nQuote tweet and tag every DOGE holder and miner you know 📣\n\nLets fire up the algo!\n\n@Social Media Booster`,
    },
    {
      role: 'user',
      content: 'Qubic Neuraxon post. Most AI today works like a calculator pretending to think. Processes inputs in fixed steps then goes silent. Neuraxon is built differently - continuous activity like biological neurons.\n\nOriginal post URL: https://x.com/_qubic_/status/2025956626436427784',
    },
    {
      role: 'assistant',
      content: `**SMART RAID ALERT: WHAT IF AI DIDN'T WAIT FOR PROMPTS?** 🧠⚡\nThis post challenges how most people think about intelligence. Neuraxon isn't scaling parameters - it's redesigning the computational unit itself. If this reaches builders and researchers, the replies will be strong 💡🔥\n\n✅ **Like**\n✅ **RT**\n✅ **Bookmark**\n✅ **Comment**\n\n🔗 https://x.com/_qubic_/status/2025956626436427784\n\nDrop a thoughtful comment about whether continuous activity is required for real intelligence 🤔\n\nLets fire up the algo!\n\n@Social Media Booster`,
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
