export default function HelpDialog() {
  return (
    <div className="help-content">
      <h2>About Fundle</h2>
      <p>
        Tracks portfolios of ETFs, stocks and similar assets. Everything runs in your browser —
        there is no server and no account. Data lives only in this browser's local storage.
      </p>

      <h3>Adding assets</h3>
      <p>
        Use <strong>+ Add asset</strong> on the Overview tab. Search by ISIN or WKN to find the
        provider symbol, or type it directly (e.g. <code>EUNL.DE</code>). Add one buy order per
        purchase (date, quantity, price, optional fee) — you can add more later from the asset row.
      </p>

      <h3>Prices</h3>
      <p>
        Prices refresh on load, every few minutes, and on <strong>Update</strong>. Adjust the
        provider, API key or refresh interval in Settings.
      </p>

      <h3>The two performance lines</h3>
      <p>
        <strong>Value</strong> is what the portfolio is worth in money — it jumps whenever you buy
        more. <strong>Gain/loss %</strong> is your actual return: it only moves with price, never
        with a purchase, so it stays comparable over time. Hover the "plain value-vs-cost %"
        checkbox on the Performance tab for how the two differ.
      </p>

      <h3>Backup</h3>
      <p>
        Nothing is stored anywhere but this browser. Use <strong>Export</strong> in Settings
        regularly, and <strong>Import</strong> to restore or move to another device.
      </p>
    </div>
  )
}
