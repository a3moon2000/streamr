const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function getIndexScriptBlock() {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  const match = scripts.find((entry) => entry[1].includes('function isCatalogRecordValid'));
  if (!match) throw new Error('isCatalogRecordValid is missing from index.html');
  return match[1];
}

function extractFunction(script, functionName) {
  const marker = `function ${functionName}(`;
  const start = script.indexOf(marker);
  if (start < 0) throw new Error(`Could not locate ${functionName}`);

  const openIndex = script.indexOf('{', start);
  if (openIndex < 0) throw new Error(`Malformed ${functionName} declaration`);

  let depth = 0;
  let i = openIndex;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (; i < script.length; i++) {
    const ch = script[i];
    const next = script[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }

    if (inSingle) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === '\'') {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === '`') {
        inTemplate = false;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === '\'') {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return script.slice(start, i + 1);
    }
  }

  throw new Error(`Failed to parse ${functionName}`);
}

function loadCatalogValidator() {
  const script = getIndexScriptBlock();
  const helper = extractFunction(script, 'catalogTypeOf');
  const fn = extractFunction(script, 'isCatalogRecordValid');
  const source = `${helper}\n\n${fn}`;
  const sandbox = { Number, String };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'index-inline.js' });
  return sandbox.isCatalogRecordValid;
}

const isCatalogRecordValid = loadCatalogValidator();

test('isCatalogRecordValid accepts tv detail Scripted type with tv hint', () => {
  assert.equal(isCatalogRecordValid({ id: 62852, name: 'Billions', type: 'Scripted' }, 'tv'), true);
});

test('isCatalogRecordValid rejects recognized media conflict with recognized hint', () => {
  assert.equal(isCatalogRecordValid({ id: 1, name: 'Wrong', type: 'tv', media_type: 'movie' }, 'tv'), false);
  assert.equal(isCatalogRecordValid({ id: 2, title: 'Wrong', media_type: 'movie' }, 'tv'), false);
  assert.equal(isCatalogRecordValid({ id: 3, title: 'Wrong', type: 'movie' }, 'tv'), false);
});

test('isCatalogRecordValid rejects internal media_type/type conflicts when both are recognized', () => {
  assert.equal(isCatalogRecordValid({ id: 4, title: 'Wrong', type: 'movie', media_type: 'tv' }, 'tv'), false);
  assert.equal(isCatalogRecordValid({ id: 5, name: 'Wrong', media_type: 'movie', type: 'tv' }, 'tv'), false);
});

test('isCatalogRecordValid rejects malformed records with missing title', () => {
  assert.equal(isCatalogRecordValid({ id: 6, type: 'tv' }, 'tv'), false);
});

test('isCatalogRecordValid accepts normal movie and tv records', () => {
  assert.equal(isCatalogRecordValid({ id: 7, title: 'Good Movie', media_type: 'movie' }, 'movie'), true);
  assert.equal(isCatalogRecordValid({ id: 8, name: 'Good TV', media_type: 'tv' }, 'tv'), true);
});
