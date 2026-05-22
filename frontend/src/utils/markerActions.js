import { postDangerPin, postPinComment, deleteDangerPin } from './index';
import { validateMarkerSubmission } from './validation';
import { DEFAULT_MARKER_FORM } from '../constants/markerConstants';

export async function submitMarker({
  user,
  captchaChecked,
  pendingMarkerLocation,
  markerForm,
  selectedMarkerType,
  setLoginPromptMessage,
  setIsModalOpen,
  setCaptchaWarning,
  setMarkerWarning,
  setPendingMarkerLocation,
  setMarkerForm,
  setShowNotification,
  setAdvice,
  loadDangerPins,
  loadReport,
}) {
  setCaptchaWarning('');
  setMarkerWarning('');

  const validation = validateMarkerSubmission({ user, captchaChecked, pendingMarkerLocation, markerForm });
  if (!validation.valid) {
    if (validation.reason === 'login') {
      setLoginPromptMessage(validation.message);
      setIsModalOpen(true);
    } else if (validation.reason === 'captcha') {
      setCaptchaWarning(validation.message);
    } else {
      setMarkerWarning(validation.message);
    }
    return false;
  }

  const totalHours = validation.totalHours;
  await postDangerPin({
    title: markerForm.title || selectedMarkerType,
    danger_type: selectedMarkerType,
    lat: pendingMarkerLocation.lat,
    lng: pendingMarkerLocation.lng,
    severity: markerForm.severity,
    radius_meters: Number(markerForm.radius_meters || 300),
    duration_hours: totalHours,
    description: markerForm.description,
    reported_by: user?.name || 'Anonymous Tourist',
  });

  await loadDangerPins();
  await loadReport();
  setPendingMarkerLocation(null);
  setMarkerForm(DEFAULT_MARKER_FORM);
  setShowNotification(true);
  setAdvice(`${selectedMarkerType} marker added successfully. Other users can now see and comment on it.`);

  return true;
}

export async function addMarkerComment(pinId, comment, user, setAdvice, loadDangerPins) {
  if (!comment?.trim()) {
    throw new Error('Please type a comment first.');
  }

  await postPinComment(pinId, {
    comment,
    commented_by: user?.name || 'Anonymous Tourist',
  });

  await loadDangerPins();
  setAdvice('Comment added to marker.');
}

export async function deletePin(pinId, setAdvice, loadDangerPins) {
  await deleteDangerPin(pinId);
  await loadDangerPins();
  setAdvice('Your marker was deleted successfully.');
}
