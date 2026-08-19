---
type: operations
title: Build, Test and Deploy
description: Vite + TypeScript build pipeline, vitest test suite, tsconfig strictness, and the GitHub Pages deploy and OpenWiki update workflows.
tags: [operations, build, test, deploy, github-actions]
---

# Build, Test and Deploy

Fundle is a static client-only app: `npm run build` emits plain static files into `dist/`, served with no server-side code.

## Scripts (`package.json`)

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `vite` | Dev server on `http://localhost:5173` |
| `build` | `tsc -b && vite build` | Type-check then production build into `dist/` |
| `preview` | `vite preview` | Serve the production build locally |
| `test` | `vitest run` | Run the vitest suite once (no watch) |
| `test:api-health` | `node scripts/api-health-check.mjs` | Connectivity check for every external price-data API host (no keys spent) |
| `test:e2e` | `playwright test` | End-to-end smoke test (boots `preview` on port 4173) |
| `typecheck` | `tsc -b --noEmit` | Type-check only |

## Vite config (`vite.config.ts`)

```ts
defineConfig({
  base: './',
  plugins: [react()],
  test: { exclude: ['**/node_modules/**', 'e2e/**'] },
})
```

`base: './'` makes the build work on **any** GitHub Pages path — a user site (`user.github.io`) or a project subpath (`user.github.io/repo/`) — because asset URLs are relative. `@vitejs/plugin-react` provides JSX/Fast Refresh. The `test.exclude` keeps vitest from picking up Playwright specs under `e2e/` (Playwright runs them via `npm run test:e2e`).

## TypeScript (`tsconfig.json`)

Strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess` (so `arr[i]` is `T | undefined` — hence the `!` non-null assertions in the domain code, e.g. `allLots[0]!.date`), `verbatimModuleSyntax` (enforces `import type` for type-only imports), `isolatedModules`. Target ES2022, module ESNext, `moduleResolution: bundler`, `jsx: react-jsx`. `include: ["src"]`, `types: ["vite/client"]`. `noEmit: true` — Vite emits, tsc only checks.

## Dependencies

Runtime: `react@^19.1`, `react-dom@^19.1`, `recharts@^2.15` (charts only). Dev: `vite@^6`, `@vitejs/plugin-react`, `typescript@^5.7`, `vitest@^2.1`, `@types/react`, `@types/react-dom`, `@playwright/test@^1.62` (e2e). No state library, no router, no CSS framework.

## Tests

Three layers of tests, each with a dedicated script:

**Unit/data tests** (`npm test`, vitest) — nine files, all stub `fetch` via `vi.stubGlobal('fetch', ...)` with `afterEach` unstubbing, so no network:

- `src/domain/portfolio.test.ts` — snapshot math ([portfolio](../domain/portfolio.md)).
- `src/domain/performance.test.ts` — TWR invariants including sale handling ([performance](../domain/performance.md)).
- `src/data/yahoo.test.ts` — proxy + Yahoo adapter ([Yahoo](../data/yahoo.md)).
- `src/data/proxy.test.ts` — multi-proxy fallback in `fetchJson` incl. `RequestInit` forwarding ([proxy](../data/price-provider.md#cors-proxy-and-timeout-srcdataproxyts)).
- `src/data/eodhd.test.ts` — [EODHD](../data/eodhd.md) adapter.
- `src/data/alphaVantage.test.ts` — [Alpha Vantage](../data/alphavantage.md) adapter.
- `src/data/openfigi.test.ts` — [OpenFIGI](../data/openfigi.md) adapter.
- `src/data/boerseFrankfurt.test.ts` — [Börse Frankfurt](../data/boerse-frankfurt.md) adapter.
- `src/app/persistence.test.ts` — import/export trust boundary ([persistence](../app/persistence.md)).

**API health** (`npm run test:api-health`, `scripts/api-health-check.mjs`) — a connectivity check that verifies each external price-data host (Yahoo, Börse Frankfurt, OpenFIGI, Alpha Vantage, EODHD, Twelve Data) is reachable and answers, without fetching real market data or spending API keys. Exits non-zero on any failure.

**E2E smoke** (`npm run test:e2e`, Playwright, `e2e/smoke.spec.ts`) — boots the production build via `npm run preview --port 4173`, then asserts the app boots, JS executes (`.app-name` renders "Fundle"), and **no console errors** fire. Runs across chromium, firefox, and webkit projects (`playwright.config.ts`). In CI it runs after `npm run build`; locally `reuseExistingServer` reuses an already-running preview.

## Deploy to GitHub Pages (`.github/workflows/deploy.yml`)

Triggers on `push` to `main` (with `paths-ignore` for `openwiki/**`, `.github/**`, `README.md`, `CLAUDE.md`, `AGENT.md`, `LICENSE` — doc/CI-only changes skip a deploy) and `workflow_dispatch`. An **`integration-tests` job** runs first (a reusable workflow in `.github/workflows/integration-tests.yml`): it runs `npm run test:api-health` and a Playwright e2e job (`npx playwright install --with-deps chromium firefox webkit`, `npm run build`, `npm run test:e2e`). The `build` job (`needs: integration-tests`, ubuntu-latest, Node 22, `npm ci`, `npm test`, `npm run build`) uploads `dist/` as a Pages artifact; the `deploy` job publishes to the `github-pages` environment. `concurrency: { group: pages, cancel-in-progress: true }` cancels superseded runs. Permissions: `contents: read`, `pages: write`, `id-token: write`.

To enable: **Settings → Pages → Source: GitHub Actions**, then push to `main`. Live at `https://<user>.github.io/<repo>/` shortly after.

To deploy elsewhere: `npm run build` and serve `dist/` — it is plain static files.

## OpenWiki update (`.github/workflows/openwiki-update.yml`)

A weekly scheduled (`cron: 0 9 * * 3`, Wednesdays 09:00 UTC) and manually-dispatchable workflow that runs `openwiki code --update --print` (Node 22, OpenWiki installed globally) and commits changes directly to `main` (`contents: write` permission). Uses `OPENWIKI_PROVIDER: openrouter` with `OPENWIKI_MODEL_ID: z-ai/glm-5.2`. Full `fetch-depth: 0` so the update can diff HEAD against the last-documented commit. If there are no changes, it exits without committing.

## OpenWiki wiki sync (`.github/workflows/openwiki-wiki-sync.yml`)

Keeps the GitHub wiki mirrored 1:1 with the `openwiki/` folder, in both directions:

- **repo → wiki** (on `push` to `main` touching `openwiki/**`): `rsync`s `openwiki/` into the wiki repo, renames `index.md` to `Home.md` (GitHub wikis require a `Home` page), and pushes.
- **wiki → repo** (on `gollum` — a wiki page edit): `rsync`s the wiki repo back into `openwiki/`, renames `Home.md` to `index.md`, and commits to `main`.

Everything else keeps its path (GitHub wiki repos support subdirectories).

## Validation

- Narrowest check before a change: `npm test` (runs the affected domain/data/persistence suite).
- Type errors: `npm run typecheck`.
- External-API connectivity (conditional — run before changing an adapter's request URLs or when a host seems down): `npm run test:api-health`.
- E2E smoke (conditional — run after header/bootstrap or build-output changes): `npm run build && npm run test:e2e`.
- Full pre-deploy gate (run by the deploy workflow): integration-tests (`test:api-health` + `test:e2e`) then `npm ci && npm test && npm run build`.
