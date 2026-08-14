# Deploying your own CORS proxy (Cloudflare Worker)

Fundle is a static, backend-less app, so every market-data request happens straight from your
browser. Yahoo, Börse Frankfurt, EODHD, and OpenFIGI all either send no CORS headers or reject
browser-origin requests outright, so the requests have to be relayed through something that
isn't your browser. The app ships with a fallback list of free public CORS proxies for this, but
every one of them has, at some point, gone dead, started rate-limiting hard, or started blocking
non-localhost origins entirely (that's a real, repeated failure mode this app has hit — see the
comments in `src/app/schema.ts` and `src/data/proxy.ts`).

A Worker you own doesn't have that problem, has a generous free tier (100,000 requests/day —
far more than a personal portfolio needs), and is the only way to make OpenFIGI's ISIN lookup
work at all, since OpenFIGI requires a `POST` with a JSON body and the public proxies only
relay `GET`.

This takes about 10 minutes and costs nothing.

## Prerequisites

- A free Cloudflare account: https://dash.cloudflare.com/sign-up
- Node.js installed locally (you already have this — it's what runs Fundle itself)

## Step 1 — Install Wrangler (Cloudflare's CLI)

```bash
npm install -g wrangler
```

## Step 2 — Log in

```bash
wrangler login
```

This opens a browser tab asking you to authorize Wrangler against your Cloudflare account.
Approve it.

## Step 3 — Deploy the Worker

From the `worker/` directory of this repository:

```bash
cd worker
wrangler deploy
```

Wrangler reads `wrangler.toml` and `cors-proxy.js` in that same directory and deploys them. On
success it prints a URL that looks like:

```
https://fundle-cors-proxy.YOUR-SUBDOMAIN.workers.dev
```

That subdomain is chosen once, automatically, the first time you deploy any Worker on your
account — you can't pick it, but you also never need to touch it again.

Copy that URL — you need it in the next step.

## Step 4 — Point Fundle at it

Open Fundle → **Settings** → **CORS proxy URL**, and put your Worker's URL first in the
comma-separated list, with `/?url=` appended:

```
https://fundle-cors-proxy.YOUR-SUBDOMAIN.workers.dev/?url=,https://api.allorigins.win/raw?url=,https://api.cors.lol/?url=
```

Keeping the public proxies after it as further fallbacks costs nothing and doesn't hurt — they
just won't usually be needed anymore.

## Step 5 — Verify it works

In Fundle, open **Add asset**, search any ISIN (e.g. `IE00B4L5Y983`), and confirm a result comes
back. If you want to see it directly:

```bash
curl "https://fundle-cors-proxy.YOUR-SUBDOMAIN.workers.dev/?url=https%3A%2F%2Fquery1.finance.yahoo.com%2Fv8%2Ffinance%2Fchart%2FAAPL"
```

You should get real JSON back, not an error.

## What it does and doesn't do

- It only relays requests to a fixed allowlist of hosts (Yahoo, Börse Frankfurt, EODHD, Alpha
  Vantage, OpenFIGI, Twelve Data — see `ALLOWED_HOSTS` in `cors-proxy.js`). It will refuse
  anything else with a 403. This is deliberate: an open relay to *any* URL gets discovered and
  abused by bots within days, which is exactly the kind of load spike that gets a free proxy
  rate-limited or banned — the same failure mode that killed every public proxy this app tried.
  If you add another provider that needs proxying later, add its hostname to that list and
  redeploy (`wrangler deploy` again — it's the same one command every time).
- It forwards the request method, the `Content-Type` header, and (for OpenFIGI) the
  `X-OPENFIGI-APIKEY` header, plus the body for non-GET requests. It does **not** forward
  cookies or any other headers — there's nothing in your browser worth leaking to a market-data
  API, and stripping everything else is the safer default.
- It does not store or log anything beyond Cloudflare's own standard request metrics (visible
  only to you, in your Cloudflare dashboard).

## Updating it later

If this file's `cors-proxy.js` changes (e.g. a future update adds another provider's hostname to
the allowlist), just re-run `wrangler deploy` from the `worker/` directory — it redeploys to the
same URL, nothing else needs to change.

## Cost

Cloudflare Workers' free tier is 100,000 requests/day. A personal portfolio refreshing every few
minutes across a handful of assets is nowhere close to that ceiling. If you ever did exceed it,
Cloudflare would start returning errors for the excess requests rather than silently charging
you — Workers only bills if you've explicitly enabled a paid plan.
