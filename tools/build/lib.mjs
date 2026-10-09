import { Marked } from 'marked';
import { renderDiagram } from '../lib/diagram.mjs';

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const jsonForHtml = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';

/** Strip lightweight inline markdown so text is safe for meta tags, JSON-LD and speech. */
export const plain = (s) =>
  String(s)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

export function metaDescription(text, max = 158) {
  const t = plain(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '));
  if (sentenceEnd > 90) return cut.slice(0, sentenceEnd + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '…';
}

const SAFE_HREF = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;

/** Markdown -> HTML with raw HTML escaped, unsafe links dropped, heading ids, scrollable tables/code. */
export function createMarkdown() {
  const m = new Marked({ gfm: true, breaks: false });
  let seen = new Set();
  let headings = [];
  m.use({
    renderer: {
      html({ text }) {
        return esc(text);
      },
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(text);
        let n = 2;
        const base = id;
        while (seen.has(id)) id = `${base}-${n++}`;
        seen.add(id);
        if (depth === 2) headings.push({ id, text: plain(text) });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        if (!SAFE_HREF.test(href || '')) return inner;
        const ext = /^https?:/i.test(href);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${ext ? ' rel="noopener noreferrer" target="_blank"' : ''}>${inner}</a>`;
      },
      image({ text }) {
        // no images in the content model; never emit <img> from content
        return esc(text || '');
      },
      code({ text, lang }) {
        const l = (lang || '').trim().split(/\s+/)[0].replace(/[^a-z0-9+#-]/gi, '');
        const label = l ? ` aria-label="${esc(l)} code"` : ' aria-label="code"';
        return `<pre tabindex="0" role="region"${label}><code${l ? ` class="language-${l}"` : ''}>${esc(text)}</code></pre>\n`;
      },
    },
  });
  return {
    render(md, diagrams = [], idPrefix = 'dg') {
      seen = new Set();
      headings = [];
      const byId = new Map((diagrams || []).map((d) => [d.id, d]));
      const used = new Set();
      const src = md.replace(/\{\{diagram:([a-z0-9-]+)\}\}/gi, (_, id) => `\n\n@@DG:${id}@@\n\n`);
      let html = m.parse(src);
      html = html.replace(/<table>/g, '<div class="table-wrap" tabindex="0" role="region" aria-label="Table, scrollable"><table>').replace(/<\/table>/g, '</table></div>');
      html = html.replace(/<p>@@DG:([a-z0-9-]+)@@<\/p>/gi, (_, id) => {
        const d = byId.get(id);
        if (!d) return '';
        used.add(id);
        return renderDiagram(d, { idPrefix });
      });
      const leftover = (diagrams || []).filter((d) => !used.has(d.id)).map((d) => renderDiagram(d, { idPrefix }));
      if (leftover.length) html += leftover.join('');
      return { html, headings: headings.slice() };
    },
    inline(s) {
      return m.parseInline(String(s));
    },
  };
}

/** Path helpers. Pages are root-relative paths ending in '/', e.g. 'questions/react/what-is-react/'. */
export const depthOf = (p) => p.split('/').filter(Boolean).length;
export const relRoot = (p) => '../'.repeat(depthOf(p)) || './';

export function readingMinutes(words) {
  return Math.max(1, Math.round(words / 220));
}
