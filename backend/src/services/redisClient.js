import Redis from 'ioredis';

let redisPromise = null;

export async function getRedisClient() {
  const url = process.env.REDIS_URL || '';
  if (!url) return null;
  if (redisPromise) return redisPromise;
  redisPromise = (async () => {
    const client = new Redis(url, { lazyConnect: true });
    client.on('error', (err) => {
      console.error('Redis error', err.message);
    });
    await client.connect();
    return client;
  })().catch((err) => {
    console.error('Redis init failed', err.message);
    redisPromise = null;
    return null;
  });
  return redisPromise;
}

export async function redisHealth() {
  const client = await getRedisClient();
  if (!client) return { status: 'disabled' };
  try {
    const pong = await client.ping();
    return { status: 'ok', pong };
  } catch (e) {
    return { status: 'degraded', error: e.message };
  }
}

export async function closeRedisClient() {
  if (!redisPromise) return;
  try {
    const client = await redisPromise;
    await client?.quit();
  } catch (err) {
    console.warn('Redis shutdown failed', err?.message || err);
  } finally {
    redisPromise = null;
  }
}
