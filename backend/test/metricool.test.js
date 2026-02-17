import test from 'node:test';
import assert from 'node:assert';

process.env.NODE_ENV = 'test';
process.env.AI_API_KEY = '';
process.env.WEBHOOK_AUTH_TOKEN = 'test-token';

const { createServer } = await import('../src/server.js');

const AUTH = { authorization: 'Bearer test-token' };

test('health returns status ok', async () => {
  const app = createServer();
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.ai_key_set, false);
  assert.equal(body.webhook_configured, true);
});

test('webhook rejects missing auth token', async () => {
  const app = createServer();
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/webhook',
    payload: { text: 'hello' },
  });
  assert.equal(res.statusCode, 401);
});

test('webhook rejects wrong auth token', async () => {
  const app = createServer();
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/webhook',
    payload: { text: 'hello' },
    headers: { authorization: 'Bearer wrong-token' },
  });
  assert.equal(res.statusCode, 401);
});

test('webhook accepts valid token and posts announcement', async () => {
  const app = createServer();
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/webhook',
    payload: { text: 'New feature launched on Qubic!' },
    headers: AUTH,
  });
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.status, 'posted');
  assert.ok(typeof data.channels_posted === 'number');
  assert.ok(data.rewritten);
});

test('webhook accepts nested post.text format', async () => {
  const app = createServer();
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/webhook',
    payload: { post: { text: 'Qubic update incoming' } },
    headers: AUTH,
  });
  assert.equal(res.statusCode, 200);
  const data = res.json();
  assert.equal(data.status, 'posted');
});

test('webhook rejects empty post text', async () => {
  const app = createServer();
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/webhook',
    payload: { text: '' },
    headers: AUTH,
  });
  assert.equal(res.statusCode, 400);
});
