export default function Header({ advice, onLogin, theme, onToggleTheme }) {
  return (
    <header style={{ textAlign: "center", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
        <button onClick={onToggleTheme} className="primary-btn">
          {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
        </button>
        <button onClick={onLogin} className="primary-btn">Login / Register</button>
      </div>
      <h1 style={{ color: "var(--accent)" }}>STMS</h1>
      <div style={{ padding: "15px", backgroundColor: "var(--card-bg)", borderLeft: "5px solid var(--accent)", borderRadius: "4px" }}>
        <strong>AI Insight:</strong> {advice}
      </div>
    </header>
  );
}