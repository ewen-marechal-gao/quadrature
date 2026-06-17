# Code Review — web/src

Revue qualité (juin 2026). Les points **CSS** ont été traités (série de commits
`refactor(css)` / `fix(css)` — voir l'historique git) et retirés de cette revue.
Les points **TS/React** ci-dessous restent ouverts.

---

## 1. Code mort

### `startFromEnd` inutilisé — `BookViewer.tsx:203`

```typescript
const startFromEnd = false;  // jamais modifié, toujours false
```

Utilisé deux fois (`startPage = startFromEnd ? … : 0`) mais produit toujours `0`.
Le commentaire confirme : *"startFromEnd n'est plus utilisé"*.
Supprimer la variable et remplacer les deux usages par `0` directement.

---

## 2. Duplication

### `generateStaticParams()` identique dans `layout.tsx` et `page.tsx`

`app/[locale]/volumen/[book]/layout.tsx` et `app/[locale]/volumen/[book]/page.tsx`
contiennent la même fonction verbatim :

```typescript
return LOCALES.filter((l) => l.enabled).flatMap((l) => BOOKS.map((b) => ({ locale: l.id, book: b.id })));
```

Next.js n'exige pas `generateStaticParams` dans les deux fichiers en même temps.
Vérifier lequel est nécessaire et supprimer l'autre.

### UI de chargement dupliquée

Le placeholder "Composition en cours…" (flèches désactivées + texte) est écrit deux fois :
- `BookViewerLoader.tsx:17-36` — prop `loading` de `dynamic()`
- `BookShellLayout.tsx:232-253` — fallback quand `currentHtml` est vide

Extraire un composant `<BookViewerSkeleton>` partagé.

### `(window as any).Paged` dupliqué

Le cast non typé + `eslint-disable` apparaît dans :
- `BookViewer.tsx:269`
- `BookPreloader.tsx:215`

Centraliser dans `pagedjs.ts` sous une fonction `getPagedPreviewer(): PagedPreviewer | null`
avec une interface locale pour `window.Paged`. Les deux `eslint-disable` disparaissent.

### `BOOKS.find(...)` duplique `getBookForSlug`

`BookShellLayout.tsx:69` :

```typescript
const ownerBook = BOOKS.find(b => b.sections.some(s => s.slug === currentSlug));
```

C'est exactement `getBookForSlug()` de `nav.ts:95`, non importée ici.
Remplacer par l'appel à la fonction existante.

---

## 3. Typage

### `locale` typé `string` au lieu de `Locale`

`Locale = "fr" | "en"` est défini dans `nav.ts:24` mais non propagé aux props :
- `BookShell`, `BookShellLayout`, `LandingPage`, `LocaleSwitcher` — `locale: string`
- `localize(field, locale: string)` — accepte n'importe quelle chaîne

`resolveLocale()` garantit la valeur en entrée, mais les composants descendants
ne bénéficient pas de la vérification statique. Passer `Locale` partout où la valeur
est déjà résolue.

---

## 4. Documentation

### `content.ts:rewriteLinks` — exemple incorrect

Le commentaire JSDoc (lignes 202–205) montre les URLs sans trailing slash :
```
[text](etats.md) → [text](/rules/core/etats)
```
Mais le code produit `/rules/core/etats/` (slash final, intentionnel — voir l. 228).
Corriger l'exemple dans le commentaire.

### `pagedCache.ts` — état singleton non documenté

`renderCache` et `_vault` sont des singletons module-level qui survivent aux changements
de livre (grâce au `key={bookId}` sur `BookProvider`). Documenter ce comportement dans
l'en-tête du fichier, notamment pourquoi le cache n'est pas vidé lors du changement de livre.

---

## 5. Anti-patterns mineurs

| Fichier | Ligne | Observation |
|---|---|---|
| `BookShellLayout.tsx` | 211 | `key={i}` sur les h2 — utiliser `key={h2text}` |
| `BookViewer.tsx` | 55–56 | Double ligne vide entre deux `useRef` |
| `LandingPage.tsx` | 49 | Emoji `🌐` dans le JSX — hétérogène avec le reste de l'UI |

---

## Résumé par priorité

| Priorité | Problème | Fichier(s) |
|---|---|---|
| Haute | `startFromEnd` — code mort | `BookViewer.tsx` |
| Haute | `generateStaticParams` dupliqué | `layout.tsx` / `page.tsx` |
| Haute | `(window as any).Paged` dupliqué | `BookViewer.tsx`, `BookPreloader.tsx` |
| Moyenne | UI skeleton dupliquée | `BookViewerLoader.tsx`, `BookShellLayout.tsx` |
| Moyenne | `getBookForSlug` non utilisée | `BookShellLayout.tsx` |
| Moyenne | `locale: string` au lieu de `Locale` | composants + `nav.ts` |
| Basse | Exemple JSDoc trailing slash incorrect | `content.ts` |
