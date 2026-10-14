import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BANNED_TERMS = 'Acme Motors, Zed Corp';
const { validateFile, crossCheck } = await import('../../tools/validate-content/validate.mjs?banned');
const { bannedRegex } = await import('../../tools/lib/banned.mjs?x');
const { aliasFromFile } = await import('../../tools/lib/aliases.mjs');

const words = (n, p) => Array.from({ length: n }, (_, i) => p + i).join(' ');
const q = (over = {}) => ({ slug: 'a-q', title: 'A question?', topic: 'T', difficulty: 'beginner', type: 'conceptual', tags: ['x'], sourceType: 'enhanced', sources: [{ file: 'ref-x', pages: [1] }], quick: words(70, 'q'), revision: words(20, 'r'), detailed: words(250, 'd'), diagrams: [], followUps: [], related: [], ...over });

test('banned private terms fail validation anywhere in a question, but not in source aliases', () => {
  assert.equal(validateFile({ category: 'react', questions: [q()] }, [{ id: 'react' }], 'f').errs.length, 0);
  const r = validateFile({ category: 'react', questions: [q({ detailed: words(250, 'd') + ' ask Acme Motors' })] }, [{ id: 'react' }], 'f');
  assert.ok(r.errs.some((e) => /banned private term/.test(e)));
  assert.ok(bannedRegex().test('at zed corp.') === false && bannedRegex().test('at Zed Corp.'));
});

test('source file names are aliased without private words', () => {
  assert.equal(aliasFromFile('AWS _ Cloud — Interview Preparation.pdf'), 'ref-aws-cloud');
  assert.equal(aliasFromFile('Apigee — Deep Interview Preparation.pdf'), 'ref-apigee');
});

test('crossCheck finds duplicate slugs/titles and dangling related links', () => {
  const docs = [
    { file: 'a.json', doc: { category: 'c', questions: [q({ slug: 'one', related: ['two', 'ghost'] }), q({ slug: 'two', title: 'Another one?' })] } },
    { file: 'b.json', doc: { category: 'c', questions: [q({ slug: 'one', title: 'Third?' }), q({ slug: 'four', title: 'Another one?' })] } },
  ];
  const e = crossCheck(docs).errs.join('\n');
  assert.match(e, /duplicate slug/);
  assert.match(e, /duplicate title/);
  assert.match(e, /related "ghost"/);
});

test('companies must be a non-empty list of known company ids', () => {
  const run = (companies) => validateFile({ category: 'react', questions: [q({ companies })] }, [{ id: 'react' }], 'f', ['acme']).errs.filter((e) => /companies/.test(e));
  assert.equal(run(['acme']).length, 0);
  assert.equal(run(undefined).length, 0);
  assert.equal(run(['nope']).length, 1);
  assert.equal(run([]).length, 1);
  assert.equal(run('acme').length, 1);
});
