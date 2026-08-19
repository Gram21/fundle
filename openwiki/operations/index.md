# Files

- [Build, Test and Deploy](build-test-deploy.md) - Vite + TypeScript build pipeline, vitest test suite, tsconfig strictness, and the GitHub Pages deploy and OpenWiki update workflows.
- [Self-hosted CORS Proxy (Cloudflare Worker)](cors-proxy.md) - A Cloudflare Worker that relays browser requests to Fundle's market-data APIs with a fixed host allowlist and POST/body forwarding, deployed from worker/ with wrangler. The only way to make OpenFIGI's POST mapping endpoint work from the browser, and a reliable owned alternative to the flaky public CORS proxies.
