import { getDestinations, getDangerPins, getReportSummary, getSafetyCheck, getAiAdvice, postAiGenerate } from './index';
import { filterActivePins } from './pinHelpers';

export async function loadDestinations(setDestinations, { fallbackDestinations } = {}) {
  try {
    const data = await getDestinations();
    setDestinations(data || []);
    return data || [];
  } catch (error) {
    console.error('Failed to load destinations:', error);
    if (fallbackDestinations !== undefined) {
      setDestinations(fallbackDestinations);
    }
    return fallbackDestinations;
  }
}

export async function loadDangerPins(setDangerPins, { fallbackPins } = {}) {
  try {
    const data = await getDangerPins();
    setDangerPins(data || []);
    return data || [];
  } catch (error) {
    console.error('Failed to load danger pins:', error);
    if (fallbackPins !== undefined) {
      setDangerPins(fallbackPins);
    }
    return fallbackPins;
  }
}

export async function loadReport(setReport, { fallbackReport } = {}) {
  try {
    const data = await getReportSummary();
    setReport(data || null);
    return data || null;
  } catch (error) {
    console.error('Failed to load report:', error);
    if (fallbackReport !== undefined) {
      setReport(fallbackReport);
    }
    return fallbackReport;
  }
}

export async function loadAppData(setDestinations, setDangerPins, setReport) {
  await Promise.allSettled([
    loadDestinations(setDestinations, { fallbackDestinations: [] }),
    loadDangerPins(setDangerPins, { fallbackPins: [] }),
    loadReport(setReport, { fallbackReport: null }),
  ]);
}

export async function checkSafety(lat, lng, setNearbyDangers) {
  const data = await getSafetyCheck(lat, lng);
  setNearbyDangers(filterActivePins(data.nearby_dangers || []));
  return data;
}

export async function fetchAdvice(lat, lng, setSelectedLocation, setAdvice, setNearest, setNearbyDangers) {
  setSelectedLocation({ lat, lng });
  setAdvice('Analyzing location, nearby spots, crowd condition, and safety warnings...');

  try {
    const adviceData = await getAiAdvice(lat, lng);
    await checkSafety(lat, lng, setNearbyDangers);
    setAdvice(adviceData.advice);
    setNearest(adviceData.nearest_destinations || []);
    setNearbyDangers(filterActivePins(adviceData.nearby_dangers || []));
  } catch (error) {
    setAdvice('Backend error. Make sure FastAPI is running on http://127.0.0.1:8000');
  }
}

export async function fetchNearbyInfo(lat, lng, setSelectedLocation, setNearest, setNearbyDangers) {
  setSelectedLocation({ lat, lng });
  try {
    const adviceData = await getAiAdvice(lat, lng);
    setNearest(adviceData.nearest_destinations || []);
    setNearbyDangers(filterActivePins(adviceData.nearby_dangers || []));
    return adviceData;
  } catch (error) {
    console.error('Failed to load nearby info:', error);
    setNearest([]);
    setNearbyDangers([]);
    return { nearest_destinations: [], nearby_dangers: [] };
  }
}

export async function fetchDestinationDescription(destination, setAdvice) {
  if (!destination) {
    setAdvice('Unable to load destination details.');
    return;
  }

  const descriptionPrompt = [
    `Write a short, friendly travel description for the attraction named "${destination.name}" located in ${destination.city || 'an unknown city'}, ${destination.province || 'an unknown province'}.`,
    destination.category ? `It is a ${destination.category} attraction.` : '',
    destination.opening_hours ? `Opening hours are ${destination.opening_hours}.` : '',
    `Keep the tone warm and helpful, mention what visitors can expect, and do not mention that you are an AI.`
  ].filter(Boolean).join(' ');

  setAdvice(`Looking up ${destination.name} details...`);

  try {
    const result = await postAiGenerate({ prompt: descriptionPrompt });
    const text = result?.text?.trim();
    if (text) {
      setAdvice(text);
      return;
    }
    setAdvice(destination.description || `Description for ${destination.name} is not available.`);
  } catch (error) {
    console.error('Failed to generate destination description:', error);
    setAdvice(destination.description || `Description for ${destination.name} is not available.`);
  }
}
