export const getDurationHours = (pin) => {
  if (!pin) return 0;
  const hours = Number(pin.duration_hours ?? NaN);
  if (!Number.isNaN(hours) && hours > 0) return hours;
  const minutes = Number(pin.duration_minutes ?? pin.duration ?? pin.minutes ?? 0);
  const parsedMinutes = Number(minutes);
  return !Number.isNaN(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes / 60 : 0;
};

export const isPinExpired = (pin) => {
  const durationHours = getDurationHours(pin);
  if (!durationHours || !pin?.created_at) return false;
  const created = new Date(pin.created_at);
  if (Number.isNaN(created.getTime())) return false;
  const expireTime = created.getTime() + durationHours * 60 * 60 * 1000;
  return Date.now() > expireTime;
};

export const isPinInactive = (pin) => Boolean(pin?.removed_at) || isPinExpired(pin);

export const filterActivePins = (pins) => (pins || []).filter((pin) => !isPinInactive(pin));

export const formatDuration = (pin) => {
  const totalHours = getDurationHours(pin);
  if (!totalHours) return null;
  const days = Math.floor(totalHours / 24);
  const hours = Math.floor(totalHours % 24);

  if (days) {
    return `${days} day${days !== 1 ? 's' : ''}${hours ? ` ${hours} hour${hours !== 1 ? 's' : ''}` : ''}`;
  }

  if (totalHours >= 1) {
    return `${Math.round(totalHours)} hour${Math.round(totalHours) !== 1 ? 's' : ''}`;
  }

  return `${Math.round(totalHours * 60)} minute${Math.round(totalHours * 60) !== 1 ? 's' : ''}`;
};
