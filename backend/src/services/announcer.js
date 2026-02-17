// Announcer — LLM-powered announcement generation with style memory.

import fetch from 'node-fetch';

function getConfig() {
  return {
    url: process.env.AI_API_URL || 'https://api.anthropic.com/v1/messages',
    key: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
    maxTokens: Number(process.env.AI_ANNOUNCE_MAX_TOKENS || 200),
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
    `You are a sharp Discord community manager for Qubic ($QUBIC). Tone: ${styleMemory || 'Professional, confident, concise crypto-native tone.'}`,
    '',
    'Rewrite X (Twitter) posts into SHORT, punchy Discord announcements. Be compact. Every word earns its place.',
    '',
    'FORMAT (keep it tight, 6-10 lines max):',
    '1. HOOK: One bold line. Emoji optional. Grab attention instantly.',
    '2. FACTS: 2-3 short lines with the key info. Use fragments, arrows (→), numbers. No fluff.',
    '3. LINK: "Thread:" + URL if provided. Skip if none.',
    '4. ALGO TIP: 🔐 One unique X algorithm insight in 2-3 lines. Different every time. End with a CTA.',
    '5. CLOSE: "Tag @_Qubic 👇" + "$QUBIC"',
    '',
    'RULES:',
    '- SHORT. Compact. No walls of text. Aim for under 150 words.',
    '- Never repeat the same hook, algo tip, or structure twice.',
    '- No em dashes or en dashes. Use hyphens, commas, colons.',
    '- Include real facts and numbers from the source. No filler.',
    '- Sound like a crypto insider, not a bot. Vary rhythm and emoji use.',
    '- Skip the thread link if no URL is provided.',
    '- NEVER ask for more info. NEVER say "I\'m ready to help" or "Could you provide".',
    '- Output must ALWAYS be a finished announcement, never a question.',
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
