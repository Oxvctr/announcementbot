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
    'You rewrite social media posts into Discord community announcements for Qubic ($QUBIC).',
    'You MUST follow the exact structure shown in the conversation examples.',
    'Every announcement has 3 sections separated by blank lines:',
    '1) Hook + facts (short lines, fragments)',
    '2) Thread URL (only if URL provided, otherwise skip entirely)',
    '3) 🔐 Algo secret section (short punchy lines, each on its own line)',
    '4) Tag @_Qubic_ 👇 and $QUBIC at the end',
    '',
    'RULES:',
    '- Each line is a short fragment. Max 1-2 clauses per line.',
    '- Use line breaks liberally. One thought per line.',
    '- NEVER use markdown: no bold, no headers, no bullets.',
    '- NEVER write long paragraph sentences.',
    '- 200 words max.',
    '- Do NOT include the Thread/URL section in your output. It will be appended automatically.',
    '- Twitter handle is always @_Qubic_ (with trailing underscore).',
    '- Invent a unique 🔐 algo secret title each time. Never repeat.',
  ].join('\n');

  // Few-shot examples: show the AI exact input→output pairs so it pattern-matches
  const fewShotMessages = [
    {
      role: 'user',
      content: 'Qubic Oracle Machines are now live. Real-world data feeds into smart contracts verified by 676 Computors. Every query burns QUBIC tokens.\n\nOriginal post URL: https://x.com/Qubic/status/2021638947453943977',
    },
    {
      role: 'assistant',
      content: `🚨 COMMUNITY ALERT: Qubic Oracle Machines are LIVE 🔥\nReal-world data now feeds directly into smart contracts, verified by 676 Computors.\n\nEvery query burns $QUBIC → usage = deflation.\n\n🔐 X Algo Secret (most people miss this):\nIt's not just replies, it's reply timing clusters.\n\nIf 8 to 15 replies hit within a tight 5 to 10 minute window,\nX flags the post as "conversation forming" and expands testing.\n\nSlow trickle = capped reach.\nFast cluster = distribution unlock.\nIf you're engaging, do it now, not later.\n\nTag @_Qubic_ 👇\n$QUBIC #OracleMachines`,
    },
    {
      role: 'user',
      content: 'Qubic Oracle Machines launched. 676 Computors verify data. Oracle calls burn QUBIC.\n\nOriginal post URL: https://x.com/Qubic/status/2021638947453943977',
    },
    {
      role: 'assistant',
      content: `🚨 Qubic Oracle Machines are LIVE 🔥\n676 Computors verifying real-world data.\nEvery oracle call burns $QUBIC permanently.\n\n🔐 Underused Algo Lever:\n\nBookmarks extend lifespan.\n\nWhen bookmarks spike early,\nX assumes "future reference value"\nand keeps testing the post longer.\n\nMost people ignore this.\nThey shouldn't.\nReply. Quote.\n\nBut also bookmark.\n\nIt quietly extends reach.\n\nTag @_Qubic_ 👇\n$QUBIC`,
    },
    {
      role: 'user',
      content: 'Qubic Oracle Machines are live. Smart contracts plus real-world data. 676 Computors. Each query burns QUBIC.\n\nOriginal post URL: https://x.com/Qubic/status/2021638947453943977',
    },
    {
      role: 'assistant',
      content: `🚨 Qubic Oracle Machines are LIVE 🔥\n\nSmart contracts + real-world data.\nVerified by 676 Computors.\nEach query burns $QUBIC.\n\n🔐 The 30-Minute Rule:\nIf meaningful engagement crosses a threshold\nin the first 30 minutes,\nX shifts the post into discovery feeds.\n\nMiss that window,\nand reach compresses.\n\nEarly action compounds.\n\nLate action barely registers.\n\nEngage fast.\n\nTag @_Qubic_ 👇\n$QUBIC`,
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
      // Light sanitization: strip markdown only, preserve line structure
      let clean = reply
        .replace(/[—–]/g, '-')                    // em/en dashes → hyphens
        .replace(/^#+\s+/gm, '')                  // strip headers (# text)
        .replace(/\*\*(.+?)\*\*/g, '$1')          // strip bold (**text**)
        .replace(/^[•\-*]\s+/gm, '')              // strip bullet points
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
