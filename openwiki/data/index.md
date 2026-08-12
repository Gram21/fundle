# Files

- [Börse Frankfurt Adapter — ISIN-native supplementary quotes](boerse-frankfurt.md) - A supplementary PriceProvider that supplies live EUR quotes for Deutsche Börse Group instruments via the quote_box API, encoded as ISIN@MIC symbols and auto-routed by resolveProvider; history falls back to Yahoo's ISIN search.
- [PriceProvider Port and Provider Registry](price-provider.md) - The PriceProvider interface (search/quote/history), PriceProviderError, the createProvider factory, resolveProvider per-symbol dispatch, the PROVIDERS registry, and the multi-proxy CORS fallback helper used by the adapters.
- [Twelve Data Adapter](twelvedata.md) - The API-key PriceProvider adapter — native CORS, no proxy, with search/quote/history endpoints and error-response detection.
- [Yahoo Finance Adapter](yahoo.md) - The default PriceProvider adapter — search, quote and history via the Yahoo Finance chart API, all routed through a CORS proxy, with adjclose preference and null-skip deduplication.
