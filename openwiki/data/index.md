# Files

- [PriceProvider Port and Provider Registry](price-provider.md) - The PriceProvider interface (search/quote/history), PriceProviderError, the createProvider factory and PROVIDERS registry, and the CORS proxy/timeout helper used by both adapters.
- [Twelve Data Adapter](twelvedata.md) - The API-key PriceProvider adapter — native CORS, no proxy, with search/quote/history endpoints and error-response detection.
- [Yahoo Finance Adapter](yahoo.md) - The default PriceProvider adapter — search, quote and history via the Yahoo Finance chart API, all routed through a CORS proxy, with adjclose preference and null-skip deduplication.
