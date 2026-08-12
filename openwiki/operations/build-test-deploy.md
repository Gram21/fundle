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
| `test` | `vitest run` | Run the test suite once (no watch) |
| `typecheck` | `tsc -b --noEmit` | Type-check only |

## Vite config (`vite.config.ts`)

```ts
defineConfig({ base: './', plugins: [react()] })
```

`base: './'` makes the build work on **any** GitHub Pages path — a user site (`user.github.io`) or a project subpath (`user.github.io/repo/`) — because asset URLs are relative. `@vitejs/plugin-react` provides JSX/Fast Refresh.

## TypeScript (`tsconfig.json`)

Strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess` (so `arr[i]` is `T | undefined` — hence the `!` non-null assertions in the domain code, e.g. `allLots[0]!.date`), `verbatimModuleSyntax` (enforces `import type` for type-only imports), `isolatedModules`. Target ES2022, module ESNext, `moduleResolution: bundler`, `jsx: react-jsx`. `include: ["src"]`, `types: ["vite/client"]`. `noEmit: true` — Vite emits, tsc only checks.

## Dependencies

Runtime: `react@^19.1`, `react-dom@^19.1`, `recharts@^2.15` (charts only). Dev: `vite@^6`, `@vitejs/plugin-react`, `typescript@^5.7`, `vitest@^2.1`, `@types/react`, `@types/react-dom`. No state library, no router, no CSS framework.

## Tests

`vitest run` executes six test files (no UI/store integration tests):

- `src/domain/portfolio.test.ts` — snapshot math ([portfolio](../domain/portfolio.md)).
- `src/domain/performance.test.ts` — TWR invariants including sale handling ([performance](../domain/performance.md)).
- `src/data/yahoo.test.ts` — proxy + Yahoo adapter ([data](../data/yahoo.md)).
- `src/data/proxy.test.ts` — multi-proxy fallback in `fetchJson` ([proxy](../data/price-provider.md#cors-proxy-and-timeout-srcdataproxyts)).
- `src/data/boerseFrankfurt.test.ts` — Börse Frankfurt adapter ([Börse Frankfurt](../data/boerse-frankfurt.md)).
- `src/app/persistence.test.ts` — import/export trust boundary ([persistence](../app/persistence.md)).

Tests use `vi.stubGlobal('fetch', ...)` to avoid network; `afterEach` unstubbing.

## Deploy to GitHub Pages (`.github/workflows/deploy.yml`)

Triggers on `push` to `main` (with `paths-ignore` for `openwiki/**`, `.github/**`, `README.md`, `CLAUDE.md`, `AGENT.md`, `LICENSE` — doc/CI-only changes skip a deploy) and `workflow_dispatch`. The `build` job (ubuntu-latest, Node 22, `npm ci`, `npm test`, `npm run build`) uploads `dist/` as a Pages artifact; the `deploy` job publishes to the `github-pages` environment. `concurrency: { group: pages, cancel-in-progress: true }` cancels superseded runs. Permissions: `contents: read`, `pages: write`, `id-token: write`.

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
- Full pre-deploy gate (run by the deploy workflow): `npm ci && npm test && npm run build`.
