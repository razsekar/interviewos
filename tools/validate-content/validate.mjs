// Usage: node tools/validate-content/validate.mjs [files...]   (default: all content/questions/*.json)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { wc } from '../lib/words.mjs';
import { bannedRegex } from '../lib/banned.mjs';

const BANNED = bannedRegex();

const DIFF = ['beginner', 'intermediate', 'advanced'];
const TYPES = ['conceptual', 'comparison', 'scenario', 'design', 'coding'];
const SRC = ['reference-derived', 'enhanced', 'new'];

export function validateFile(doc, cats, file = '') {
  const errs = [], warns = [];
  const e = (m) => errs.push(`${file}: ${m}`), w = (m) => warns.push(`${file}: ${m}`);
  if (!cats.some((c) => c.id === doc.category)) e(`unknown category "${doc.category}"`);
  if (!Array.isArray(doc.questions) || !doc.questions.length) { e('questions[] missing/empty'); return { errs, warns }; }
  const seen = new Set();
  for (const q of doc.questions) {
    const at = `[${q.slug || '?'}]`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.slug || '')) e(`${at} bad slug`);
    if (seen.has(q.slug)) e(`${at} duplicate slug in file`); seen.add(q.slug);
    if (!q.title || q.title.length < 8) e(`${at} title missing`);
    if (!q.topic) e(`${at} topic missing`);
    if (!DIFF.includes(q.difficulty)) e(`${at} difficulty`);
    if (!TYPES.includes(q.type)) e(`${at} type`);
    if (!SRC.includes(q.sourceType)) e(`${at} sourceType`);
    if (!Array.isArray(q.tags) || !q.tags.length) e(`${at} tags`);
    if (!Array.isArray(q.sources) || (q.sourceType !== 'new' && !q.sources.length)) e(`${at} sources`);
    const qw = wc(q.quick), rw = wc(q.revision), dw = wc(q.detailed);
    if (qw < 45 || qw > 115) e(`${at} quick has ${qw} words (need 45-115, aim 60-100)`);
    if (rw < 8 || rw > 36) e(`${at} revision has ${rw} words (need 8-36, aim 15-30)`);
    if (dw < 120) e(`${at} detailed has ${dw} words (need >=120)`);
    else if (dw < 220) w(`${at} detailed is short (${dw} words)`);
    if (q.quick && q.detailed && q.quick.trim() === q.detailed.trim().slice(0, q.quick.length)) e(`${at} quick is a truncation of detailed`);
    if (BANNED && BANNED.test(JSON.stringify({ ...q, sources: undefined }))) e(`${at} contains a banned private term - use generic wording`);
    if (/I haven't|my resume|your resume|hands-on with/i.test(JSON.stringify(q))) e(`${at} contains personal-positioning language`);
    const ids = new Set();
    for (const d of q.diagrams || []) {
      if (!d.id || ids.has(d.id)) e(`${at} diagram id`); ids.add(d.id);
      if (!d.title || !d.alt || d.alt.length < 30) e(`${at} diagram ${d.id} needs title and alt (>=30 chars)`);
      if (!['LR', 'TB'].includes(d.direction)) e(`${at} diagram ${d.id} direction`);
      const n = new Set((d.nodes || []).map((x) => x.id));
      if (n.size < 2 || n.size > 14) e(`${at} diagram ${d.id} needs 2-14 nodes`);
      for (const ed of d.edges || []) if (!n.has(ed.from) || !n.has(ed.to)) e(`${at} diagram ${d.id} edge ${ed.from}->${ed.to} unknown node`);
    }
    for (const m of (q.detailed || '').matchAll(/\{\{diagram:([a-z0-9-]+)\}\}/g)) if (!ids.has(m[1])) e(`${at} placeholder ${m[1]} has no diagram`);
    for (const d of ids) if (!(q.detailed || '').includes(`{{diagram:${d}}}`)) w(`${at} diagram ${d} not placed in detailed`);
    const fences = ((q.detailed || '').match(/```/g) || []).length;
    if (fences % 2) e(`${at} unbalanced code fence`);
    if (!Array.isArray(q.followUps)) w(`${at} followUps missing`);
  }
  return { errs, warns };
}

/** Checks that span files: unique slugs and titles per category, and every related slug resolves. */
export function crossCheck(docs) {
  const errs = [], warns = [];
  const slugs = new Map(); // category -> Set
  const titles = new Map();
  for (const { file, doc } of docs) {
    const set = slugs.get(doc.category) || slugs.set(doc.category, new Set()).get(doc.category);
    for (const q of doc.questions || []) {
      if (set.has(q.slug)) errs.push(`${file}: [${q.slug}] duplicate slug within category ${doc.category}`);
      set.add(q.slug);
      const key = doc.category + '|' + (q.title || '').toLowerCase().trim();
      if (titles.has(key)) errs.push(`${file}: [${q.slug}] duplicate title within category (also in ${titles.get(key)})`);
      titles.set(key, file);
    }
  }
  for (const { file, doc } of docs) {
    for (const q of doc.questions || []) {
      for (const r of q.related || []) if (!slugs.get(doc.category)?.has(r)) errs.push(`${file}: [${q.slug}] related "${r}" does not exist in ${doc.category}`);
      if ((q.related || []).includes(q.slug)) errs.push(`${file}: [${q.slug}] relates to itself`);
    }
  }
  return { errs, warns };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cats = JSON.parse(await readFile('content/categories.json', 'utf8'));
  let files = process.argv.slice(2);
  if (!files.length) files = (await readdir('content/questions')).filter((f) => f.endsWith('.json')).map((f) => path.join('content/questions', f));
  let E = 0, W = 0, N = 0;
  const parsed = [];
  for (const f of files) {
    let doc; try { doc = JSON.parse(await readFile(f, 'utf8')); } catch (x) { console.log(`${f}: INVALID JSON ${x.message}`); E++; continue; }
    parsed.push({ file: path.basename(f), doc });
    const { errs, warns } = validateFile(doc, cats, path.basename(f));
    errs.forEach((x) => console.log('ERROR', x)); warns.forEach((x) => console.log('warn ', x));
    E += errs.length; W += warns.length; N += doc.questions?.length || 0;
  }
  const x = crossCheck(parsed);
  x.errs.forEach((m) => console.log('ERROR', m));
  E += x.errs.length;
  console.log(`${files.length} files, ${N} questions, ${E} errors, ${W} warnings`);
  process.exit(E ? 1 : 0);
}
