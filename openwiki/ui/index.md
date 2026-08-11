# Files

- [App Shell — Layout, Tabs, Header and Format Helpers](app-shell.md) - main.tsx bootstraps the AppProvider; App.tsx renders the header (portfolio selector, stats, Update, Backup, Help), the tab bar, and the active view; format.ts provides Intl-based money/pct/date/signClass helpers.
- [Forms and Dialogs — AddAssetForm, SettingsView, BackupMenu, PortfolioDialogs](forms.md) - The modal forms for adding assets with provider search and multi-lot entry, the settings form (provider/API key/proxy/refresh/currency), the export/import backup dropdown, and the portfolio add/delete confirmation dialogs.
- [Overview Tab — Asset Table and Lot Editor](overview.md) - Overview renders the portfolio snapshot as a sortable asset table with expandable per-asset AssetDetail (lot list, add-lot form, remove asset), plus the Add-asset dialog trigger.
- [Performance Tab — Value/TWR Chart and Per-Asset Lines](performance-view.md) - PerformanceView renders a dual-axis value + time-weighted return chart and a per-asset (or per-portfolio) percentage chart, with range selection, line toggles, and the simplePct comparison toggle.
