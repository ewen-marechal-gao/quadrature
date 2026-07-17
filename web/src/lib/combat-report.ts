/**
 * src/lib/combat-report.ts — accès aux rapports de combat du simulateur.
 *
 * ⚠️ MODULE CÔTÉ SERVEUR (utilise node:fs). À n'importer QUE depuis des Server
 * Components / generateStaticParams — jamais depuis un composant client. Le
 * visualiseur client reçoit le log déjà parsé en prop.
 *
 * ── Architecture (décision créateur, juillet 2026) ───────────────────────────
 * Le site est un export statique (output: "export") mais la route de combat est
 * une ROUTE DYNAMIQUE qui lit les rapports DIRECTEMENT dans le dossier du
 * simulateur (`simulator/combatReports/`), sans copie dans public/. Les Server
 * Components s'exécutent au BUILD : ils lisent le système de fichiers à ce
 * moment-là, et `generateStaticParams` énumère un rapport → une page statique.
 * `simulator/combatReports/` étant gitignoré, c'est un OUTIL LOCAL : un build
 * déployé sans ce dossier produit une liste vide (dégradation propre).
 *
 * Les types ci-dessous MIROITENT `simulator/src/combat/types.ts`. On assume le
 * risque d'une légère divergence (même choix que pour la prose des cartes) :
 * dupliquer un type léger vaut mieux qu'un couplage inter-projets fragile.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Types miroir (simulator/src/combat/types.ts) ─────────────────────────────

export interface Position { x: number; y: number }
export interface Board { width: number; height: number }

/** Effet appliqué par une action. Typé large : la liste évolue côté sim. */
export interface CombatEffect {
  kind: string;
  targetId?: string;
  /** Pour kind === "move" : le chemin complet parcouru, case par case. */
  path?: Position[];
  /** Montants génériques selon le kind (wound, fatigue, value…). */
  value?: number;
  status?: string;
  [k: string]: unknown;
}

export interface RollResult {
  total: number;
  critical?: boolean;
  flaw?: boolean;
  wild?: string;
  [k: string]: unknown;
}

export interface AdversaryRollResult {
  dice?: string[];
  values?: number[];
  total?: number;
  [k: string]: unknown;
}

export interface ActionLogEntry {
  actorId: string;
  /** ActionId (PJ) ou id de carte (adversaire, ex. sickleStrike). */
  action: string;
  targetId?: string;
  targetPart?: string;
  checkRoll?: RollResult;
  adversaryRoll?: AdversaryRollResult;
  guardId?: string;
  guardRoll?: RollResult;
  threshold: number;
  hit: boolean;
  effects: CombatEffect[];
  notes: string[];
  actorActions: number;
  actorReactions: number;
}

export type Band = "I" | "II" | "III";

export interface PhaseLog {
  initiative: number;
  band?: Band;
  actions: ActionLogEntry[];
  /** Où se tient chaque figurine APRÈS cette phase. Absent hors combat spatialisé. */
  positions?: Record<string, Position>;
}

export interface CombatantSnapshot {
  id: string;
  lightWounds: number;
  heavyWounds: number;
  fatigue: number;
  mentalState: string;
  stability: number;
  bleed: number;
  status: string[];
  charWounds: Record<string, number>;
  protection: number;
  tempProtection: number;
}

export interface AdversarySnapshot {
  id: string;
  fatigue: number;
  fatigueMax: number;
  endurance: number;
  evasion: number;
  stability: number;
  mentalState: string;
  stunned: boolean;
  winded: boolean;
  bleed: number;
  destabilized: boolean;
  parts: Array<{ type: string; marked: number; total: number; destroyed: boolean }>;
}

export interface RoundLog {
  round: number;
  maintenance: unknown[];
  phases: PhaseLog[];
  endOfRound: CombatantSnapshot[];
  adversariesEndOfRound?: AdversarySnapshot[];
}

export interface CombatantSummary {
  id: string;
  charName: string;
  faction?: string;
  people?: string;
  origin?: string;
  stats: Record<string, number>;
  skills: Record<string, number>;
}

export type CombatOutcome =
  | { kind: "victor"; victorId: string; rounds: number }
  | { kind: "mutual-incapacitation"; rounds: number }
  | { kind: "max-rounds-reached"; rounds: number };

export interface CombatLog {
  id: string;
  timestamp: string;
  combatants: CombatantSummary[];
  board?: Board;
  startPositions?: Record<string, Position>;
  rounds: RoundLog[];
  outcome: CombatOutcome;
  durationMs: number;
}

/** Métadonnées légères pour la liste (jamais les rounds ni les effets). */
export interface ReportSummary {
  id: string;
  timestamp: string;
  combatants: Array<{ id: string; charName: string; faction?: string }>;
  outcome: CombatOutcome;
  roundCount: number;
  board: Board | null;
}

// ─── Accès disque ─────────────────────────────────────────────────────────────

/** `simulator/combatReports/`, relatif à la racine du projet web (cwd au build). */
function reportsDir(): string {
  return join(process.cwd(), "..", "simulator", "combatReports");
}

/**
 * Un rapport de BATCH, sous l'une ou l'autre convention de nommage. On ne charge
 * JAMAIS un batch (jusqu'à ~90 Mo, statistiques seulement) : la distinction est
 * faite sur le NOM, pas sur le contenu.
 */
function isBatch(name: string): boolean {
  return name.endsWith(".batch.json") ||
         name.endsWith(".stats.json") ||
         /-x\d+-/.test(name);
}

/** Un rapport 1-run rejouable : un `.json` qui n'est pas un batch. */
function isReplayable(name: string): boolean {
  return name.endsWith(".json") && !isBatch(name);
}

/** Les ids de tous les rapports 1-run (nom de fichier sans extension). */
export function reportIds(): string[] {
  const dir = reportsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(isReplayable)
    .map((name) => name.replace(/\.json$/, ""));
}

/** Charge et parse un rapport complet par son id, ou null s'il est introuvable. */
export function loadReport(id: string): CombatLog | null {
  // L'id vient d'un nom de fichier connu ; on refuse tout ce qui pourrait
  // remonter l'arborescence par précaution.
  if (id.includes("/") || id.includes("\\") || id.includes("..")) return null;
  const file = join(reportsDir(), `${id}.json`);
  if (!existsSync(file)) return null;
  try {
    const log = JSON.parse(readFileSync(file, "utf-8")) as CombatLog;
    return Array.isArray(log.rounds) ? log : null;
  } catch {
    return null;
  }
}

/** La liste des rapports 1-run, métadonnées légères, plus récent d'abord. */
export function listReports(): ReportSummary[] {
  const dir = reportsDir();
  if (!existsSync(dir)) return [];
  const summaries: ReportSummary[] = [];
  for (const name of readdirSync(dir)) {
    if (!isReplayable(name)) continue;
    let log: CombatLog;
    try {
      log = JSON.parse(readFileSync(join(dir, name), "utf-8")) as CombatLog;
    } catch {
      continue;
    }
    if (!Array.isArray(log.rounds)) continue;
    summaries.push({
      id: log.id,
      timestamp: log.timestamp,
      combatants: (log.combatants ?? []).map((c) => ({
        id: c.id, charName: c.charName, faction: c.faction,
      })),
      outcome: log.outcome,
      roundCount: log.rounds.length,
      board: log.board ?? null,
    });
  }
  summaries.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  return summaries;
}
