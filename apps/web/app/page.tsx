export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", margin: "2rem" }}>
      <h1>AI_OS — Phase 00 MVP</h1>
      <p>
        Money-First MVP scope: opportunity list, affiliate links, click tracking,
        revenue/profit records, one content channel, manual publishing.
      </p>
      <ul>
        <li>
          <a href="/dashboard">dashboard</a> — clicks, conversions, profit
        </li>
        <li>affiliate links + click tracker</li>
        <li>revenue_events / profit_records</li>
        <li>content assets for Pinterest publishing (manual)</li>
      </ul>
    </main>
  );
}