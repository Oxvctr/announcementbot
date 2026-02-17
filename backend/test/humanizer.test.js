import test from 'node:test';
import assert from 'node:assert';

process.env.HUMANIZER_EMOJI_CHANCE = '1'; // force emoji for deterministic test
process.env.HUMANIZER_MIN_DELAY_MS = '10';
process.env.HUMANIZER_MAX_DELAY_MS = '20';

const { humanDelay, humanizeText, humanPost } = await import('../src/services/humanizer.js');

test('humanDelay resolves within configured range', async () => {
  const start = Date.now();
  await humanDelay();
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 8, `delay too short: ${elapsed}ms`);
  assert.ok(elapsed < 200, `delay too long: ${elapsed}ms`);
});

test('humanizeText collapses triple newlines', () => {
  const input = 'line1\n\n\n\nline2';
  const result = humanizeText(input);
  assert.ok(!result.includes('\n\n\n'), 'triple newlines should be collapsed');
  assert.ok(result.includes('line1\n\nline2'), 'double newline preserved');
});

test('humanizeText appends emoji when chance is 1', () => {
  const result = humanizeText('hello world');
  const emojis = ['🚀', '🔥', '⚡', '🧠', '📈', '✨'];
  const hasEmoji = emojis.some((e) => result.includes(e));
  assert.ok(hasEmoji, `expected emoji in: "${result}"`);
});

test('humanizeText handles non-string input', () => {
  assert.equal(humanizeText(null), '');
  assert.equal(humanizeText(undefined), '');
  assert.equal(humanizeText(42), '');
});

test('humanPost calls sendTyping then send', async () => {
  const calls = [];
  const mockChannel = {
    sendTyping: async () => calls.push('typing'),
    send: async (content) => {
      calls.push('send');
      return { content };
    },
  };
  const msg = await humanPost(mockChannel, 'test message');
  assert.deepStrictEqual(calls, ['typing', 'send']);
  assert.ok(msg.content.includes('test message'));
});
