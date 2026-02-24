import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Fastify from 'fastify';
import { randomUUID, createHash } from 'node:crypto';
import { redisHealth, closeRedisClient } from './services/redisClient.js';
import { startDiscordGateway, stopDiscordGateway, postToAnnounceChannels, pendingApprovals, getApprovalMode, setLastWebhookPost, sendApprovalReview } from './discordBot.js';
import { generateAnnouncement } from './services/announcer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

// Configuration
const PORT = Number(process.env.PORT || 3000);

function getAiConfig() {
  return {
    key: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
  };
}

function getWebhookAuthToken() {
  return process.env.WEBHOOK_AUTH_TOKEN || '';
}

// --- Dedup: prevent same source text from posting twice within the window ---
const DEDUP_WINDOW_MS = 180_000; // 3 minutes
const recentHashes = new Map(); // hash -> timestamp

// --- Global cooldown: block ALL webhooks for N seconds after one is accepted ---
const GLOBAL_COOLDOWN_MS = 30_000; // 30 seconds
let lastWebhookAcceptedAt = 0;

function textHash(text) {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function isDuplicate(text) {
  const hash = textHash(text);
  const now = Date.now();
  // Purge expired entries
  for (const [h, ts] of recentHashes) {
    if (now - ts > DEDUP_WINDOW_MS) recentHashes.delete(h);
  }
  // Already seen — duplicate
  if (recentHashes.has(hash)) return true;
  // Register immediately (before async AI work) to block concurrent duplicates
  recentHashes.set(hash, now);
  return false;
}

function releaseHash(text) {
  recentHashes.delete(textHash(text));
}

// --- X/Twitter URL gate: only accept webhooks with a valid X post link ---
const X_URL_PATTERN = /https?:\/\/(x\.com|twitter\.com)\/[^\s]+/i;

function hasValidXUrl(url) {
  if (!url) return false;
  return X_URL_PATTERN.test(url);
}

function createServer() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.addHook('onRequest', async (req, reply) => {
    const reqId = req.id || randomUUID();
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.ip;
    const userAgent = req.headers['user-agent'] || '';
    req.log = app.log.child({ reqId, ip: clientIp, ua: userAgent });
    reply._timingsStart = Date.now();
    req.log.info({ method: req.method, url: req.url }, 'request.start');
  });

  app.addHook('onResponse', async (req, reply) => {
    const duration = Date.now() - (reply._timingsStart || Date.now());
    req.log.info({ status: reply.statusCode, duration_ms: duration }, 'request.end');
  });

  // --- Health ---
  app.get('/health', async () => {
    try {
      const ai = getAiConfig();
      const redis = await redisHealth();
      return {
        status: 'ok',
        ai_key_set: Boolean(ai.key),
        ai_model: ai.model,
        webhook_configured: Boolean(getWebhookAuthToken()),
        redis: redis.status,
      };
    } catch (e) {
      return { status: 'degraded', error: e.message };
    }
  });

  // --- Webhook: receives posts from Zapier (Metricool → Zapier → here) ---
  app.post('/webhook', async (request, reply) => {
    // Bearer token auth
    const webhookAuthToken = getWebhookAuthToken();
    if (!webhookAuthToken) {
      return reply.status(503).send({ error: 'WEBHOOK_AUTH_TOKEN not configured' });
    }
    const auth = request.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (token !== webhookAuthToken) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    let data;
    try {
      data = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    } catch {
      return reply.status(400).send({ error: 'invalid JSON body' });
    }

    // Log the full payload for debugging
    request.log.info({ payload: data }, 'webhook payload received');

    // Accept flexible payload: { text: "..." } or { post: { text: "..." } }
    const postText = (data?.text || data?.post?.text || data?.message || '').trim();
    if (!postText || postText.length < 20) {
      return reply.status(400).send({ error: 'no post text found or too short (min 20 chars, send { text: "..." })' });
    }

    const postUrl = data?.url || data?.post?.url || data?.link || null;

    // X/Twitter URL gate: only process webhooks that include a valid X post link
    if (!hasValidXUrl(postUrl)) {
      request.log.warn({ postUrl, postText: postText.slice(0, 80) }, 'webhook rejected: no valid X/Twitter URL');
      return reply.status(400).send({ error: 'rejected: webhook must include a valid x.com or twitter.com URL' });
    }

    // Global cooldown: block rapid-fire webhooks regardless of content
    const now = Date.now();
    if (now - lastWebhookAcceptedAt < GLOBAL_COOLDOWN_MS) {
      request.log.warn({ postText: postText.slice(0, 80), cooldownRemaining: GLOBAL_COOLDOWN_MS - (now - lastWebhookAcceptedAt) }, 'webhook blocked by global cooldown');
      return reply.status(429).send({ error: 'cooldown: another webhook was just processed, try again later' });
    }

    // Dedup: block same source text within 3 min (prevents Zapier double-fire + concurrent race)
    if (isDuplicate(postText)) {
      request.log.warn({ postText: postText.slice(0, 80) }, 'duplicate webhook payload blocked');
      return reply.status(429).send({ error: 'duplicate: same post received within dedup window' });
    }

    // Mark cooldown immediately so concurrent/rapid webhooks are blocked
    lastWebhookAcceptedAt = Date.now();

    // Always store for /draft command
    setLastWebhookPost(postText, postUrl);

    // Generate AI rewrite
    let rewritten;
    try {
      rewritten = await generateAnnouncement(
        `${postText}${postUrl ? `\n\nOriginal post URL: ${postUrl}` : ''}`,
        process.env.DEFAULT_STYLE || 'Professional, confident, concise crypto-native tone.',
      );
    } catch (err) {
      request.log.error({ err }, 'AI generation failed');
      releaseHash(postText); // allow retry if AI fails
      return reply.status(500).send({ error: 'announcement generation failed' });
    }

    // Safety: block AI meta/help responses
    const lower = rewritten.toLowerCase();
    if (
      lower.includes('i don\'t see any') ||
      lower.includes('could you provide') ||
      lower.includes('i\'m ready to help') ||
      lower.includes('please provide') ||
      lower.includes('drop the content') ||
      lower.includes('share the post') ||
      lower.includes('once you share')
    ) {
      request.log.warn({ rewritten: rewritten.slice(0, 200) }, 'AI returned meta response - blocked');
      return reply.status(422).send({ error: 'AI did not produce a valid announcement' });
    }

    // --- Approval gate ---
    if (getApprovalMode()) {
      const approvalId = `w-${Date.now()}`;
      pendingApprovals.set(approvalId, {
        text: postText,
        rewritten,
        url: postUrl,
        timestamp: Date.now(),
      });
      // Send review with Post/Reject buttons to the command channel (not announce channel)
      await sendApprovalReview(approvalId, rewritten, postUrl, request.log);
      return { status: 'pending_review', approvalId, preview: rewritten.slice(0, 200) };
    }

    // Approval OFF: auto-post directly
    const posted = await postToAnnounceChannels(rewritten, request.log, { url: postUrl });
    request.log.info({ channels: posted }, 'webhook auto-posted (approval off)');
    return { status: 'posted', channels_posted: posted };
  });

  return app;
}

const fastify = createServer();

if (process.env.DISCORD_GATEWAY_ENABLED === 'true') {
  startDiscordGateway({ logger: fastify.log });
}

async function shutdown(signal, code = 0) {
  fastify.log.info({ signal }, 'shutdown requested');
  const forceTimer = setTimeout(() => {
    fastify.log.error('shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceTimer.unref?.();
  try {
    stopDiscordGateway();
    await fastify.close();
    await closeRedisClient();
    clearTimeout(forceTimer);
    process.exit(code);
  } catch (err) {
    fastify.log.error({ err }, 'error during shutdown');
    clearTimeout(forceTimer);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    fastify.log.info(`Backend listening at ${address}`);
  });
  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });
  process.on('unhandledRejection', (err) => {
    fastify.log.error({ err }, 'unhandled rejection');
    shutdown('unhandledRejection', 1);
  });
}

export { fastify, createServer };
