// Generates dist/sw.js (precache manifest + build id) after the site and CSS are built.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIST = path.resolve(process.env.DIST_DIR || path.join(ROOT, 'dist'));

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const rel = (f) => path.relative(DIST, f).split(path.sep).join('/');

const files = walk(DIST).map(rel);
const precache = files
  .filter(
    (f) =>
      f === 'index.html' ||
      f === 'offline.html' ||
      f === 'manifest.webmanifest' ||
      f === 'categories/index.html' ||
      f === 'data/index.json' ||
      f === 'data/search.json' ||
      /^data\/q\/[a-z0-9-]+\.json$/.test(f) ||
      /^app\/(index\.html|js\/.+\.js)$/.test(f) ||
      /^assets\/(app\.css|theme\.js|site\.js)$/.test(f) ||
      /^icons\/(icon\.svg|icon-192\.png|icon-512\.png|maskable-512\.png|apple-touch-icon\.png)$/.test(f),
  )
  .sort();

const hash = crypto.createHash('sha1');
for (const f of precache) hash.update(f).update(fs.readFileSync(path.join(DIST, f)));
const build = hash.digest('hex').slice(0, 12);

const tpl = fs.readFileSync(path.join(ROOT, 'src/sw.js'), 'utf8');
fs.writeFileSync(path.join(DIST, 'sw.js'), tpl.replace('__BUILD__', build).replace('__PRECACHE__', JSON.stringify(precache, null, 1)));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
const bytes = precache.reduce((n, f) => n + fs.statSync(path.join(DIST, f)).size, 0);
console.log(`sw.js: ${precache.length} precached files, ${(bytes / 1024).toFixed(0)} KB, build ${build}`);
