// Local PDF text extraction. Reads sources/*.pdf, writes extracted/<alias>.txt (line-preserving, git-ignored) and
// reports/extraction.json. Committed output uses neutral aliases only; extracted/index.json (git-ignored) maps alias -> real file.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { aliasFromFile } from '../lib/aliases.mjs';

const SRC = 'sources', OUT = 'extracted';
await mkdir(OUT, { recursive: true });
await mkdir('reports', { recursive: true });
const report = [];
const local = {};
for (const f of (await readdir(SRC)).filter((x) => x.endsWith('.pdf')).sort()) {
  const data = new Uint8Array(await readFile(path.join(SRC, f)));
  const doc = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  let out = '', chars = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await (await doc.getPage(p)).getTextContent();
    let lastY = null, line = '';
    const lines = [];
    for (const it of page.items) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line); line = ''; }
      line += it.str; lastY = y;
      if (it.hasEOL) { lines.push(line); line = ''; lastY = null; }
    }
    lines.push(line);
    const txt = lines.map((l) => l.trimEnd()).join('\n');
    chars += txt.length;
    out += `\n=== PAGE ${p} ===\n${txt}\n`;
  }
  const s = aliasFromFile(f);
  await writeFile(path.join(OUT, s + '.txt'), out);
  local[s] = f;
  report.push({ source: s, pages: doc.numPages, chars, machineReadable: chars > 200 });
  console.log(s, doc.numPages, 'pages', chars, 'chars');
}
await writeFile('reports/extraction.json', JSON.stringify(report, null, 2));
await writeFile(path.join(OUT, 'index.json'), JSON.stringify(local, null, 2));
