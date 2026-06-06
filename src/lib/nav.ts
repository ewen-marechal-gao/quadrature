// Navigation structure — mirrors _index.md, drives the sidebar.
// Titles and ordering are defined here; the actual content comes from the .md files.

export interface NavItem {
  slug: string;
  title: string;
}

export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    id: "core",
    title: "Règles fondamentales",
    items: [
      { slug: "core/materiel", title: "Matériel" },
      { slug: "core/glossaire", title: "Glossaire" },
      { slug: "core/caracteristiques", title: "Caractéristiques" },
      { slug: "core/jet", title: "Jets de dés" },
      { slug: "core/ressources", title: "Ressources" },
      { slug: "core/etats", title: "États" },
      { slug: "core/furtivite", title: "Furtivité" },
      { slug: "core/combat", title: "Combat" },
      { slug: "core/personnages", title: "Personnages" },
      { slug: "core/traits", title: "Traits" },
      { slug: "core/equipement", title: "Équipement" },
      { slug: "core/actions/universal_actions", title: "Actions universelles" },
      { slug: "core/actions/attribute_actions", title: "Actions avancées" },
      { slug: "core/actions/defense_reactions", title: "Réactions de défense" },
    ],
  },
  {
    id: "disciplines",
    title: "Disciplines",
    items: [
      { slug: "disciplines/magie_intro", title: "Introduction à la magie" },
      { slug: "disciplines/martial_escrime", title: "Escrime" },
      { slug: "disciplines/martial_lames_courtes", title: "Lames courtes" },
      { slug: "disciplines/martial_hast", title: "Armes d'hast" },
      { slug: "disciplines/martial_archerie", title: "Archerie" },
      { slug: "disciplines/martial_tir_tendu", title: "Tir tendu" },
      { slug: "disciplines/martial_arts_martiaux", title: "Arts martiaux" },
      { slug: "disciplines/martial_impact", title: "Impact" },
      { slug: "disciplines/magie_biomancie", title: "Biomancie" },
      { slug: "disciplines/magie_telepathie", title: "Télépathie" },
      { slug: "disciplines/magie_electromancie", title: "Électromancie" },
      { slug: "disciplines/magie_calomancie", title: "Calomancie" },
      { slug: "disciplines/magie_echomancie", title: "Échomancie" },
      { slug: "disciplines/magie_alchimie", title: "Alchimie" },
      { slug: "disciplines/magie_choromancie", title: "Choromancie" },
    ],
  },
  {
    id: "adversaires",
    title: "Adversaires",
    items: [
      { slug: "adversaires/regles_adversaires", title: "Règles adversaires" },
      { slug: "adversaires/exemples_adversaires", title: "Exemples" },
    ],
  },
  {
    id: "univers",
    title: "Univers",
    items: [
      { slug: "univers/lore", title: "Lore" },
      { slug: "univers/ecologie", title: "Écologie" },
      { slug: "univers/peuples", title: "Peuples" },
    ],
  },
  {
    id: "_wip",
    title: "En cours (WIP)",
    items: [
      { slug: "_wip/traits_effets", title: "Traits & effets" },
      { slug: "_wip/cartes", title: "Cartes d'action" },
      { slug: "_wip/decouverte", title: "Découverte" },
    ],
  },
];

// Flat list used for prev/next navigation
export const NAV_FLAT: NavItem[] = NAV.flatMap((s) => s.items);

export function getSectionForSlug(slug: string): NavSection | undefined {
  return NAV.find((s) => slug.startsWith(s.id));
}
