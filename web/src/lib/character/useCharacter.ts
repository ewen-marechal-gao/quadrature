"use client";

/**
 * src/lib/character/useCharacter.ts
 *
 * Hook orchestrant le store multi-personnages : hydratation depuis localStorage
 * au montage (garde SSR), autosave debouncé, et actions de haut niveau.
 *
 * `update(updater)` donne aux composants une API « mutate-style » : ils mutent
 * un brouillon cloné, puis le hook normalise et persiste. Aucune action granulaire
 * à maintenir.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloneCharacter, createEmptyCharacter } from "./derive";
import { normalizeCharacter } from "./mutators";
import {
  downloadCharacter,
  loadStore,
  readCharacterFile,
  saveStore,
} from "./storage";
import type { Character, CharacterStore } from "./types";

const EMPTY_STORE: CharacterStore = { characters: [], currentId: null };
const AUTOSAVE_DELAY = 300;

export interface UseCharacterResult {
  /** true une fois l'hydratation localStorage faite (évite le flash SSR). */
  ready: boolean;
  characters: Character[];
  current: Character | null;
  /** Mute le personnage courant via un brouillon cloné, puis normalise + persiste. */
  update: (updater: (draft: Character) => void) => void;
  selectCharacter: (id: string) => void;
  createCharacter: () => void;
  duplicateCurrent: () => void;
  deleteCharacter: (id: string) => void;
  exportCurrent: () => void;
  importFile: (file: File) => Promise<void>;
}

export function useCharacter(): UseCharacterResult {
  const [store, setStore] = useState<CharacterStore>(EMPTY_STORE);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydratation au montage (client uniquement) ──────────────────────────────
  useEffect(() => {
    const loaded = loadStore();
    if (loaded && loaded.characters.length > 0) {
      setStore(loaded);
    } else {
      const first = createEmptyCharacter();
      setStore({ characters: [first], currentId: first.id });
    }
    setReady(true);
  }, []);

  // ── Autosave debouncé ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveStore(store), AUTOSAVE_DELAY);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [store, ready]);

  const current = useMemo(
    () => store.characters.find((c) => c.id === store.currentId) ?? null,
    [store],
  );

  const update = useCallback((updater: (draft: Character) => void) => {
    setStore((prev) => {
      const idx = prev.characters.findIndex((c) => c.id === prev.currentId);
      if (idx < 0) return prev;
      const draft: Character = structuredClone(prev.characters[idx]);
      updater(draft);
      normalizeCharacter(draft);
      const characters = [...prev.characters];
      characters[idx] = draft;
      return { ...prev, characters };
    });
  }, []);

  const selectCharacter = useCallback((id: string) => {
    setStore((prev) =>
      prev.characters.some((c) => c.id === id) ? { ...prev, currentId: id } : prev,
    );
  }, []);

  const createCharacter = useCallback(() => {
    setStore((prev) => {
      const fresh = createEmptyCharacter();
      return { characters: [...prev.characters, fresh], currentId: fresh.id };
    });
  }, []);

  const duplicateCurrent = useCallback(() => {
    setStore((prev) => {
      const cur = prev.characters.find((c) => c.id === prev.currentId);
      if (!cur) return prev;
      const copy = cloneCharacter(cur, `${cur.name || "Personnage"} (copie)`);
      return { characters: [...prev.characters, copy], currentId: copy.id };
    });
  }, []);

  const deleteCharacter = useCallback((id: string) => {
    setStore((prev) => {
      const remaining = prev.characters.filter((c) => c.id !== id);
      // Le store peut devenir vide : on ne recrée PAS de personnage (l'UI affiche
      // alors un état vide). Si on a supprimé le courant, on bascule sur le premier
      // restant, ou null s'il n'y en a plus.
      const currentId = prev.currentId === id ? (remaining[0]?.id ?? null) : prev.currentId;
      return { characters: remaining, currentId };
    });
  }, []);

  const exportCurrent = useCallback(() => {
    if (current) downloadCharacter(current);
  }, [current]);

  const importFile = useCallback(async (file: File) => {
    const imported = await readCharacterFile(file);
    setStore((prev) => {
      // Évite une collision d'id si le personnage est déjà présent.
      const entry = prev.characters.some((c) => c.id === imported.id)
        ? cloneCharacter(imported)
        : imported;
      return { characters: [...prev.characters, entry], currentId: entry.id };
    });
  }, []);

  return {
    ready,
    characters: store.characters,
    current,
    update,
    selectCharacter,
    createCharacter,
    duplicateCurrent,
    deleteCharacter,
    exportCurrent,
    importFile,
  };
}
