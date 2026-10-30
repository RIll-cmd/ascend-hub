import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from '../../scripts/cloudflare-stub-hook.mjs';

test('cloudflare:workers resolves to an empty module, so optional tracing stays off', async () => {
  const { url } = await resolve('cloudflare:workers', {}, () => assert.fail('must not reach the default resolver'));
  assert.equal(Reflect.get(await import(url), 'tracing'), undefined);
});

test('every other import goes to the default resolver', async () => {
  const seen = await resolve('node:fs', { a: 1 }, (specifier, context) => ({ specifier, context }));
  assert.deepEqual(seen, { specifier: 'node:fs', context: { a: 1 } });
});
