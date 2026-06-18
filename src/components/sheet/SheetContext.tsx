"use client";

/**
 * Contexte de la feuille : expose le personnage courant, la fonction de mutation
 * et un helper de localisation `t()` aux sous-blocs, pour éviter le prop-drilling.
 * Fourni par CharacterSheet, consommé via `useSheet()`.
 */

import { createContext, useContext } from "react";
import type { Character } from "@/lib/character/types";
import type { LocalizedString, Locale } from "@/lib/nav";

export interface SheetContextValue {
  c: Character;
  /** Mute le personnage via un brouillon cloné (cf. useCharacter). */
  update: (updater: (draft: Character) => void) => void;
  locale: Locale;
  /** Résout un libellé localisé dans la locale courante. */
  t: (field: LocalizedString) => string;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export const SheetProvider = SheetContext.Provider;

export function useSheet(): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useSheet doit être utilisé dans un SheetProvider");
  return ctx;
}
