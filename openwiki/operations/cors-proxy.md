---
type: operations
title: Self-hosted CORS Proxy (Cloudflare Worker)
description: A Cloudflare Worker that relays browser requests to Fundle's market-data APIs with a fixed host allowlist and POST/body forwarding, deployed from worker/ with wrangler. The only way to make OpenFIGI's POST mapping endpoint work from the browser, and a reliable owned alternative to the flaky public CORS proxies.
tags: [operations, cors-proxy, cloudflare-worker, deploy, proxy]
---

# Self-hosted CORS Proxy (`worker/`)

Fundle is a static, backend-less app, so every market-data request happens straight from the browser. Yahoo, Börse Frankfurt, EODHD, and OpenFIGI all either send no CORS headers or reject browser-origin requests outright, so those requests must be relayed through something that isn't the browser. The app ships with a [fallback list of free public CORS proxies](../app/schema.md#default_settings), but every one of them has, at some point, gone dead, started rate-limiting hard, or started blocking non-localhost origins entirely.

A Cloudflare Worker you own doesn't have that problem, has a generous free tier (100,000 requests/day — far more than a personal portfolio needs), and is the **only** way to make [OpenFIGI's](../data/openfigi.md) ISIN lookup work at all, since OpenFIGI requires a `POST` with a JSON body and the public proxies only relay `GET`.

## What it does (`worker/cors-proxy.js`)

- **Host allowlist**: only relays requests to a fixed `ALLOWED_HOSTS` set (Yahoo `query1`/`query2`, `api.boerse-frankfurt.de`, `eodhd.com`, `www.alphavantage.co`, `api.openfigi.com`, `api.twelvedata.com`). Anything else returns `403 host not allowed`. This is deliberate: an open relay to *any* URL gets discovered and abused by bots within days — the same failure mode that killed every public proxy this app tried. **Adding a new provider that needs proxying means adding its hostname here and redeploying.**
- **Method/body/header forwarding**: forwards the request method, the `Content-Type` header, and (for OpenFIGI) the `X-OPENFIGI-APIKEY` header, plus the body for non-GET requests. It does **not** forward cookies or any other headers — stripping everything else is the safer default.
- **CORS headers**: adds `Access-Control-Allow-Origin: *`, `Allow-Methods: GET, POST, OPTIONS`, `Allow-Headers: Content-Type, X-OPENFIGI-APIKEY`, and handles `OPTIONS` preflight directly.
- **Target via `?url=`**: the target URL is read from the `?url=` query param (URL-encoded by the app's [`proxied`](../data/price-provider.md#proxiedurl-proxyurl) helper). A missing or invalid target returns `400`; an upstream fetch failure returns `502`.

## Configuration (`worker/wrangler.toml`)

```toml
name = "fundle-cors-proxy"
main = "cors-proxy.js"
compatibility_date = "2024-01-01"
```

## Deploy

See `worker/DEPLOY.md` for the full 10-minute walkthrough. In short, from the `worker/` directory:

```bash
npm install -g wrangler
wrangler login      # authorize Wrangler against your Cloudflare account
wrangler deploy     # reads wrangler.toml + cors-proxy.js
```

The deploy prints a URL like `https://fundle-cors-proxy.YOUR-SUBDOMAIN.workers.dev`. Put that URL (with `/?url=` appended) **first** in Fundle's **Settings → CORS proxy URL** comma-separated list, keeping the public proxies after it as fallbacks:

```
https://fundle-cors-proxy.YOUR-SUBDOMAIN.workers.dev/?url=,https://api.allorigins.win/raw?url=,https://api.cors.lol/?url=
```

The shipped `DEFAULT_SETTINGS.proxyUrl` already leads with this project's own Worker (`https://fundle-cors-proxy.gram21.workers.dev/?url=`); a fork should deploy its own Worker and swap that URL.

## Verify

```bash
curl "https://fundle-cors-proxy.YOUR-SUBDOMAIN.workers.dev/?url=https%3A%2F%2Fquery1.finance.yahoo.com%2Fv8%2Ffinance%2Fchart%2FAAPL"
```

Real JSON back means it works; an error means check the allowlist / `?url=` encoding.

## Change guidance

- **Add a provider that needs proxying**: add its API hostname to `ALLOWED_HOSTS` in `worker/cors-proxy.js` and redeploy (`wrangler deploy` — the same one command every time). This is the single seam that breaks when a new proxied provider is added; the app-side `proxied`/`fetchJson` need no change.
- **Updating the Worker later**: if `cors-proxy.js` changes, `wrangler deploy` again from `worker/`. There is no build step.
- **No tests**: the Worker is a thin relay with an allowlist; its behavior is verified by the `curl` smoke check above and by the app working end-to-end.
