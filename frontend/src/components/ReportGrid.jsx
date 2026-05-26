import '../css/ReportGrid.css';

export default function ReportGrid({ report, reportHighlight = null, onReportHover = () => {}, onReportHoverEnd = () => {}, onReportSelect = () => {} }) {
  const cards = [
    {
      id: 'all-destinations',
      label: 'Total Destinations',
      value: report.total_destinations,
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
  ];

  return (
    <section className="report-grid">
      <div className="report-grid-header">
        <div className="report-grid-title">
          <h3>Report Grid</h3>
          <p>Quickly review the latest destination, crowd, and danger status.</p>
        </div>

        <div className="report-grid-boxes">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              className={`report-stat-card ${reportHighlight === card.id ? 'active' : ''}`}
              onMouseEnter={() => onReportHover(card.id)}
              onMouseLeave={onReportHoverEnd}
              onClick={() => onReportSelect(card.id)}
            >
              <div className="report-stat-value">{card.value}</div>
              <div className="report-stat-label">{card.label}</div>
              <div className="report-stat-subtitle">{card.subtitle}</div>
            </button>
          ))}
        </div>
      </div>

      <p className="report-grid-note">
        Hover or click a box to highlight its matching map markers.
      </p>
    </section>
  );
}
