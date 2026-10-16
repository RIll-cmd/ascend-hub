import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

test('the framed poster links to the agent room with an accessible name', () => {
  const poster = page.slice(page.indexOf('slot.isPoster ?'), page.indexOf('framed-poster-art'));
  assert.match(poster, /<a\s/, 'a plain anchor: vinext Link does nothing on click in production builds');
  assert.match(poster, /href="\/room"/);
  assert.match(poster, /aria-label="Enter the agent room"/);
  assert.match(poster, /if \(edit\) event\.preventDefault\(\)/);
});

test('the poster has a visible keyboard focus ring', () => {
  assert.match(css, /\.framed-poster:focus-visible\s*\{[^}]*outline:\s*3px solid/);
});
