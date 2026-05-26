export function validateAuthForm(form, isRegister = false) {
  const email = form.email?.trim();
  if (!email) {
    return { valid: false, message: 'Email is required.' };
  }
  if (email.includes(' ')) {
    return { valid: false, message: 'Email cannot contain spaces.' };
  }
  const parts = email.split('@');
  if (parts.length !== 2) {
    return { valid: false, message: 'Enter a valid email address.' };
  }
  const [local, domain] = parts;
  if (!/^[A-Za-z0-9]+$/.test(local)) {
    return { valid: false, message: 'Email local part can only contain letters and numbers.' };
  }
  const allowedProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
  if (!allowedProviders.includes(domain.toLowerCase())) {
    return {
      valid: false,
      message: `Email provider must be one of: ${allowedProviders.join(', ')}.`,
    };
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

export function validateDestinationForm(form, existingDestinations = []) {
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

  // Duplicate check: consider existing destinations if provided.
  if (Array.isArray(existingDestinations) && existingDestinations.length > 0) {
    const nameLower = String(form.name || '').trim().toLowerCase();
    const cityLower = String(form.city || '').trim().toLowerCase();
    const provinceLower = String(form.province || '').trim().toLowerCase();
    const latNum = lat;
    const lngNum = lng;

    const duplicate = existingDestinations.some((d) => {
      // compare by name + city/province (case-insensitive)
      const dName = String(d.name || '').trim().toLowerCase();
      const dCity = String(d.city || '').trim().toLowerCase();
      const dProvince = String(d.province || '').trim().toLowerCase();
      if (dName && dCity && dName === nameLower && dCity === cityLower && dProvince === provinceLower) {
        return true;
      }
      // or compare exact lat/lng matches
      const dLat = Number(d.lat);
      const dLng = Number(d.lng);
      if (!Number.isNaN(dLat) && !Number.isNaN(dLng) && dLat === latNum && dLng === lngNum) {
        return true;
      }
      return false;
    });

    if (duplicate) {
      return { valid: false, message: 'A destination with the same name/city or coordinates already exists.' };
    }
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
