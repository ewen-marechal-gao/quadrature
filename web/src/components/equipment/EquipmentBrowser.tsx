"use client";

/**
 * EquipmentBrowser — le catalogue d'équipement, rangé par nature.
 *
 * Armes (par famille) → Armures et boucliers → Conteneurs → Consommables →
 * Divers. C'est l'ordre dans lequel on équipe un personnage : ce qu'on tient
 * d'abord, ce qu'on porte ensuite, ce qu'on emporte enfin.
 *
 * Chrome du site : la `TopBar` commune, qui ramène à l'accueil, puis la `ToolBar`
 * commune, qui porte les filtres. Rien d'autre : les cartes se lisent seules,
 * une page d'outil de table n'a pas à s'expliquer avant de servir.
 *
 * Les données arrivent lues et groupées côté serveur ; ce composant n'ajoute que
 * le filtrage — recherche plein texte, nature, zone du corps.
 */

import { useMemo, useState } from "react";
import type { EquipmentItem, EquipmentSection } from "@/lib/equipment";
import { ZONE_LABELS, ZONE_ORDER, type BodyZone } from "@/lib/equipment-labels";
import type { Locale } from "@/lib/nav";
import { TopBar } from "@/components/TopBar";
import {
  ToolBar, ToolChip, ToolGroup, ToolSearch, ToolSpacer, ToolValue,
} from "@/components/ToolBar";
import { ItemCard } from "./ItemCard";
import "@/app/equipment.css";

/** Recherche : nom, identité, mécanique, id. */
function matches(item: EquipmentItem, needle: string): boolean {
  if (!needle) return true;
  const hay = `${item.name} ${item.identity ?? ""} ${item.mechanic ?? ""} ${item.id}`;
  return hay.toLowerCase().includes(needle);
}

export function EquipmentBrowser({
  sections,
  total,
  locale,
}: {
  sections: EquipmentSection[];
  total: number;
  locale: Locale;
}) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string>("all");
  const [zone, setZone] = useState<BodyZone | "all">("all");

  // Filtrage : on reconstruit l'arbre en élaguant les branches devenues vides.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const keep = (i: EquipmentItem) =>
      matches(i, needle) && (zone === "all" || i.zones.includes(zone));

    return sections
      .filter((s) => section === "all" || s.id === section)
      .map((s) => ({
        ...s,
        groups: s.groups
          .map((g) => ({ ...g, items: g.items.filter(keep) }))
          .filter((g) => g.items.length > 0),
      }))
      .filter((s) => s.groups.length > 0);
  }, [sections, query, section, zone]);

  const shownCount = useMemo(
    () => shown.flatMap((s) => s.groups).flatMap((g) => g.items).length,
    [shown],
  );

  return (
    <div className="book-app">
      <TopBar locale={locale} page="Équipement" />

      <ToolBar ariaLabel="Filtres du catalogue">
        <ToolSearch
          value={query}
          onChange={setQuery}
          placeholder="Rechercher un objet, une identité, une mécanique…"
          ariaLabel="Rechercher un objet"
        />

        <ToolGroup label="Nature" ariaLabel="Nature de l'objet">
          <ToolChip on={section === "all"} onClick={() => setSection("all")}>
            Toutes
          </ToolChip>
          {sections.map((s) => (
            <ToolChip
              key={s.id}
              on={section === s.id}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </ToolChip>
          ))}
        </ToolGroup>

        <ToolGroup label="Zone">
          <select
            className="tool-chip"
            value={zone}
            onChange={(e) => setZone(e.target.value as BodyZone | "all")}
            aria-label="Filtrer par zone du corps"
          >
            <option value="all">toutes</option>
            {ZONE_ORDER.map((z) => (
              <option key={z} value={z}>{ZONE_LABELS[z]}</option>
            ))}
          </select>
        </ToolGroup>

        <ToolSpacer />
        <ToolValue>{shownCount} / {total}</ToolValue>
      </ToolBar>

      <main className="eqp">
        {shown.length === 0 ? (
          <p className="eqp-empty">Aucun objet ne correspond à ces critères.</p>
        ) : (
          shown.map((s) => (
            <section key={s.id} id={`eqp-${s.id}`} className="eqp-section">
              <h2 className="eqp-section__title">{s.label}</h2>
              {s.groups.map((g) => (
                <div key={g.id} className="eqp-group">
                  {g.label && <h3 className="eqp-group__title">{g.label}</h3>}
                  {g.hint && <p className="eqp-group__hint">{g.hint}</p>}
                  <div className="eqp-grid">
                    {g.items.map((i) => (
                      <ItemCard key={i.id} item={i} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </main>
    </div>
  );
}
