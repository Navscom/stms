export default function MapControls({
  isNavExpanded,
  setIsNavExpanded,
  pinMode,
  locationMode,
  showDestinations,
  togglePinMode,
  toggleLocationMode,
  toggleShowDestinations,
}) {
  return (
    <aside
      className={isNavExpanded ? 'side-nav side-nav-expanded' : 'side-nav'}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsNavExpanded((open) => !open);
        }
      }}
      style={{
        width: isNavExpanded ? '220px' : '72px',
        padding: isNavExpanded ? '16px' : '10px 8px',
      }}
    >
      <button
        className="nav-toggle"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsNavExpanded((open) => !open);
        }}
        aria-expanded={isNavExpanded}
        aria-label={isNavExpanded ? 'Collapse navigation' : 'Expand navigation'}
      >
        <span className="nav-icon">{isNavExpanded ? '«' : '☰'}</span>
        <span className="nav-label">Menu</span>
      </button>

      <button
        className={pinMode ? 'nav-action active' : 'nav-action'}
        onClick={togglePinMode}
        type="button"
        title="Add Marker"
        aria-label="Add Marker"
      >
        <span className="nav-icon">📌</span>
        <span className="nav-label">Add Marker</span>
      </button>
      <button
        className={locationMode ? 'nav-action active' : 'nav-action'}
        onClick={toggleLocationMode}
        type="button"
        title="My Location"
        aria-label="My Location"
      >
        <span className="nav-icon">📍</span>
        <span className="nav-label">My Location</span>
      </button>
      <button
        className={showDestinations ? 'nav-action active' : 'nav-action'}
        onClick={toggleShowDestinations}
        type="button"
        title="Destinations"
        aria-label="Destinations"
      >
        <span className="nav-icon">🧭</span>
        <span className="nav-label">Destinations</span>
      </button>
    </aside>
  );
}
