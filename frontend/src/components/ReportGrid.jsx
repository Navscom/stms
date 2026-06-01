import '../css/ReportGrid.css';

export default function ReportGrid({ report = {}, reportHighlight = null, onReportHover = () => {}, onReportHoverEnd = () => {}, onReportSelect = () => {} }) {
  const primaryCards = [
    {
      id: 'all-destinations',
      label: 'Total Destinations',
      value: report.total_destinations || 0,
      subtitle: 'Highlight all destinations',
    },
    {
      id: 'high-crowd',
      label: 'High Crowd Areas',
      value: report.crowd_summary?.High || 0,
      subtitle: 'Highlight crowd hotspots',
    },
    {
      id: 'high-danger',
      label: 'High Danger Reports',
      value: report.danger_summary?.High || 0,
      subtitle: 'Highlight high-danger markers',
    },
    {
      id: 'crowdy-markers',
      label: 'Auto Crowdy Markers',
      value: report.crowdy_markers_total || 0,
      subtitle: 'Auto-created crowdy area markers',
    },
    {
      id: 'moderated-comments',
      label: 'Moderated Comments',
      value: report.moderated_comments || 0,
      subtitle: 'Comments flagged by moderation',
    },
  ];

  const aiCards = [
    {
      id: 'predictions-generated',
      label: 'Predictions Generated',
      value: report.predictions_generated || 0,
      subtitle: 'AI crowd pattern forecasts',
    },
    {
      id: 'languages-supported',
      label: 'Languages Supported',
      value: report.languages_supported || 1,
      subtitle: 'Languages available for alerts',
    },
    {
      id: 'avg-pred-confidence',
      label: 'Avg Prediction Confidence',
      value: report.avg_prediction_confidence ? Math.round(report.avg_prediction_confidence * 100) + '%' : '0%',
      subtitle: 'Average confidence for forecasts',
    },
  ];

  const markerTypes = report.marker_type_counts || {}; // expect { 'Crowdy Area': 3, 'Dark Area': 4, ... }
  const defaultMarkerTypes = ['Crowdy Area', 'Dark Area', 'Danger Area', 'Hazard on Area', 'Dangerous Animals'];
  const markerKeys = Array.from(new Set([...defaultMarkerTypes, ...Object.keys(markerTypes)]));

  const markerCards = markerKeys.map((key) => ({
    id: `marker-${key.replace(/\s+/g, '-').toLowerCase()}`,
    label: key,
    value: markerTypes[key] || 0,
    subtitle: 'Count by type',
  }));

  function SimpleBarChart({ data = [], labels = [], width = null, height = 110 }) {
    const viewBoxWidth = 480;
    const max = Math.max(...data, 1);
    const count = data.length || 1;
    const slot = viewBoxWidth / count;
    const barW = slot * 0.6;

    return (
      <svg viewBox={`0 0 ${viewBoxWidth} ${height}`} className="simple-bar-chart" preserveAspectRatio="xMidYMid meet">
        {data.map((d, i) => {
          const barH = (d / max) * (height - 30);
          const x = i * slot + (slot - barW) / 2;
          const y = height - barH - 20;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} fill="#2563eb" rx="4" />
              <text x={x + barW / 2} y={height - 6} fontSize="12" textAnchor="middle" fill="#334155">
                {labels[i]}
              </text>
              <text x={x + barW / 2} y={y - 4} fontSize="12" textAnchor="middle" fill="#0f172a">
                {d}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  function Sparkline({ values = [], stroke = '#2563eb', width = 100, height = 28 }) {
    const max = Math.max(...values, 1);
    const count = values.length || 1;
    const step = width / Math.max(count - 1, 1);
    const points = values.map((v, i) => `${i * step},${height - (v / max) * (height - 6)}`).join(' ');
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="sparkline">
        <polyline fill="none" stroke={stroke} strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  const markerData = markerKeys.map((k) => markerTypes[k] || 0);

  // Build dashboard-style cards
  const dashboardCards = [
    ...primaryCards,
    ...aiCards,
  ].slice(0, 6).map((c, i) => ({ ...c, color: ['orange', 'purple', 'red', 'yellow', 'teal', 'indigo'][i % 6], spark: [1, 3, 2, 4, 3] }));

  return (
    <section className="report-grid dashboard">
      <div className="report-grid-header">
        <div className="report-grid-title">
          <h3>STMS Reports Grid Dashboard</h3>
          <p>Review destination, crowd, and danger summaries.</p>
        </div>
      </div>

      <div className="report-main-grid">
        <div className="report-cards">
          <h4 className="section-heading">REPORT BREAKDOWN</h4>
          <div className="cards-grid">
            {dashboardCards.map((card) => (
              <div key={card.id} className={`info-card ${card.color}`}>
                <div className="card-top">
                  <div className="card-value">{card.value}</div>
                  <div className="card-spark"><Sparkline values={card.spark} stroke="#7c3aed" /></div>
                </div>
                <div className="card-label">{card.label}</div>
                <div className="card-sub">{card.subtitle}</div>
              </div>
            ))}
          </div>
        </div>

        <aside className="report-summary">
          <h4 className="section-heading">Summary & Trends</h4>
          <div className="summary-body">
            <div className="summary-row"><div className="summary-key">TOTAL REPORTS</div><div className="summary-val">{report.total_reports || 0}</div></div>
            <div className="summary-row"><div className="summary-key">TOTAL HIGH-RISK REPORTS</div><div className="summary-val">{report.high_risk_total || 0}</div></div>
            <div className="summary-row"><div className="summary-key">AVG. RESOLUTION TIME</div><div className="summary-val">{report.avg_resolution_minutes ? `${report.avg_resolution_minutes} minutes` : '—'}</div></div>
          </div>
        </aside>
      </div>

      <div className="recent-reports">
        <h4 className="section-heading">Recent High-Danger Reports</h4>
        <div className="reports-table">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Coordinates</th>
                <th>View</th>
              </tr>
            </thead>
            <tbody>
              {(report.recent_reports || []).slice(0, 6).map((r, idx) => (
                <tr key={idx}>
                  <td>{r.timestamp || '—'}</td>
                  <td>{r.type || '—'}</td>
                  <td>{r.severity || '—'}</td>
                  <td>{r.coords || '—'}</td>
                  <td><button className="link-btn">View Details</button></td>
                </tr>
              ))}
              {(!(report.recent_reports || []).length) && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '18px' }}>No recent reports</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
