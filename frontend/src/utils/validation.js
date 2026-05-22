export function validateAuthForm(form, isRegister = false) {
  if (!form.email?.trim()) {
    return { valid: false, message: 'Email is required.' };
  }
  if (!form.password) {
    return { valid: false, message: 'Password is required.' };
  }
  if (isRegister) {
    if (!form.name?.trim()) {
      return { valid: false, message: 'Full name is required.' };
    }
    if (form.password !== form.confirmPassword) {
      return { valid: false, message: 'Passwords do not match.' };
    }
  }
  return { valid: true };
}

export function validateDestinationForm(form) {
  const requiredFields = ['name', 'category', 'city', 'province', 'lat', 'lng', 'description'];
  for (const field of requiredFields) {
    if (!String(form[field] ?? '').trim()) {
      return { valid: false, message: `${field.charAt(0).toUpperCase() + field.slice(1)} is required.` };
    }
  }

  const lat = Number(form.lat);
  const lng = Number(form.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { valid: false, message: 'Latitude and longitude must be valid numbers.' };
  }

  return {
    valid: true,
    payload: {
      ...form,
      lat,
      lng,
    },
  };
}

export function validateMarkerSubmission({ user, captchaChecked, pendingMarkerLocation, markerForm }) {
  if (!user) {
    return {
      valid: false,
      reason: 'login',
      message: 'You need to login first before adding a new marker.',
    };
  }
  if (!pendingMarkerLocation) {
    return {
      valid: false,
      reason: 'marker',
      message: 'Click the map location first.',
    };
  }
  if (!markerForm.description?.trim()) {
    return {
      valid: false,
      reason: 'marker',
      message: 'Description is required. Explain why you put this marker.',
    };
  }

  const days = Number(markerForm.duration_days || 0);
  const hours = Number(markerForm.duration_hours || 0);
  const totalHours = days * 24 + hours;
  if (totalHours < 1) {
    return {
      valid: false,
      reason: 'marker',
      message: 'Please specify at least 1 hour of duration.',
    };
  }
  if (!captchaChecked) {
    return {
      valid: false,
      reason: 'captcha',
      message: 'Check the CAPTCHA box before submitting your marker.',
    };
  }

  return { valid: true, totalHours };
}
