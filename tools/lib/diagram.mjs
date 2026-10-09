// Build-time JSON -> inline SVG diagram renderer (layered layout).
// Input: { id, title, alt, direction: 'LR'|'TB', nodes:[{id,label}], edges:[{from,to,label?}] }
// Output: an <figure> with an accessible inline <svg>. Colours come from CSS variables
// (--dg-*) so diagrams follow the light/dark theme. No runtime JS required.

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CHAR_W = 7.2;
const LINE_H = 17;
const PAD_X = 14;
const PAD_Y = 10;
const MAX_LINE_CHARS = 22;
const GAP_LAYER = 64;
const GAP_NODE = 26;
const MARGIN = 16;

function wrapLabel(label) {
  const words = String(label).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= MAX_LINE_CHARS) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** Assign layers by longest path from sources, ignoring back-edges found by DFS. */
function assignLayers(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const out = new Map(ids.map((i) => [i, []]));
  for (const e of edges) out.get(e.from).push(e.to);
  const state = new Map();
  const back = new Set();
  const visit = (u) => {
    state.set(u, 1);
    for (const v of out.get(u)) {
      if (state.get(v) === 1) back.add(u + '>' + v);
      else if (!state.get(v)) visit(v);
    }
    state.set(u, 2);
  };
  const indeg = new Map(ids.map((i) => [i, 0]));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to) + 1);
  const roots = ids.filter((i) => indeg.get(i) === 0);
  for (const r of roots.length ? roots : [ids[0]]) if (!state.get(r)) visit(r);
  for (const i of ids) if (!state.get(i)) visit(i);

  const fwd = edges.filter((e) => !back.has(e.from + '>' + e.to) && e.from !== e.to);
  const layer = new Map(ids.map((i) => [i, 0]));
  // relax (DAG after removing back edges) – bounded iterations for safety
  for (let k = 0; k < ids.length + 1; k++) {
    let changed = false;
    for (const e of fwd) {
      if (layer.get(e.to) < layer.get(e.from) + 1) {
        layer.set(e.to, layer.get(e.from) + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { layer, back };
}

function orderLayers(layers, edges, layer) {
  // barycenter sweeps to reduce crossings
  const pos = new Map();
  const reindex = () => layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)));
  reindex();
  const nbrs = (id, dir) =>
    edges
      .filter((e) => (dir === 'up' ? e.to === id : e.from === id))
      .map((e) => (dir === 'up' ? e.from : e.to))
      .filter((n) => layer.get(n) !== layer.get(id));
  for (let it = 0; it < 4; it++) {
    for (let li = 1; li < layers.length; li++) {
      const bary = (id) => {
        const n = nbrs(id, 'up').filter((x) => layer.get(x) < li);
        return n.length ? n.reduce((s, x) => s + pos.get(x), 0) / n.length : pos.get(id);
      };
      layers[li].sort((a, b) => bary(a) - bary(b));
      reindex();
    }
    for (let li = layers.length - 2; li >= 0; li--) {
      const bary = (id) => {
        const n = nbrs(id, 'down').filter((x) => layer.get(x) > li);
        return n.length ? n.reduce((s, x) => s + pos.get(x), 0) / n.length : pos.get(id);
      };
      layers[li].sort((a, b) => bary(a) - bary(b));
      reindex();
    }
  }
}

export function renderDiagram(d, { idPrefix = 'dg' } = {}) {
  const horizontal = d.direction !== 'TB';
  const nodes = d.nodes.map((n) => {
    const lines = wrapLabel(n.label);
    const w = Math.max(84, Math.max(...lines.map((l) => l.length)) * CHAR_W + PAD_X * 2);
    const h = lines.length * LINE_H + PAD_Y * 2;
    return { ...n, lines, w, h };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = d.edges.filter((e) => byId.has(e.from) && byId.has(e.to));

  const { layer, back } = assignLayers(nodes, edges);
  const nLayers = Math.max(...layer.values()) + 1;
  const layers = Array.from({ length: nLayers }, () => []);
  for (const n of nodes) layers[layer.get(n.id)].push(n.id);
  orderLayers(layers, edges, layer);

  // Along-axis (layer direction) and cross-axis sizes
  const along = (n) => (horizontal ? n.w : n.h);
  const cross = (n) => (horizontal ? n.h : n.w);
  const layerAlong = layers.map((l) => Math.max(...l.map((id) => along(byId.get(id)))));
  const layerCross = layers.map(
    (l) => l.reduce((s, id) => s + cross(byId.get(id)), 0) + GAP_NODE * (l.length - 1),
  );
  const maxCross = Math.max(...layerCross);

  let a = MARGIN;
  layers.forEach((l, li) => {
    let c = MARGIN + (maxCross - layerCross[li]) / 2;
    for (const id of l) {
      const n = byId.get(id);
      const aPos = a + (layerAlong[li] - along(n)) / 2;
      n.x = horizontal ? aPos : c;
      n.y = horizontal ? c : aPos;
      c += cross(n) + GAP_NODE;
    }
    a += layerAlong[li] + GAP_LAYER;
  });
  const totalAlong = a - GAP_LAYER + MARGIN;
  const W = Math.ceil(horizontal ? totalAlong : maxCross + MARGIN * 2);
  const H = Math.ceil(horizontal ? maxCross + MARGIN * 2 : totalAlong);

  const uid = `${idPrefix}-${d.id}`;
  const titleId = `${uid}-t`;
  const descId = `${uid}-d`;
  const parts = [];
  parts.push(
    `<svg class="dg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="${titleId} ${descId}" focusable="false">`,
  );
  parts.push(`<title id="${titleId}">${esc(d.title)}</title><desc id="${descId}">${esc(d.alt)}</desc>`);
  parts.push(
    `<defs><marker id="${uid}-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="dg-arrow"/></marker></defs>`,
  );

  // edges first (under nodes)
  const labels = [];
  const slot = new Map(); // spread multiple edges leaving/entering one node
  const portCount = (id, kind) => {
    const k = id + kind;
    slot.set(k, (slot.get(k) || 0) + 1);
    return slot.get(k);
  };
  const totals = new Map();
  for (const e of edges) {
    totals.set(e.from + 'o', (totals.get(e.from + 'o') || 0) + 1);
    totals.set(e.to + 'i', (totals.get(e.to + 'i') || 0) + 1);
  }
  for (const e of edges) {
    const s = byId.get(e.from);
    const t = byId.get(e.to);
    const isBack = back.has(e.from + '>' + e.to) || layer.get(e.from) >= layer.get(e.to);
    const oi = portCount(e.from, 'o');
    const ii = portCount(e.to, 'i');
    const oFrac = oi / (totals.get(e.from + 'o') + 1);
    const iFrac = ii / (totals.get(e.to + 'i') + 1);
    let d1;
    let lx;
    let ly;
    if (e.from === e.to) {
      // self loop above/left of node
      const x = s.x + s.w;
      const y = s.y + s.h / 2;
      d1 = `M${x} ${y - 8} C${x + 30} ${y - 30} ${x + 30} ${y + 30} ${x} ${y + 8}`;
      lx = x + 30;
      ly = y;
    } else if (!isBack) {
      if (horizontal) {
        const x1 = s.x + s.w;
        const y1 = s.y + s.h * oFrac;
        const x2 = t.x;
        const y2 = t.y + t.h * iFrac;
        const dx = Math.max(24, (x2 - x1) / 2);
        d1 = `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
        lx = (x1 + x2) / 2;
        ly = (y1 + y2) / 2;
      } else {
        const x1 = s.x + s.w * oFrac;
        const y1 = s.y + s.h;
        const x2 = t.x + t.w * iFrac;
        const y2 = t.y;
        const dy = Math.max(24, (y2 - y1) / 2);
        d1 = `M${x1} ${y1} C${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`;
        lx = (x1 + x2) / 2;
        ly = (y1 + y2) / 2;
      }
    } else {
      // return/back edge: arc around the outside
      if (horizontal) {
        const x1 = s.x + s.w / 2;
        const y1 = s.y + s.h;
        const x2 = t.x + t.w / 2;
        const y2 = t.y + t.h;
        const yb = Math.max(y1, y2) + 26;
        d1 = `M${x1} ${y1} C${x1} ${yb} ${x2} ${yb} ${x2} ${y2}`;
        lx = (x1 + x2) / 2;
        ly = yb - 4;
      } else {
        const x1 = s.x + s.w;
        const y1 = s.y + s.h / 2;
        const x2 = t.x + t.w;
        const y2 = t.y + t.h / 2;
        const xb = Math.max(x1, x2) + 30;
        d1 = `M${x1} ${y1} C${xb} ${y1} ${xb} ${y2} ${x2} ${y2}`;
        lx = xb - 4;
        ly = (y1 + y2) / 2;
      }
    }
    parts.push(`<path d="${d1}" class="dg-edge" marker-end="url(#${uid}-a)"/>`);
    if (e.label) labels.push({ x: lx, y: ly, text: e.label });
  }

  for (const n of nodes) {
    parts.push(`<g class="dg-node" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})">`);
    parts.push(`<rect width="${n.w.toFixed(1)}" height="${n.h}" rx="8"/>`);
    const startY = n.h / 2 - ((n.lines.length - 1) * LINE_H) / 2;
    n.lines.forEach((ln, i) => {
      parts.push(
        `<text x="${(n.w / 2).toFixed(1)}" y="${(startY + i * LINE_H).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(ln)}</text>`,
      );
    });
    parts.push('</g>');
  }
  for (const l of labels) {
    const w = String(l.text).length * 6.2 + 8;
    parts.push(
      `<g class="dg-elabel"><rect x="${(l.x - w / 2).toFixed(1)}" y="${(l.y - 9).toFixed(1)}" width="${w.toFixed(1)}" height="18" rx="4"/><text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(l.text)}</text></g>`,
    );
  }
  parts.push('</svg>');

  return `<figure class="diagram"><div class="diagram-scroll" tabindex="0" role="group" aria-label="${esc(d.title)} (scrollable diagram)">${parts.join('')}</div><figcaption>${esc(d.title)}</figcaption></figure>`;
}
