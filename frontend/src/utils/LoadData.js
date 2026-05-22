import { getDestinations, getDangerPins, getReportSummary, getSafetyCheck, getAiAdvice } from './index';
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
    const safety = await checkSafety(lat, lng, setNearbyDangers);
    setAdvice(`${adviceData.advice} ${safety.alerts?.join(' ') || ''}`);
    setNearest(adviceData.nearest_destinations || []);
    setNearbyDangers(filterActivePins(adviceData.nearby_dangers || []));
  } catch (error) {
    setAdvice('Backend error. Make sure FastAPI is running on http://127.0.0.1:8000');
  }
}
