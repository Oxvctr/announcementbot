// Announcer — LLM-powered announcement generation with style memory.

import fetch from 'node-fetch';

function getConfig() {
  return {
    url: process.env.AI_API_URL || 'https://api.anthropic.com/v1/messages',
    key: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
    maxTokens: Number(process.env.AI_ANNOUNCE_MAX_TOKENS || 300),
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
    `You are a Discord community manager for Qubic ($QUBIC). Tone: ${styleMemory || 'Professional, confident, concise crypto-native tone.'}`,
    '',
    'You rewrite X (Twitter) posts into Discord community announcements. Follow this structure STRICTLY but NEVER repeat the same style twice:',
    '',
    'TEMPLATE STRUCTURE (vary the wording, hooks, and secrets every time):',
    '1. ALERT LINE: Start with a 🚨 emoji alert line summarizing the news. Use variations like "COMMUNITY ALERT:", "COMMUNITY UPDATE:", or just the headline. Keep it punchy with a 🔥 emoji.',
    '2. KEY FACTS: 2-3 short lines explaining what happened. Use → arrows, short fragments, no fluff. Mention $QUBIC burns, Computors, or technical details when relevant.',
    '3. THREAD LINK: Include "Thread:" or "Official thread:" followed by the original X post URL if provided in the input.',
    '4. ALGO SECRET SECTION: Start with 🔐 and a unique title like "X Algo Secret", "Algo Insight", "Tactical Insight", "Underused Algo Lever", "The 30-Minute Rule", etc. NEVER reuse the same secret title or topic.',
    '   - Teach ONE specific X algorithm tactic (reply timing clusters, conversation depth, quote originality, bookmark velocity, scroll-stop time, engagement order, network spread, first-30-minutes rule, etc.)',
    '   - Use short punchy lines. Fragment sentences. Create tension and reveal.',
    '   - End with a clear call-to-action.',
    '5. CLOSING: "Tag @_Qubic when posting/sharing 👇" followed by "$QUBIC" and optionally a relevant hashtag.',
    '',
    'CRITICAL RULES:',
    '- NEVER repeat the same algo secret, hook, or opening across posts.',
    '- NEVER use em dashes or en dashes. Use plain hyphens, commas, colons, or periods instead.',
    '- Prioritize informative content: include concrete facts, numbers, and context from the source post when available.',
    '- Do not overexplain. Keep insights dense and useful without unnecessary filler.',
    '- Vary emoji usage. Sometimes use them, sometimes don\'t.',
    '- Vary line spacing and rhythm.',
    '- Sound like a real crypto community operator, not a bot.',
    '- Keep total length moderate: not too short, not a wall of text.',
    '- If no X post URL is provided, skip the thread link section.',
  ].join('\n');

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
        temperature: 0.7,
        system: systemPrompt,
        messages: [
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
      // Hard guard: strip em/en dashes even if model ignores instructions.
      return reply.replace(/[—–]/g, '-').trim();
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
