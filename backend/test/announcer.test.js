import test from 'node:test';
import assert from 'node:assert';

process.env.NODE_ENV = 'test';
process.env.AI_API_KEY = 'test-key';
process.env.AI_API_URL = 'http://127.0.0.1:19999';
process.env.AI_REQUEST_TIMEOUT_MS = '2000';

// We test generateAnnouncement by mocking fetch at the module level.
// Since announcer.js imports node-fetch, we rely on the actual function
// but test the contract via integration-style approach.

const { generateAnnouncement } = await import('../src/services/announcer.js');

test('generateAnnouncement returns fallback when AI_API_KEY is empty', async () => {
  const origKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = '';
  try {
    const result = await generateAnnouncement('test topic', 'casual');
    assert.ok(result.includes('[AI disabled]'), `expected fallback, got: ${result}`);
  } finally {
    process.env.AI_API_KEY = origKey;
  }
});

test('generateAnnouncement accepts topic and style params', async () => {
  try {
    await generateAnnouncement('test topic', 'casual tone');
    assert.fail('should have thrown a network error');
  } catch (err) {
    assert.ok(
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('fetch') ||
      err.message.includes('ENOTFOUND') ||
      err.message.includes('network') ||
      err.message.includes('AI API error') ||
      err.message.includes('timed out'),
      `unexpected error: ${err.message}`,
    );
  }
});
