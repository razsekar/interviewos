// Private terms that must never appear in published content (an employer or role name, for example).
// They are NOT stored in the repository: put one term per line in sources/banned-terms.txt (git-ignored),
// or pass BANNED_TERMS="Term1,Term2" in the environment (CI can use a repository secret).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

export function bannedTerms() {
  const terms = [];
  if (process.env.BANNED_TERMS) terms.push(...process.env.BANNED_TERMS.split(',').map((s) => s.trim()));
  const f = path.join(ROOT, 'sources/banned-terms.txt');
  if (fs.existsSync(f)) terms.push(...fs.readFileSync(f, 'utf8').split('\n').map((s) => s.trim()));
  return [...new Set(terms.filter(Boolean))];
}

export function bannedRegex(terms = bannedTerms()) {
  if (!terms.length) return null;
  return new RegExp(`\\b(?:${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`);
}

/** Real PDF file names (slugified) that must not leak; only known on machines that have extracted/index.json. */
export function sourceNameLeaks() {
  const f = path.join(ROOT, 'extracted/index.json');
  if (!fs.existsSync(f)) return [];
  return Object.values(JSON.parse(fs.readFileSync(f, 'utf8'))).map((n) => n.toLowerCase().replace(/\.pdf$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40));
}
