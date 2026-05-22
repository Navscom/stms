import '../css/ReportGrid.css';

export default function ReportGrid({ report }) {
  return (
    <section className="report-grid">
      <div className="stat-card"><h3>{report.total_destinations}</h3><p>Total Destinations</p></div>
      <div className="stat-card"><h3>{report.crowd_summary.High || 0}</h3><p>High Crowd Areas</p></div>
      <div className="stat-card"><h3>{report.danger_summary?.High || 0}</h3><p>High Danger Reports</p></div>
    </section>
  );
}
