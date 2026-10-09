// Tiny static server for local testing. Mounts dist/ under the same sub-path as the production site
// (e.g. /interviewos/) so root-absolute asset bugs show up locally exactly as they would on GitHub Pages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.resolve(process.env.DIST_DIR || path.join(ROOT, 'dist'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const BASE = process.env.BASE_PATH || new URL(process.env.SITE_URL || cfg.defaultSiteUrl).pathname;
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    const send = (file, status = 200) => {
      res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    };
    if (!p.startsWith(BASE)) {
      res.writeHead(302, { Location: BASE });
      return res.end();
    }
    let rel = p.slice(BASE.length);
    let file = path.join(DIST, rel);
    if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
    }
    if (fs.existsSync(file)) return send(file);
    send(path.join(DIST, '404.html'), 404);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(PORT, () => console.log(`InterviewOS at http://localhost:${PORT}${BASE}`));
}
