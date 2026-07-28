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

import { readFileSync, readdirSync, existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { listEncounters, type EncounterMeta } from "@/lib/encounters";

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

/** Un dé lancé : son type (characteristic / skill / wild / weakened…) et sa valeur. */
export interface Die { type: string; value: number }

export interface RollResult {
  total: number;
  critical?: boolean;
  flaw?: boolean;
  wild?: string;
  /** Tous les dés lancés, par catégorie (pour le détail onOver). */
  rolls?: { characteristic?: Die[]; skill?: Die[]; wild?: Die[] };
  /** Les dés retenus (4 gardés). */
  kept?: { characteristic?: Die; skill?: Die[]; wild?: Die };
  [k: string]: unknown;
}

export interface AdversaryRollResult {
  /** Faces qualitatives des 4 dés sommés (danger/threat/…). */
  dice?: string[];
  /** Valeurs numériques correspondantes. */
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
  /**
   * Présent quand l'entrée est une RÉACTION ⚡ jouée sur un déclencheur (hors plan
   * de manche) : quel déclencheur, et quelle action elle a interrompue.
   */
  reaction?: { trigger: string; interrupted: string };
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
  /** Seuil de Résistance ♥️ (Vigueur effective). Absent des rapports antérieurs. */
  resistance?: number;
  heavyWounds: number;
  /** Capacité de graves (Σ caract. physiques). Absent des rapports antérieurs. */
  heavyCapacity?: number;
  fatigue: number;
  mentalState: string;
  stability: number;
  /** Réserve ◇ max (Ténacité + Discipline). Absent des rapports antérieurs. */
  stabilityMax?: number;
  /** Traumas — blessures mentales. Absent des rapports antérieurs. */
  mentalWounds?: number;
  /** Capacité de traumas (Σ caract. mentales). Absent des rapports antérieurs. */
  mentalCapacity?: number;
  bleed: number;
  /** 🔥 Marqueurs de combustion. Absent des rapports antérieurs. */
  burn?: number;
  /** ⚡ Charge électrique signée (− = ⊖, + = ⊕). Absent des rapports antérieurs. */
  charge?: number;
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
  /** 🫁 max (blocs intacts). Absent des rapports antérieurs. */
  enduranceMax?: number;
  evasion: number;
  stability: number;
  /** ◇ max (blocs intacts). Absent des rapports antérieurs. */
  stabilityMax?: number;
  mentalState: string;
  stunned: boolean;
  winded: boolean;
  bleed: number;
  destabilized: boolean;
  /** 🔥 Marqueurs de combustion. Absent des rapports antérieurs. */
  burn?: number;
  /** ⚡ Charge électrique signée (− = ⊖, + = ⊕). Absent des rapports antérieurs. */
  charge?: number;
  /** 🛡️ armure totale restante. Absent des rapports antérieurs. */
  armorTotal?: number;
  parts: Array<{
    type: string; marked: number; total: number; destroyed: boolean;
    /** Armure restante de la partie. Absent des rapports antérieurs. */
    armor?: number;
    /** Ce que la partie confère (pour l'onOver). Absent des rapports antérieurs. */
    confers?: string[];
  }>;
}

/** Un plan de manche candidat pesé par le planificateur, et son utilité totale. */
export interface RankedPlan {
  /** `action` = ActionId (PJ) ou id de carte (adversaire). */
  actions: Array<{ band: string; action: string }>;
  utility: number;
  /** Vrai pour le plan effectivement retenu. */
  chosen: boolean;
}

/** Raisonnement d'un acteur au début de manche : ses meilleurs plans par utilité. */
export interface PlanningEntry {
  actorId: string;
  /** Bande au début de laquelle ce classement a été calculé (replanification par bande). */
  band?: string;
  plans: RankedPlan[];
}

export interface RoundLog {
  round: number;
  maintenance: unknown[];
  phases: PhaseLog[];
  endOfRound: CombatantSnapshot[];
  adversariesEndOfRound?: AdversarySnapshot[];
  /** Top-3 plans pesés par chaque acteur scripté en début de manche. */
  planning?: PlanningEntry[];
}

/** Enveloppe spatiale + trousse d'un acteur (pour les zones + la liste d'actions). */
export interface CombatProfile {
  actions: string[];
  reach: number;
  minRange: number;
  move: number;
}

export interface CombatantSummary {
  id: string;
  charName: string;
  faction?: string;
  people?: string;
  origin?: string;
  stats: Record<string, number>;
  skills: Record<string, number>;
  /** Enveloppe spatiale + trousse. Absent des rapports antérieurs. */
  profile?: CombatProfile;
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
  /** Taille du fichier sur disque, en octets. */
  sizeBytes: number;
}

/** Une rencontre et les rapports 1-run qui lui sont rattachés. */
export interface EncounterGroup {
  encounter: EncounterMeta;
  reports: ReportSummary[];
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
    const path = join(dir, name);
    let log: CombatLog;
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(path).size;
      log = JSON.parse(readFileSync(path, "utf-8")) as CombatLog;
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
      sizeBytes,
    });
  }
  summaries.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));
  return summaries;
}

/**
 * Regroupe tous les rapports 1-run par rencontre. Le rattachement se fait sur le
 * SLUG du nom de rencontre : on retire le préfixe horodaté `${date}-${heure}-` de
 * l'id, puis on rattache à la rencontre dont le slug est le PLUS LONG préfixe du
 * reste (départage les slugs imbriqués, ex. `duel` vs `duel-arme`). Les rapports
 * sans rattachement tombent dans un groupe « Autres » (encounter.file === "").
 */
export function groupReportsByEncounter(): EncounterGroup[] {
  const encounters = listEncounters();
  const reports = listReports();

  // Plus longs slugs d'abord → le premier préfixe qui matche est le plus spécifique.
  const byLength = [...encounters].sort((a, b) => b.slug.length - a.slug.length);
  const groups = new Map<string, ReportSummary[]>();
  for (const e of encounters) groups.set(e.file, []);

  const orphans: ReportSummary[] = [];
  for (const r of reports) {
    const rest = r.id.replace(/^\d{8}-\d{6}-/, "");
    const match = byLength.find((e) => e.slug && rest.startsWith(`${e.slug}-`));
    if (match) groups.get(match.file)!.push(r);
    else orphans.push(r);
  }

  const result: EncounterGroup[] = encounters.map((encounter) => ({
    encounter,
    reports: groups.get(encounter.file)!,
  }));
  if (orphans.length > 0) {
    result.push({
      encounter: {
        file: "", name: "Autres / non rattachés", slug: "", factions: [],
      },
      reports: orphans,
    });
  }
  return result;
}

/**
 * Supprime des rapports 1-run par id (outil LOCAL). Refuse tout id contenant un
 * séparateur de chemin — l'id interne == nom de fichier (garanti par le sim).
 */
export function deleteReports(ids: string[]): { deleted: string[]; failed: string[] } {
  const dir = reportsDir();
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || id.includes("/") || id.includes("\\") || id.includes("..")) {
      failed.push(id);
      continue;
    }
    const file = join(dir, `${id}.json`);
    try {
      unlinkSync(file);
      deleted.push(id);
    } catch {
      failed.push(id);
    }
  }
  return { deleted, failed };
}
