/**
 * src/lib/cladogram-layout.ts
 *
 * Moteur de disposition du cladogramme — *pur et isomorphe* (aucun fs / DOM),
 * rejoué côté client à chaque changement de l'état de repli.
 *
 * Port de l'algorithme « cladogramme à pointes alignées » de
 * tools/gen-faune-arbre.mjs, rendu réactif au repli :
 *   1. parcours des nœuds visibles → liste des « terminaux » (feuilles + clades
 *      repliés), chacun aligné sur la colonne des pointes (profondeur max visible) ;
 *   2. y des terminaux empilés, avec un interstice entre règnes (kingdom) ;
 *   3. y interne = moyenne des enfants ; x = profondeur × DX ;
 *   4. tracés SVG des connecteurs en équerre.
 *
 * Les coordonnées sont en unités « monde » (avant pan/zoom). Le composant
 * applique la transformation d'échelle/translation par-dessus.
 */

import type { CladoNode, CladogramData } from "./cladogram";

// ─── Constantes de disposition ─────────────────────────────────────────────────

export const LAYOUT = {
  PAD_X: 28, // marge gauche avant la racine
  DX: 84, // pas horizontal par niveau de profondeur
  DY: 30, // pas vertical entre terminaux
  GAP: 22, // interstice supplémentaire entre deux règnes
  TOP_Y: 30, // y du premier terminal
  NAME_W: 380, // largeur réservée aux libellés à droite des pointes
  ROOT_STUB: 16, // longueur du moignon avant la racine
} as const;

// ─── Sortie ─────────────────────────────────────────────────────────────────────

export interface PositionedNode {
  node: CladoNode;
  x: number;
  y: number;
  /** true = feuille (colonne des pointes) ou clade replié (à sa profondeur). */
  terminal: boolean;
  /** x du parent (origine de l'arête entrante) ; absent pour la racine. */
  parentX?: number;
}

export interface CladoLink {
  /** Identifiant du nœud « cible » de l'arête (pour le surlignage d'ascendance). */
  nodeId: string;
  /** 'h' = trait horizontal parent→enfant ; 'v' = barre verticale d'un clade. */
  kind: "h" | "v";
  /** Attribut `d` du <path> SVG. */
  d: string;
}

export interface CladoLayout {
  nodes: PositionedNode[];
  links: CladoLink[];
  /** Colonne x des pointes (terminaux). */
  tipX: number;
  width: number;
  height: number;
}

// ─── Calcul ─────────────────────────────────────────────────────────────────────

/**
 * Calcule la disposition pour l'ensemble des nœuds visibles.
 * @param collapsed ids des clades repliés (leurs descendants sont masqués).
 */
export function computeLayout(
  data: CladogramData,
  collapsed: ReadonlySet<string>
): CladoLayout {
  const { PAD_X, DX, DY, GAP, TOP_Y, NAME_W, ROOT_STUB } = LAYOUT;

  const isTerminal = (n: CladoNode) => n.isLeaf || collapsed.has(n.id);

  // 1. Parcours : terminaux visibles (ordre de lecture) + profondeurs max.
  // La colonne des pointes s'aligne sur la feuille *réelle* la plus profonde ;
  // les clades repliés, eux, restent à leur propre profondeur (cf. ci-dessous).
  const terminals: CladoNode[] = [];
  let maxLeafDepth = 0;
  let maxTermDepth = 0;
  const visit = (n: CladoNode) => {
    if (isTerminal(n)) {
      terminals.push(n);
      if (n.depth > maxTermDepth) maxTermDepth = n.depth;
      if (n.isLeaf && n.depth > maxLeafDepth) maxLeafDepth = n.depth;
    } else {
      n.children.forEach(visit);
    }
  };
  data.root.children.forEach(visit);

  const tipX = PAD_X + (maxLeafDepth || maxTermDepth) * DX;

  // 2. y des terminaux (interstice quand on change de règne).
  const pos = new Map<string, { x: number; y: number; terminal: boolean }>();
  let y = TOP_Y;
  let prevKingdom = terminals.length ? terminals[0].kingdom : 0;
  for (const t of terminals) {
    if (t.kingdom !== prevKingdom) {
      y += GAP;
      prevKingdom = t.kingdom;
    }
    // Feuille → colonne des pointes (alignée) ; clade replié → reste à sa profondeur.
    const x = t.isLeaf ? tipX : PAD_X + t.depth * DX;
    pos.set(t.id, { x, y, terminal: true });
    y += DY;
  }

  // 3. y/x des nœuds internes (post-ordre : milieu des enfants).
  const place = (n: CladoNode): void => {
    if (isTerminal(n)) return;
    n.children.forEach(place);
    const first = n.children[0];
    const last = n.children[n.children.length - 1];
    const fy = pos.get(first.id)!.y;
    const ly = pos.get(last.id)!.y;
    pos.set(n.id, {
      x: PAD_X + n.depth * DX,
      y: Math.round((fy + ly) / 2),
      terminal: false,
    });
  };
  data.root.children.forEach(place);

  // Racine : milieu de ses règnes, posée sur la marge gauche.
  const rootKids = data.root.children;
  if (rootKids.length) {
    const fy = pos.get(rootKids[0].id)!.y;
    const ly = pos.get(rootKids[rootKids.length - 1].id)!.y;
    pos.set("root", { x: PAD_X, y: Math.round((fy + ly) / 2), terminal: false });
  } else {
    pos.set("root", { x: PAD_X, y: TOP_Y, terminal: false });
  }

  // 4. Connecteurs en équerre.
  const links: CladoLink[] = [];
  const drawLinks = (n: CladoNode) => {
    if (isTerminal(n)) return;
    const p = pos.get(n.id)!;
    const first = pos.get(n.children[0].id)!;
    const last = pos.get(n.children[n.children.length - 1].id)!;
    // Barre verticale couvrant l'éventail des enfants.
    links.push({ nodeId: n.id, kind: "v", d: `M${p.x} ${first.y} V${last.y}` });
    // Trait horizontal vers chaque enfant.
    for (const child of n.children) {
      const c = pos.get(child.id)!;
      links.push({ nodeId: child.id, kind: "h", d: `M${p.x} ${c.y} H${c.x}` });
      drawLinks(child);
    }
  };
  const rootPos = pos.get("root")!;
  links.push({
    nodeId: "root",
    kind: "h",
    d: `M${rootPos.x - ROOT_STUB} ${rootPos.y} H${rootPos.x}`,
  });
  data.root.children.forEach((k) => {
    const c = pos.get(k.id)!;
    links.push({ nodeId: k.id, kind: "h", d: `M${rootPos.x} ${c.y} H${c.x}` });
    drawLinks(k);
  });
  // Barre verticale de la racine entre ses règnes.
  if (rootKids.length > 1) {
    const fy = pos.get(rootKids[0].id)!.y;
    const ly = pos.get(rootKids[rootKids.length - 1].id)!.y;
    links.push({ nodeId: "root", kind: "v", d: `M${rootPos.x} ${fy} V${ly}` });
  }

  // 5. Nœuds positionnés (avec x du parent pour placer la pastille sur l'arête).
  const nodes: PositionedNode[] = [];
  let maxX = tipX;
  for (const [id, p] of pos) {
    const node = data.nodeIndex[id];
    const parentX = node.parentId ? pos.get(node.parentId)?.x : undefined;
    if (p.x > maxX) maxX = p.x;
    nodes.push({ node, x: p.x, y: p.y, terminal: p.terminal, parentX });
  }

  const lastY = terminals.length ? y - DY : TOP_Y;
  return {
    nodes,
    links,
    tipX,
    width: maxX + NAME_W,
    height: lastY + TOP_Y,
  };
}

/** Chaîne d'ascendance (du nœud jusqu'à la racine, racine incluse). */
export function ancestryOf(data: CladogramData, id: string): string[] {
  const chain: string[] = [];
  let cur: string | undefined = id;
  while (cur) {
    chain.push(cur);
    cur = data.nodeIndex[cur]?.parentId;
  }
  return chain;
}
