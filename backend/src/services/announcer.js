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
    'You are a text formatter. Extract key information from the input and format it into fragments.',
    'Do NOT rewrite. Do NOT write natural sentences. Extract facts and format as fragments.',
    '',
    'OUTPUT FORMAT (fragments only):',
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
    'EXAMPLE:',
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
    'RULES:',
    '- Extract facts from input. Format as fragments.',
    '- 200 words max. No over-explaining.',
    '- NEVER write full sentences. NEVER write paragraphs.',
    '- NEVER use bold, headers, bullets, or markdown.',
    '- No em dashes. Use hyphens, commas, colons.',
    '- Skip Thread/URL block if no URL.',
    '- Output must be finished announcement.',
    '- Twitter handle: @_Qubic_',
    '',
    'CRITICAL: Output MUST be fragments only. No sentences. No paragraphs.',
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
      
      // Force fragments: split long lines, remove connecting words
      const lines = clean.split('\n');
      const fragmentLines = lines.map(line => {
        // Split on periods, question marks, exclamation marks
        const parts = line.split(/([.!?])/);
        let result = '';
        for (let i = 0; i < parts.length; i += 2) {
          const sentence = parts[i]?.trim() || '';
          if (!sentence) continue;
          // Remove connecting words and articles
          let fragment = sentence
            .replace(/^(and|but|or|so|because|although|however|therefore|meanwhile|also|plus)\s+/gi, '')
            .replace(/^(a|an|the)\s+/gi, '')
            .replace(/\s+(and|but|or|so|because)\s+/gi, ' ')
            .replace(/\s+(a|an|the)\s+/gi, ' ');
          // If fragment is too long, split it
          if (fragment.length > 60) {
            const words = fragment.split(' ');
            const mid = Math.floor(words.length / 2);
            fragment = words.slice(0, mid).join(' ') + '\n' + words.slice(mid).join(' ');
          }
          result += fragment + '\n';
        }
        return result.trim();
      });
      
      return fragmentLines.filter(l => l).join('\n').trim();
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
