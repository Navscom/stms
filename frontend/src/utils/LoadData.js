import { getDestinations, getDangerPinMetadata, getReportSummary, getSafetyCheck, getAiAdvice, postAiGenerate } from './index';
import { filterActivePins } from './pinHelpers';

export async function loadDestinations(setDestinations, { fallbackDestinations } = {}) {
  try {
    const data = await getDestinations();
    setDestinations(data || []);
    return { data: data || [], failed: false };
  } catch (error) {
    console.error('Failed to load destinations:', error);
    if (fallbackDestinations !== undefined) {
      setDestinations(fallbackDestinations);
    }
    return { data: fallbackDestinations, failed: true };
  }
}

export async function loadDangerPins(setDangerPins, { fallbackPins } = {}) {
  try {
    const data = await getDangerPinMetadata();
    setDangerPins(data || []);
    return { data: data || [], failed: false };
  } catch (error) {
    console.error('Failed to load danger pin metadata:', error);
    if (fallbackPins !== undefined) {
      setDangerPins(fallbackPins);
    }
    return { data: fallbackPins, failed: true };
  }
}

export async function loadReport(setReport, { fallbackReport } = {}) {
  try {
    const data = await getReportSummary();
    setReport(data || null);
    return { data: data || null, failed: false };
  } catch (error) {
    console.error('Failed to load report:', error);
    if (fallbackReport !== undefined) {
      setReport(fallbackReport);
    }
    return { data: fallbackReport, failed: true };
  }
}

export async function loadAppData(setDestinations, setDangerPins, setReport) {
  const [destinationsResult, dangerPinsResult, reportResult] = await Promise.all([
    loadDestinations(setDestinations, { fallbackDestinations: [] }),
    loadDangerPins(setDangerPins, { fallbackPins: [] }),
    loadReport(setReport, { fallbackReport: null }),
  ]);

  return destinationsResult.failed || dangerPinsResult.failed || reportResult.failed;
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
    setAdvice(adviceData.advice);
    setNearest(adviceData.nearest_destinations || []);
    setNearbyDangers(filterActivePins(adviceData.nearby_dangers || []));
  } catch (error) {
    setAdvice('There was an error loading the data from the backend. Please refresh the site to fix this.');
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
    // Be defensive: the backend AI endpoint may return different shapes
    // (e.g., { text: '...' } or { choices: [{ text: '...' }] } or nested data).
    let text = null;
    if (typeof result?.text === 'string') text = result.text.trim();
    // Common OpenAI-like shape
    if (!text && Array.isArray(result?.choices) && typeof result.choices[0]?.text === 'string') text = result.choices[0].text.trim();
    // Some APIs return data array
    if (!text && Array.isArray(result?.data) && typeof result.data[0]?.text === 'string') text = result.data[0].text.trim();
    // If the API returned a plain string (rare), coerce it
    if (!text && typeof result === 'string') text = result.trim();

    if (text) {
      setAdvice(text);
      return;
    }

    // Unknown response shape — log for debugging
    console.error('Unexpected AI generate response shape:', result);
    setAdvice(destination.description || `Description for ${destination.name} is not available.`);
  } catch (error) {
    console.error('Failed to generate destination description:', error);
    setAdvice(destination.description || `Description for ${destination.name} is not available.`);
  }
}
