import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// vinext's Link prefetching looks up the navigation chunk's exports by name, but the production
// build renames them, so a click on a Link does nothing under `npm run serve`. Plain anchors work.
function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'ui' ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test('pages navigate with plain anchors, never next/link', () => {
  const offenders = [...sources('app'), ...sources('components')].filter(file => /from ["']next\/link["']/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});
