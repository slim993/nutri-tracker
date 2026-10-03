# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                       # dev server, http://localhost:4200
npm run build                   # production build → dist/nutri-tracker
npm test                        # all unit tests (vitest via @angular/build:unit-test)
npx ng test --include src/app/core/models.spec.ts    # a single spec file
npx prettier --write .          # formatting (100 cols, single quotes, .prettierrc)
```

No lint target is configured — `npm run build` (strict TS) plus Prettier are the only gates.

The service worker is disabled in `ng serve` (`isDevMode()` in `app.config.ts`). To exercise
offline behaviour you must build and serve the output:

```bash
npm run build && npx http-server dist/nutri-tracker/browser -p 8080
```

## Git

**No AI signatures anywhere in git history.** Never add `Co-Authored-By: Claude …`,
"Generated with Claude Code" or any similar AI attribution to commit messages, PR
descriptions, tags or release notes. Commits are authored by the repo owner only.

## Architecture

Angular 22 standalone PWA, French UI / English code, **no backend and no network calls at
runtime**. Everything lives in the browser's IndexedDB.

### Data layer (`src/app/core/`)

This is where the important invariants are; read it before touching a screen.

- `db.ts` — single memoized `getDb()` opening one IndexedDB database with six stores
  (`foods`, `meals`, `logEntries`, `weightEntries`, `settings`, `workouts`). Adding or changing a
  store means bumping `DB_VERSION` and extending `upgrade()` (the `contains()` guards make it
  re-runnable), plus wiring the store into `DataService` export/import/reset. Wrap raw idb calls in `dbTry()` so failures
  surface as a `DbError` carrying a French, user-presentable message.
- One service per store (`FoodsService`, `MealsService`, `LogService`, `WeightService`,
  `SettingsService`). **Each holds the whole store in a signal**: `load()` reads it once at
  startup, and every mutation writes to IndexedDB *then* updates the signal. Components read
  signals synchronously and never touch `getDb()` directly. The dataset is small by design —
  derived views (day grouping, weekly aggregates, moving averages) are `computed()` over the
  in-memory arrays, not queries.
- `DataService` is the facade: `init()` seeds + loads every store and flips `ready`/`error`,
  which `App` uses to gate the whole UI. It also owns whole-database export/import/reset, since
  those cross every store in one transaction.
- `seed.ts` runs only when the `foods` store is empty, so it never fights user data or replays
  after an import. `reset()` deliberately re-seeds rather than leaving an empty app.

### Claude integration = copy/paste bridge, not API

A deliberate decision: the app stays 100% local with **no Anthropic API key and no backend**.
`core/claude-bridge.service.ts` builds a context prompt (targets, weights, history) the user
copies into the Claude app, and parses the JSON plan Claude returns (pasted back into the
Entraînement screen). When adding AI-assisted features (e.g. weekly meal planning), extend this
bridge — do not add network calls or SDK dependencies. The parser must stay tolerant of prose
around the fenced JSON block; it is covered by `claude-bridge.service.spec.ts`.

### Conventions

- Macro values on a `Food` are **always per 100 g**; `macrosFor(food, grams)` scales them.
  Nothing else should do that arithmetic inline.
- Dates are `YYYY-MM-DD` strings built with `toDateKey()`, which formats in **local time** —
  using `toISOString()` would shift the day for evening entries. `fromDateKey`/`shiftDateKey`
  are the only ways to move between keys and `Date`.
- Screens are one folder each (`journal/`, `foods/`, `meals/`, `weight/`, `stats/`, `settings/`),
  lazy-loaded from `app.routes.ts` with French URL paths. All use `OnPush` and signal-based
  state; forms are `[ngModel]`/`(ngModelChange)` bound to signals rather than reactive forms.
- Shared UI lives in `shared/`: `macro-progress.ts` (the kcal/macro bars), `_sheet.scss`
  (bottom-sheet + FAB + list chrome, pulled in with `@use '../shared/sheet'`), and
  `chart-defaults.ts` (dark-theme Chart.js options — line charts are deliberately not
  zero-based so weight movement stays visible).
- Theme tokens (`--bg`, `--surface`, `--accent`, per-macro colours, `--tabbar-h`) are defined in
  `src/styles.scss`. Fixed-position UI must account for `env(safe-area-inset-bottom)` and the tab
  bar; inputs stay at 16px to stop iOS Safari zooming on focus.
- Charts use `ng2-charts`; `provideCharts(withDefaultRegisterables())` is registered in
  `app.config.ts`.

### Testing

Only pure helpers are covered (`core/models.spec.ts`) — services need a real IndexedDB, so keep
non-trivial logic in pure functions in `models.ts` where it can be tested directly.
