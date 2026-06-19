// Génère rules/fr/univers/faune_arbre.svg à partir de cladogram.yaml (source de vérité).
// Usage : node tools/gen-faune-arbre.mjs  (exécutable depuis n'importe quel dossier)
// Disposition automatique (cladogramme à pointes alignées). YAML lu via js-yaml de web/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const require = createRequire(path.join(REPO, 'web', 'package.json'));
const yaml = require('js-yaml');

const DATA = path.join(REPO, 'rules/fr/univers/cladogram.yaml');
const OUT  = path.join(REPO, 'rules/fr/univers/faune_arbre.svg');

// ---- disposition ----
const PANEL_X = 12, PANEL_Y = 42, PANEL_W = 156;   // encadré des mutations (gauche)
const OX = 182;                                     // origine X de l'arbre (à droite de l'encadré)
const ROOT_X = OX, LEFT_X = OX, DX = 60;            // x interne = LEFT_X + depth*DX
const TIP_X = OX + 480, NAME_X = TIP_X + 60, GLYPH_X = TIP_X + 6;
const TOP_Y = 48, DY = 33, GAP = 22;

const data = yaml.load(fs.readFileSync(DATA, 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const approxW = (s, px) => s.length * px * 0.6;
const muts = (data.mutations || []).map(m => (typeof m === 'string' ? { label: m } : m));
const usedMut = new Set();

// ---- 1. parcours ----
const leaves = [];
function walk(node, depth, kingdom) {
  node._depth = depth; node._kingdom = kingdom;
  if (node.mut) usedMut.add(node.mut);
  if (node.children && node.children.length) node.children.forEach(c => walk(c, depth + 1, kingdom));
  else { node._leaf = true; leaves.push(node); }
}
data.root._depth = 0;
data.root.children.forEach((k, i) => walk(k, 1, i));

// ---- 2. y des feuilles ----
let y = TOP_Y, prevK = leaves[0]._kingdom;
for (const lf of leaves) {
  if (lf._kingdom !== prevK) { y += GAP; prevK = lf._kingdom; }
  lf._y = y; lf._x = TIP_X; y += DY;
}

// ---- 3. positions internes ----
function place(node) {
  if (node._leaf) return;
  node.children.forEach(place);
  const c = node.children;
  node._y = Math.round((c[0]._y + c[c.length - 1]._y) / 2);
  node._x = LEFT_X + node._depth * DX;
}
place(data.root);
data.root._x = ROOT_X;

// ---- 4. rendu ----
const P = [];
const br = d => P.push(`<path class="br" d="${d}"/>`);

function glyph(lf) {
  const b = (lf.biome || '').toUpperCase(), ty = lf._y - 5;
  ['N', 'L', 'C', 'S'].forEach((L, i) => {
    const x = GLYPH_X + i * 12, on = b.includes(L);
    P.push(`<rect class="${on ? 'gp' : 'ga'}" x="${x}" y="${ty}" width="11" height="11"/>`
      + `<text class="${on ? 'gpt' : 'gat'}" x="${x + 5.5}" y="${lf._y + 3}" text-anchor="middle">${L}</text>`);
  });
}
function mutBadge(node) {
  if (!node.mut) return;
  const x = node._x - 12, yy = node._y;
  P.push(`<circle cx="${x}" cy="${yy}" r="7" fill="#D4537E"/><text class="bd" x="${x}" y="${yy + 3}" text-anchor="middle">${node.mut}</text>`);
}
function tip(lf) {
  glyph(lf);
  const mark = lf.status === 'done' ? ' ✓' : lf.status === 'todo' ? ' ☐' : '';
  let nx = NAME_X;
  if (lf.star) { P.push(`<text class="gd" x="${NAME_X}" y="${lf._y + 3}" font-size="13" font-weight="700">★</text>`); nx = NAME_X + 14; }
  P.push(`<text class="cn" x="${nx}" y="${lf._y + 3}">${esc(lf.tip)}${mark}</text>`);
  if (lf.cd) P.push(`<text class="cd" x="${NAME_X}" y="${lf._y + 16}">${esc(lf.cd)}</text>`);
}
function nodeLabel(node, parentX) {
  if (node.name) {
    const lx = parentX + 6, ny = node._y;
    P.push(`<text class="gs" x="${lx}" y="${ny - 17}">${esc(node.name)}</text>`);
    P.push(`<line class="ul" x1="${lx}" y1="${ny - 14}" x2="${lx + approxW(node.name, 10)}" y2="${ny - 14}"/>`);
    if (node.ref) P.push(`<text class="rf" x="${lx}" y="${ny - 6}">(${esc(node.ref)})</text>`);
  }
  if (node.branchNote) P.push(`<text class="sy" x="${node._x + 4}" y="${node._y - 4}">${esc(node.branchNote)}</text>`);
}
function draw(node) {
  if (node._leaf) { tip(node); return; }
  const c = node.children;
  br(`M${node._x} ${c[0]._y} V${c[c.length - 1]._y}`);
  for (const ch of c) { br(`M${node._x} ${ch._y} H${ch._x}`); nodeLabel(ch, node._x); mutBadge(ch); draw(ch); }
}
br(`M${ROOT_X - 12} ${data.root._y} H${ROOT_X}`);
draw(data.root);

// ---- encadré des mutations (gauche) ----
const rowH = 16, ph = 26 + muts.length * rowH;
P.push(`<rect class="bx" x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_W}" height="${ph}"/>`);
P.push(`<text class="gr" x="${PANEL_X + 10}" y="${PANEL_Y + 18}">Mutations d'Aeonir</text>`);
muts.forEach((m, i) => {
  const n = i + 1, yy = PANEL_Y + 18 + (i + 1) * rowH, placed = usedMut.has(n);
  P.push(`<circle cx="${PANEL_X + 16}" cy="${yy - 3}" r="6" fill="${placed ? '#D4537E' : 'none'}"${placed ? '' : ' stroke="#D4537E" stroke-width="1"'}/>`
    + `<text class="${placed ? 'bd' : 'mo'}" x="${PANEL_X + 16}" y="${yy}" text-anchor="middle">${n}</text>`
    + `<text class="ml" x="${PANEL_X + 28}" y="${yy}">${esc(m.label)}</text>`);
});

// ---- légende (bas) ----
const lastY = leaves[leaves.length - 1]._y, ly = lastY + 36;
P.push(`<text class="gd" x="12" y="${ly}" font-size="11" font-weight="700">★</text><text class="cd" x="24" y="${ly}">espèce-clé · ✓ peuplé · ☐ à venir</text>`);
P.push(`<circle cx="218" cy="${ly - 3}" r="6" fill="#D4537E"/><text class="bd" x="218" y="${ly}" text-anchor="middle">n</text>`
  + `<text class="cd" x="230" y="${ly}">mutation (encadré) · cercle vide = à placer</text>`);
const gy = ly + 16;
P.push(`<rect class="gp" x="12" y="${gy - 8}" width="10" height="10"/><text class="gpt" x="17" y="${gy}" text-anchor="middle" font-size="6">N</text>`
  + `<rect class="ga" x="23" y="${gy - 8}" width="10" height="10"/>`
  + `<text class="cd" x="38" y="${gy}">case pleine = biome du clade — N Nord · L Levant · C Couchant · S Sud</text>`);

const H = Math.max(gy, PANEL_Y + ph) + 16;
const W = NAME_X + 235;

const styles = `
.cn { font: 600 12px var(--font-sans, system-ui, sans-serif); fill: var(--color-text-primary, #20201e); }
.cd { font: 400 10px var(--font-sans, system-ui, sans-serif); fill: var(--color-text-secondary, #6b6b64); }
.ml { font: 400 9px var(--font-sans, system-ui, sans-serif); fill: var(--color-text-secondary, #6b6b64); }
.gr { font: 700 11px var(--font-sans, system-ui, sans-serif); fill: var(--color-text-primary, #20201e); }
.gs { font: 700 10px var(--font-sans, system-ui, sans-serif); fill: var(--color-text-primary, #20201e); }
.rf { font: italic 9px var(--font-sans, system-ui, sans-serif); fill: var(--color-text-secondary, #6b6b64); }
.sy { font: 400 9.5px var(--font-sans, system-ui, sans-serif); fill: var(--color-text-secondary, #6b6b64); }
.bs { font: 600 10.5px var(--font-sans, system-ui, sans-serif); fill: var(--color-text-secondary, #6b6b64); }
.bd { font: 700 8.5px var(--font-sans, system-ui, sans-serif); fill: #fff; }
.mo { font: 700 8.5px var(--font-sans, system-ui, sans-serif); fill: #D4537E; }
.br { stroke: var(--color-text-secondary, #9a9a93); stroke-width: 1.4; fill: none; opacity: .55; }
.ul { stroke: var(--color-text-secondary, #9a9a93); stroke-width: .8; opacity: .45; }
.gd { fill: #C9971E; }
.bx { stroke: var(--color-text-secondary, #9a9a93); stroke-width: 1; fill: none; opacity: .35; }
.gp { fill: var(--color-text-secondary, #6b6b64); opacity: .85; }
.gpt { fill: #fff; font: 700 7px var(--font-sans, system-ui, sans-serif); }
.ga { fill: none; stroke: var(--color-text-secondary, #9a9a93); stroke-width: .8; opacity: .5; }
.gat { fill: var(--color-text-secondary, #9a9a93); opacity: .55; font: 700 7px var(--font-sans, system-ui, sans-serif); }`;

const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">
<title>Arbre phylogénétique de la vie d'Aeonir — état courant</title>
<desc>Cladogramme généré depuis cladogram.yaml. Encadré gauche : mutations d'Aeonir numérotées, dont le n° marque le nœud d'apparition. Pourpres (autotrophes) et Zoïdes (animaux), analogue terrestre sous chaque nom de clade, pastille de biome N L C S.</desc>
<defs><style>${styles}
</style></defs>
<text class="bs" x="36" y="22">${esc(data.title)}</text>
<text class="sy" x="${OX}" y="38">${esc(data.rootNote)}</text>
${P.join('\n')}
</svg>
`;

fs.writeFileSync(OUT, svg);
console.log(`OK → ${OUT}  (${leaves.length} feuilles, ${muts.length} mutations, ${W}×${H})`);
