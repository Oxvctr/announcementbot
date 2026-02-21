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
    'OUTPUT FORMAT — fragments only, no full sentences:',
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
    'EXAMPLE OUTPUT (fragments only):',
    '🚨 Qubic Oracle Machines are LIVE 🔥',
    '676 Computors verifying real-world data.',
    'Every oracle call burns $QUBIC permanently.',
    '',
    'Thread:',
    'https://x.com/Qubic/status/123',
    '',
    '🔐 Bookmark Velocity:',
    'Bookmarks extend lifespan.',
    'Early bookmarks = future reference value.',
    'X keeps testing longer.',
    'Reply. Quote. Bookmark — quiet reach boost.',
    '',
    'Tag @_Qubic_ 👇',
    '$QUBIC',
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
    'WRONG (do NOT output like this):',
    '# 🔌 Energy That Actually Produces Something',
    '**Useful Proof of Work** turns mining electricity into compounding value:',
    '- 🔐 Secures the network',
    '- 🧠 Trains neural networks',
    '',
    'ALSO WRONG (paragraphs, full sentences):',
    '🚨 Useful Proof of Work is now live 🔥',
    'Useful Proof of Work turns mining electricity into compounding value, securing the network while simultaneously training neural networks and mining external assets.',
    'This means the same electricity input produces multiple outputs instead of evaporating after block confirmation.',
    '',
    'RIGHT (fragments only):',
    '🚨 Useful Proof of Work is LIVE 🔥',
    'Mining secures network + trains AI + mines Monero.',
    'Same electricity, multiple outputs.',
    '',
    'ALSO RIGHT (fragments only):',
    '🚨 Qubic Oracle Machines are LIVE 🔥',
    '676 Computors verifying real-world data.',
    'Every oracle call burns $QUBIC permanently.',
    '',
    'Thread:',
    'https://x.com/Qubic/status/123',
    '',
    '🔐 Reply Timing Clusters:',
    'Not just replies — timing clusters.',
    '8-15 replies in 5-10 minutes = conversation flagged.',
    'Fast cluster = distribution unlock.',
    'Engage now, not later.',
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
        temperature: 0.3,
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
