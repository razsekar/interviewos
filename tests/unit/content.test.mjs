import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile } from '../../tools/validate-content/validate.mjs';
import { renderDiagram } from '../../tools/lib/diagram.mjs';
import { createMarkdown, metaDescription, slugify } from '../../tools/build/lib.mjs';
import { wc } from '../../tools/lib/words.mjs';

const cats = [{ id: 'react' }];
const words = (n, p = 'word') => Array.from({ length: n }, (_, i) => p + i).join(' ');
const good = () => ({
  slug: 'a-question', title: 'A question?', topic: 'T', difficulty: 'beginner', type: 'conceptual', tags: ['x'], sourceType: 'new', sources: [],
  quick: words(70, 'q'), revision: words(20, 'r'), detailed: words(250), diagrams: [], followUps: [], related: [],
});

test('wc counts words', () => assert.equal(wc('  one  two\nthree '), 3));

test('validator accepts a well-formed question', () => {
  const r = validateFile({ category: 'react', questions: [good()] }, cats, 't.json');
  assert.deepEqual(r.errs, []);
});

test('validator rejects out-of-range answer styles and banned phrases', () => {
  const q = good();
  q.quick = words(10, 'q');
  q.revision = words(60, 'r');
  q.detailed = 'my resume says ' + words(250);
  const r = validateFile({ category: 'react', questions: [q] }, cats, 't.json');
  assert.ok(r.errs.some((e) => /quick/i.test(e)));
  assert.ok(r.errs.some((e) => /revision/i.test(e)));
  assert.ok(r.errs.some((e) => /personal-positioning/.test(e)));
});

test('validator catches missing diagram for a placeholder and unbalanced fences', () => {
  const q = good();
  q.detailed = '{{diagram:nope}} ' + words(250) + '\n```js\nunclosed';
  const r = validateFile({ category: 'react', questions: [q] }, cats, 't.json');
  assert.ok(r.errs.length >= 2, r.errs.join('|'));
});

const dg = { id: 'd', title: 'Flow', alt: 'A flow from client to server and back again.', direction: 'LR', nodes: [{ id: 'a', label: 'Client' }, { id: 'b', label: 'Server' }, { id: 'c', label: 'Database with a long label that wraps' }], edges: [{ from: 'a', to: 'b', label: 'req' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a', label: 'cycle' }] };

test('diagram renders accessible SVG, tolerates cycles, escapes labels', () => {
  const svg = renderDiagram({ ...dg, nodes: [{ id: 'a', label: '<script>x</script>' }, ...dg.nodes.slice(1)] });
  assert.match(svg, /<svg[^>]+role="img"/);
  assert.match(svg, /<title id="[^"]+">Flow<\/title>/);
  assert.ok(!svg.includes('<script>'));
  assert.ok(!/NaN|undefined/.test(svg));
  assert.equal((svg.match(/class="dg-node"/g) || []).length, 3);
});

test('diagram TB direction produces a taller-than-wide layout for a chain', () => {
  const svg = renderDiagram({ ...dg, direction: 'TB', edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] });
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(Number(h) > Number(w) * 0.8);
});

test('markdown escapes raw HTML, drops unsafe links, wraps tables, places diagrams', () => {
  const m = createMarkdown();
  const { html, headings } = m.render('## Title\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [ok](https://example.com)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n{{diagram:d}}\n', [dg]);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /table-wrap/);
  assert.match(html, /<figure class="diagram">/);
  assert.deepEqual(headings.map((h) => h.id), ['title']);
});

test('metaDescription trims on sentence or word boundaries; slugify is stable', () => {
  const long = 'First sentence is here and fine. ' + 'word '.repeat(80);
  const d = metaDescription(long);
  assert.ok(d.length <= 160);
  assert.equal(slugify('Hello, World! `x`'), 'hello-world-x');
});
