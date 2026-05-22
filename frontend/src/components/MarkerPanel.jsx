import { MARKER_TYPES } from '../utils/markerConstants';
import '../css/MarkerPanel.css';

export default function MarkerPanel({
  markerForm,
  setMarkerForm,
  selectedMarkerType,
  setSelectedMarkerType,
  pendingMarkerLocation,
  captchaChecked,
  setCaptchaChecked,
  captchaWarning,
  markerWarning,
  submitMarker,
}) {
  return (
    <div className="marker-panel">
      <h2>Add Safety Marker</h2>
      <p>Use the 'Add Marker' button in the left controls to create a new marker.</p>
    </div>
  );
}
