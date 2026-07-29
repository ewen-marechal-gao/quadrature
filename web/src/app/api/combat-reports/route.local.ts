/**
 * app/api/combat-reports/route.ts — suppression de rapports 1-run (outil LOCAL).
 *
 * Route handler DYNAMIQUE : lit le corps de la requête → incompatible avec
 * l'export statique. C'est précisément pourquoi le site tourne en mode hybride
 * (pas d'`output: "export"`, cf. next.config.ts) : les pages du livre restent
 * prérendues, seule cette route (et /encounters) est dynamique.
 *
 * Pas d'authentification : outil de mise au point qui n'existe que sur la machine
 * locale (`simulator/combatReports/` est gitignoré). Les garde-fous d'id sont dans
 * `deleteReports`.
 */

import { deleteReports } from "@/lib/combat-report";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request): Promise<Response> {
  let ids: unknown;
  try {
    ({ ids } = (await req.json()) as { ids?: unknown });
  } catch {
    return Response.json({ error: "Corps JSON invalide" }, { status: 400 });
  }
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    return Response.json({ error: "`ids` doit être un tableau de chaînes" }, { status: 400 });
  }
  const result = deleteReports(ids as string[]);
  return Response.json(result);
}
