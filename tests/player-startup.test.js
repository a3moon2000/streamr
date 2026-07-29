const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const indexPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((entry) => entry[1]);
const playerScript = scripts.find((entry) => entry.includes('function loadPlayer('));
if (!playerScript) throw new Error('Could not locate loadPlayer in index.html');

function getFunctionSource(script, functionName) {
  const marker = `function ${functionName}(`;
  const start = script.indexOf(marker);
  if (start < 0) throw new Error(`Could not locate ${functionName}`);

  const openIndex = script.indexOf('{', start);
  if (openIndex < 0) throw new Error(`Could not parse ${functionName}`);

  let depth = 0;
  let i = openIndex;
  for (; i < script.length; i++) {
    const ch = script[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return script.slice(start, i + 1);
    }
  }

  throw new Error(`Failed to extract ${functionName}`);
}

const loadPlayerSource = getFunctionSource(playerScript, 'loadPlayer');
const watchSource = getFunctionSource(playerScript, 'armPlayerLoadWatch');
const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
const head = headMatch ? headMatch[0] : '';

test('player startup keeps VidLux hints for app-controlled connection setup', () => {
  const vidluxPreconnect = head.match(/<link[^>]*rel="preconnect"[^>]*href="https:\/\/vidlux\.online"[^>]*>/i);
  assert.ok(vidluxPreconnect, 'VidLux preconnect hint is required');
  const preconnectTag = (vidluxPreconnect && vidluxPreconnect[0]) || '';
  assert.equal(/crossorigin/i.test(preconnectTag), false, 'VidLux preconnect must not include crossorigin');
  assert.match(preconnectTag, /<link\s+rel="preconnect"\s+href="https:\/\/vidlux\.online"\s*>/i);
  assert.match(
    head,
    /<link[^>]*rel="dns-prefetch"[^>]*href="https:\/\/vidlux\.online"[^>]*>/i
  );
});

test('player iframe load handler keeps unmute scheduling and reveals on next frame without 700ms timeout', () => {
  const loadSnippet = html.match(/iframe\.addEventListener\(\s*['"]load['"]\s*,\s*function\s*\(\)\s*\{[\s\S]*?\}\);?/);
  assert.ok(loadSnippet, 'iframe load handler snippet missing');

  const handler = loadSnippet[0];
  assert.match(handler, /schedulePlayerUnmute\(\);/);
  assert.match(handler, /requestAnimationFrame\(revealPlayerEmbed\);/);
  assert.equal(/setTimeout\(revealPlayerEmbed\s*,\s*700\)/.test(handler), false);
});

test('player watchdog keeps its 15s timeout behavior', () => {
  assert.match(watchSource, /var failMs = 15000;/);
  assert.match(watchSource, /playerLoadTimer = setTimeout\(function\(\)\s*\{/);
  assert.match(watchSource, /failMs/);
});
