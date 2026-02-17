import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { redisHealth, closeRedisClient } from './services/redisClient.js';
import { startDiscordGateway, stopDiscordGateway, postToAnnounceChannels, pendingApprovals, getApprovalMode, setLastWebhookPost } from './discordBot.js';
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

function getDefaultStyle() {
  return process.env.DEFAULT_STYLE || 'Professional, confident, concise crypto-native tone.';
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

    // Store for /draft command
    setLastWebhookPost(postText, postUrl);

    try {
      const rewritten = await generateAnnouncement(
        `Rewrite this for Discord:\n\n${postText}${postUrl ? `\n\nOriginal post URL: ${postUrl}` : ''}`,
        getDefaultStyle(),
      );

      // If approval mode is on, queue for admin approval instead of auto-posting
      if (getApprovalMode()) {
        const approvalId = `w-${Date.now()}`;
        pendingApprovals.set(approvalId, {
          text: postText,
          rewritten,
          url: postUrl,
          timestamp: Date.now(),
        });
        request.log.info({ approvalId }, 'webhook post queued for approval');
        return { status: 'pending_approval', approvalId, preview: rewritten.slice(0, 200) };
      }

      // Safety: reject AI output that looks like a meta/help response instead of a real announcement
      const lowerRewritten = rewritten.toLowerCase();
      if (
        lowerRewritten.includes('i don\'t see any') ||
        lowerRewritten.includes('could you provide') ||
        lowerRewritten.includes('i\'m ready to help') ||
        lowerRewritten.includes('please provide') ||
        lowerRewritten.includes('drop the content') ||
        lowerRewritten.includes('share the post') ||
        lowerRewritten.includes('once you share')
      ) {
        request.log.warn({ rewritten: rewritten.slice(0, 200) }, 'AI returned meta/help response instead of announcement — blocked');
        return reply.status(422).send({ error: 'AI did not produce a valid announcement from the input' });
      }

      const posted = await postToAnnounceChannels(rewritten, request.log, { url: postUrl });
      request.log.info({ channels: posted }, 'announcement posted to discord');
      return { status: 'posted', rewritten, channels_posted: posted };
    } catch (err) {
      request.log.error({ err }, 'announcement failed');
      return reply.status(500).send({ error: 'announcement generation failed' });
    }
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
