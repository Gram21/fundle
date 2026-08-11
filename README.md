# Fundle

Stateless, client-only portfolio tracker for ETFs, stocks and similar assets. Runs entirely in
the browser, keeps no server state, and deploys to GitHub Pages as static files.

## What it does

- Track one or more portfolios of assets, each with any number of buy orders (date, quantity,
  price per share, optional fee).
- Fetch the current price plus daily closes since the first buy from a free market-data API.
- Show per-asset and total value, the change since the previous close, and the change against
  the buy price(s).
- Chart the portfolio's monetary value against its gain/loss in percent, and each asset's
  percentage development.
- Export everything to JSON and import it back. Nothing is stored on a server.

### The percentage line

Buying more of an asset raises the portfolio's monetary value, but that is new money, not a gain.
The percentage line is therefore a **time-weighted return**: daily returns are chained after
subtracting that day's cash flow, so a purchase leaves the percentage untouched and only later
price moves affect it. The value line still shows the deposit. The dashed *incl. new money* line
in the Performance view is the naive `value / cost − 1` for contrast.

An inflow is valued at the same daily close the position is valued at, not at the price you paid.
Those two differ routinely — providers serve dividend-adjusted closes, the fill may have happened
on another exchange, and there are fees — and subtracting cash while adding market value would
book that gap as a price move, which is the very jump this line must not have. The
paid-versus-market difference is a cost-basis effect, so it stays visible in the value, the
cost basis and the change against the buy price.

## Data sources

| Provider | API key | CORS proxy | Notes |
| --- | --- | --- | --- |
| Yahoo Finance (default) | no | **required** | One request returns price, previous close and the daily series. ISIN search works; German WKNs usually do not resolve — enter the symbol (e.g. `EUNL.DE`) directly. |
| Twelve Data | yes (free tier) | no | Sends `Access-Control-Allow-Origin: *`, so it works without a proxy. |

Börse Frankfurt's `api.boerse-frankfurt.de` was evaluated and **cannot** be used from a static
site: it answers `403` to any request carrying an `Origin` header, and its history endpoints
require signed `X-Security` headers. A proxy is unavoidable for the Yahoo path; the proxy prefix
is configurable in Settings (default `https://corsproxy.io/?url=`, which serves browser requests
on its free tier). Public proxies are rate-limited and go down, so swap in another one — or your
own — when prices stop arriving; requests time out after 15 s with a hint pointing at the
setting. Switching to Twelve Data with a free key avoids proxies altogether.

## Running locally

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. Other scripts:

```bash
npm test        # vitest
npm run build   # production build into dist/
npm run preview # serve the production build locally
```

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes `dist/` on every push to `main`. Enable it
once per repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Push
to `main` and the app is live at `https://<user>.github.io/<repo>/` a minute or two later. The
Vite `base` is `./`, so the same build works on a user site and on a project subpath.

To deploy anywhere else, `npm run build` and serve the `dist/` folder — it is plain static files,
no server-side code involved.

## Architecture

```
src/
  domain/       pure model and math, no IO         types, metrics, portfolio, performance
  data/         market-data port and adapters       PriceProvider, yahoo, twelvedata, proxy
  app/          state, scheduling, persistence      store, persistence, schema
  ui/           React views                         Overview, PerformanceView, AddAssetForm, SettingsView
```

Dependencies point inwards only: `ui` → `app` → `data`/`domain`, and `domain` imports nothing.
Swapping in another market-data API means writing one more `PriceProvider` adapter.

## Scope

Sells and dividends are not modelled — every position is buy-only. Amounts are used as returned
by the provider, with no FX conversion, so mixing currencies inside one portfolio mixes units.

The app has an in-app help screen (the **?** button in the header) covering the same ground for
end users.

## License

GPLv3 — see [LICENSE](LICENSE).
