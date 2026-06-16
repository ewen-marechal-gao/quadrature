# Code Review — web/src

Revue qualité (juin 2026). Aucune modification appliquée.

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

## 3. CSS — `globals.css`

### SVG de bruit répété 4 fois

La data-URI de texture grain (SVG feTurbulence) est copiée-collée dans :
- `.top-bar` (l. 76)
- `.book-sidebar` (l. 239)
- `.landing-book-card` (l. 677)
- `.landing-book-card:hover` (l. 701)

Avec Tailwind v4, extraire en variable CSS dans `:root` :

```css
--noise-texture: url("data:image/svg+xml,...");
```

### `.sidebar-link` défini en deux blocs séparés

Styles de mise en page aux lignes 293–304, puis overrides bouton aux lignes 469–475,
séparés par ~165 lignes sans relation. Regrouper les deux blocs.

### Couleurs brass codées en dur

Les tokens `--brass-*` existent mais plusieurs règles utilisent encore les valeurs brutes
avec des alphas non couverts : `rgba(196,154,69,0.30)`, `0.35`, `0.55`, `0.22`, `0.40`.
Ajouter les tokens manquants ou normaliser vers les tokens existants.

### Commentaire double sur `.top-bar-download` (l. 192–194)

```css
/* ─── Bouton télécharger PDF ──────────────────────────────────────────────── */
/* Bouton télécharger PDF */
.top-bar-download {
```

Le commentaire inline est redondant avec le titre de section. Supprimer la ligne 194.

---

## 4. Typage

### `locale` typé `string` au lieu de `Locale`

`Locale = "fr" | "en"` est défini dans `nav.ts:24` mais non propagé aux props :
- `BookShell`, `BookShellLayout`, `LandingPage`, `LocaleSwitcher` — `locale: string`
- `localize(field, locale: string)` — accepte n'importe quelle chaîne

`resolveLocale()` garantit la valeur en entrée, mais les composants descendants
ne bénéficient pas de la vérification statique. Passer `Locale` partout où la valeur
est déjà résolue.

---

## 5. Documentation

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

## 6. Anti-patterns mineurs

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
| Moyenne | SVG noise répété 4× | `globals.css` |
| Moyenne | `locale: string` au lieu de `Locale` | composants + `nav.ts` |
| Basse | `.sidebar-link` en deux blocs éloignés | `globals.css` |
| Basse | Couleurs brass sans tokens | `globals.css` |
| Basse | Exemple JSDoc trailing slash incorrect | `content.ts` |
| Basse | Double commentaire `.top-bar-download` | `globals.css` |
