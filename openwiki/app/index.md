# Files

- [Persistence and Import Trust Boundary](persistence.md) - serialize/parseImport/loadLocal/saveLocal implement the fundle/v1 export and localStorage format, with field-by-field validation, legacy fin-tracker/v1 migration, cache drop-vs-throw, and settings clamping.
- [Settings and Export Schema](schema.md) - The Settings interface, DEFAULT_SETTINGS, the ExportFileV1 document shape, and the fundle/v1 / fin-tracker/v1 schema ids.
- [App Store — Reducer, Context and Refresh Scheduling](store.md) - The AppProvider owns all state via useReducer+Context, exposes AppActions, and runs the price refresh flow with series-freshness reuse, allSettled error handling, an interval timer and concurrency guards.
