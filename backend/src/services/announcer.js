// Announcer — LLM-powered announcement generation with style memory.

import fetch from 'node-fetch';

function getConfig() {
  return {
    url: process.env.AI_API_URL || 'https://api.anthropic.com/v1/messages',
    key: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
    maxTokens: Number(process.env.AI_ANNOUNCE_MAX_TOKENS || 350),
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
    'MUST follow this exact format. No deviations:',
    '',
    '🚨 [HOOK — one punchy line, emoji optional]',
    '[FACT 1 — fragment, arrow or colon, real numbers]',
    '[FACT 2 — fragment]',
    '[FACT 3 — optional]',
    '',
    '[Thread:]',
    '[URL — only if provided, skip entire block if no URL]',
    '',
    '🔐 [UNIQUE ALGO SECRET TITLE]:',
    '[Tension line 1 — fragment]',
    '[Tension line 2 — fragment]',
    '[Insight reveal — fragment]',
    '[Community call to action — fragment]',
    '',
    'Tag @_Qubic_ 👇',
    '$QUBIC',
    '',
    'PERFECT EXAMPLE (copy this structure exactly):',
    '',
    '🚨 COMMUNITY ALERT: Qubic Oracle Machines are LIVE 🔥',
    'Real-world data now feeds directly into smart contracts, verified by 676 Computors.',
    'Every query burns $QUBIC → usage = deflation.',
    '',
    'Official thread:',
    'https://x.com/Qubic/status/2021638947453943977',
    '',
    '🔐 X Algo Secret (most people miss this):',
    'It\'s not just replies, it\'s reply timing clusters.',
    'If 8 to 15 replies hit within a tight 5 to 10 minute window,',
    'X flags the post as "conversation forming" and expands testing.',
    'Slow trickle = capped reach.',
    'Fast cluster = distribution unlock.',
    'If you\'re engaging, do it now, not later.',
    '',
    'Tag @_Qubic_ 👇',
    '$QUBIC #OracleMachines',
    '',
    'HARD RULES:',
    '- 200 words max. Dense and smart. No over-explaining.',
    '- NEVER write paragraphs or long sentences. Fragments only.',
    '- NEVER use bold (**text**), headers (#), bullet points (-), or markdown formatting.',
    '- NEVER repeat the same Algo Secret title or tactic across posts.',
    '- No em dashes or en dashes. Use hyphens, commas, colons only.',
    '- Include real numbers and facts from the source.',
    '- Skip Thread/URL block entirely if no URL is provided.',
    '- NEVER ask for more info. Output must always be a finished announcement.',
    '- Twitter handle is always @_Qubic_ (trailing underscore).',
    '',
    'CRITICAL: Your output MUST match the perfect example structure exactly.',
    'Use fragments only. No full sentences.',
    'No paragraphs. No bold. No headers. No bullets.',
    'Copy the line breaks and spacing exactly.',
    'Any deviation from the example format is wrong.',
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
        temperature: 0.1,
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
      // Aggressive sanitization: strip all markdown formatting
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
