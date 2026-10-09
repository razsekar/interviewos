import test from 'node:test';
import assert from 'node:assert/strict';
import { searchDocs, tokenize } from '../../src/app/js/search.js';
import { chunkText } from '../../src/app/js/audio.js';

const docs = [
  ['react/a', 'What is a React component?', 'React Fundamentals', 'react components', 'building blocks of ui'],
  ['cdn/b', 'How does cache invalidation work?', 'CDN', 'cache cdn', 'purge a react asset'],
  ['rest/c', 'Idempotency keys', 'REST', 'idempotency', 'retry safe posts'],
];

test('tokenize lowercases and splits', () => assert.deepEqual(tokenize('Hello, C++ and .NET!'), ['hello', 'c++', 'and', '.net']));
test('empty query returns null (no filtering)', () => assert.equal(searchDocs(docs, '  '), null));
test('AND semantics and ranking: title hits beat body hits', () => {
  assert.deepEqual(searchDocs(docs, 'react'), ['react/a', 'cdn/b']);
  assert.deepEqual(searchDocs(docs, 'react cache'), ['cdn/b']);
  assert.deepEqual(searchDocs(docs, 'zzz'), []);
});
test('chunkText keeps chunks short and loses no words', () => {
  const text = 'One short sentence. ' + 'A very long sentence without punctuation '.repeat(20) + 'Last one.';
  const chunks = chunkText(text, 100);
  assert.ok(chunks.every((c) => c.length <= 110), chunks.map((c) => c.length).join());
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').split(' ').length, text.replace(/\s+/g, ' ').trim().split(' ').length);
});
