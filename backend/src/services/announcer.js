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
    'EXAMPLE OUTPUT (follow these exact templates):',
    '',
    'TEMPLATE 1 - REPLY TIMING SECRET:',
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
    'TEMPLATE 2 - CONVERSATION DEPTH:',
    '🚨 Qubic Oracle Machines are now live 🔥',
    'Live market data → smart contracts',
    'Verified by 676 Computators',
    'Every oracle call burns $QUBIC',
    '',
    'Thread:',
    'https://x.com/Qubic/status/2021638947453943977',
    '',
    '🔐 Algo Insight:',
    'X measures reply depth, not just count.',
    'If replies trigger follow-up replies,',
    'the system labels it "high retention conversation."',
    'Single-layer comments = weak.',
    'Threaded back-and-forth = amplification.',
    'Ask a real question.',
    'Spark a second reply.',
    'That\'s the unlock.',
    '',
    'Tag @_Qubic_ 👇',
    '$QUBIC',
    '',
    'TEMPLATE 3 - BOOKMARK VELOCITY:',
    '🚨 Qubic Oracle Machines are LIVE 🔥',
    '676 Computors verifying real-world data.',
    'Every oracle call burns $QUBIC permanently.',
    '',
    'Thread:',
    'https://x.com/Qubic/status/2021638947453943977',
    '',
    '🔐 Underused Algo Lever:',
    'Bookmarks extend lifespan.',
    'When bookmarks spike early,',
    'X assumes "future reference value"',
    'and keeps testing the post longer.',
    'Most people ignore this.',
    'They shouldn\'t.',
    'Reply. Quote.',
    'But also bookmark.',
    'It quietly extends reach.',
    '',
    'Tag @_Qubic_ 👇',
    '$QUBIC',
    '',
    'TEMPLATE 4 - SCROLL STOP:',
    '🚨 COMMUNITY ALERT: Oracles are LIVE 🔥',
    'Smart contracts now consume real-world data natively.',
    'Each query burns $QUBIC.',
    '',
    'Thread:',
    'https://x.com/Qubic/status/2021638947453943977',
    '',
    '🔐 What Actually Unlocks Reach:',
    'Scroll-stop time.',
    'If users pause longer before interacting,',
    'X boosts the post.',
    'How to trigger that?',
    'Screenshots. Charts. Comparisons.',
    'Not just text replies.',
    'If quoting, add a visual.',
    'It increases dwell time.',
    'That\'s the hidden boost.',
    '',
    'Tag @_Qubic_ 👇',
    '$QUBIC #OracleMachines',
    '',
    'TEMPLATE 5 - ENGAGEMENT ORDER:',
    '🚨 Qubic Oracle Machines are live 🔥',
    'Verified by 676 Computors.',
    'Every query burns $QUBIC.',
    '',
    'Thread:',
    'https://x.com/Qubic/status/202163894745394397',
    '',
    '🔐 Tactical Insight:',
    'Engagement order matters.',
    'Reply first.',
    'Quote second.',
    'Like last.',
    'If likes come before replies,',
    'X assumes passive interest.',
    'If replies lead,',
    'it assumes active conversation.',
    'Sequence changes scoring.',
    'Engage accordingly.',
    '',
    'Tag @_Qubic_ 👇',
    '$QUBIC',
    '',
    'TEMPLATE 6 - NETWORK SPREAD:',
    '🚨 COMMUNITY UPDATE: Oracles are LIVE 🔥',
    'Real-world data now feeds Qubic contracts directly.',
    'Each call burns $QUBIC.',
    '',
    'Thread:',
    'https://x.com/Qubic/status/2021638947453943977',
    '',
    '🔐 Algorithm Reality:',
    'X boosts cross-network interaction.',
    'If replies come from different social graphs,',
    'the system expands distribution pools.',
    'Same small circle = limited reach.',
    'Diverse accounts replying = expansion.',
    'One strong reply from you matters.',
    '',
    'Tag @_Qubic_ 👇',
    '$QUBIC #OracleMachines',
    '',
    'TEMPLATE 7 - FIRST 30 MINUTES:',
    '🚨 Qubic Oracle Machines are LIVE 🔥',
    'Smart contracts + real-world data.',
    'Verified by 676 Computors.',
    'Each query burns $QUBIC.',
    '',
    'Thread:',
    'https://x.com/Qubic/status/2021638947453943977',
    '',
    '🔐 The 30-Minute Rule:',
    'If meaningful engagement crosses a threshold',
    'in the first 30 minutes,',
    'X shifts the post into discovery feeds.',
    'Miss that window,',
    'and reach compresses.',
    'Early action compounds.',
    'Late action barely registers.',
    'Engage fast.',
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
