/**
 * Dashboard cockpit controller.
 *
 * Owns the Prediction Control Desk: reading the real user inputs,
 * deriving day type from the date (backend rejects mismatches with 400),
 * geocoding the location, running the real LightGBM V2 prediction and
 * rendering every value on the Stitch inference card from the actual
 * API response.
 */

import {
  buildPayload,
  predictTraffic,
  fetchTrafficMap,
  LocationNotSupportedError
} from './client.js';
import { geocodeLocation, shortPlaceName, parseCoordinatePair } from './geo.js';
import {
  classifyVolume,
  bandState,
  isRushHour,
  corridorLabel,
  SEGMENT_BASE_CLASS
} from './severity.js';
import {
  propagateLocation,
  propagateSensor,
  propagateCorridor,
  setCorridorStatus,
  getMap
} from './map.js';

// User-facing prediction window. The backend maps each year onto the
// matching real traffic history (2026→2017 … 2030→2021) — see
// src/history_time.py. All model features still come from real data.
export const DATE_MIN = '2026-01-01';
export const DATE_MAX = '2030-12-31';

const state = {
  isPredicting: false,
  pinnedCoords: null,     // {lat,lng,label} set by GPS or map pick
  lastScenario: null
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const $ = (id) => document.getElementById(id);

function readNumber(id) {
  const parsed = parseFloat($(id)?.value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/* ------------------------------------------------------------------ */
/* Day type — always derived from the date                             */
/* ------------------------------------------------------------------ */

export function deriveDayType(dateStr) {
  const dateObj = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(dateObj.getTime())) return null;
  return dateObj.getDay() === 0 || dateObj.getDay() === 6
    ? 'Weekend'
    : 'Weekday';
}

const BTN_ACTIVE =
  'py-1.5 rounded font-label-md text-label-md font-semibold bg-surface-container-highest text-primary-container shadow-[0_0_14px_rgba(0,240,255,0.2)] flex items-center justify-center gap-1.5 transition-all';
const BTN_INACTIVE =
  'py-1.5 rounded font-label-md text-label-md text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5 transition-all';

export function syncDayTypeControls() {
  const date = $('input-date')?.value || '';
  const dayType = deriveDayType(date);
  const weekdayBtn = $('btn-weekday');
  const weekendBtn = $('btn-weekend');

  if (!dayType || !weekdayBtn || !weekendBtn) return;

  weekdayBtn.className = dayType === 'Weekday' ? BTN_ACTIVE : BTN_INACTIVE;
  weekendBtn.className = dayType === 'Weekend' ? BTN_ACTIVE : BTN_INACTIVE;
}

function onDayTypeButtonClick(event) {
  const date = $('input-date')?.value || '';
  const actual = deriveDayType(date);
  const clicked = event.currentTarget.id === 'btn-weekday' ? 'Weekday' : 'Weekend';

  if (actual && clicked !== actual) {
    setStatus(`${date} is a ${actual} — day type follows the selected date.`, 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Time badge (RUSH) — same rule as the backend's is_rush_hour         */
/* ------------------------------------------------------------------ */

export function syncTimeBadge() {
  const time = $('input-time')?.value || '';
  const hour = parseInt(time.split(':')[0], 10);
  const badge = $('time-badge');
  if (!badge) return;

  if (Number.isFinite(hour) && isRushHour(hour)) {
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/* ------------------------------------------------------------------ */
/* Location status line                                                */
/* ------------------------------------------------------------------ */

export function setStatus(message, kind = 'info') {
  const el = $('location-status');
  if (!el) return;

  if (!message) {
    el.classList.add('hidden');
    return;
  }

  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.remove('status-text-info', 'status-text-success', 'status-text-error');
  el.classList.add(
    'status-text-' + (kind === 'error' || kind === 'success' ? kind : 'info')
  );
}

/* ------------------------------------------------------------------ */
/* Input reading + validation                                          */
/* ------------------------------------------------------------------ */

function readInputs() {
  return {
    location: ($('input-location')?.value || '').trim(),
    date: $('input-date')?.value || '',
    time: $('input-time')?.value || '',
    temperature: readNumber('slider-temp'),
    rain: readNumber('slider-rain'),
    snow: readNumber('slider-snow'),
    cloudiness: readNumber('slider-cloud')
  };
}

function validateInputs(inputs) {
  if (inputs.location.length < 2) {
    return 'Enter a target location (at least 2 characters).';
  }
  if (!inputs.date || inputs.date < DATE_MIN || inputs.date > DATE_MAX) {
    return `Prediction date must be between ${DATE_MIN} and ${DATE_MAX} — each year is mapped onto the matching real 2017–2021 traffic history.`;
  }
  if (!inputs.time) {
    return 'Choose a prediction time.';
  }
  if (!Number.isFinite(inputs.temperature) || inputs.temperature < -90 || inputs.temperature > 60) {
    return 'Temperature must be between -90 °C and 60 °C.';
  }
  if (!Number.isFinite(inputs.rain) || inputs.rain < 0 || inputs.rain > 100) {
    return 'Rain must be between 0 and 100 mm.';
  }
  if (!Number.isFinite(inputs.snow) || inputs.snow < 0 || inputs.snow > 100) {
    return 'Snow must be between 0 and 100 mm.';
  }
  if (!Number.isFinite(inputs.cloudiness) || inputs.cloudiness < 0 || inputs.cloudiness > 100) {
    return 'Cloudiness must be between 0 and 100 %.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Button staging                                                      */
/* ------------------------------------------------------------------ */

const BTN_LABEL_IDLE = 'PREDICT TRAFFIC FLOW';

function setButtonStage(label, loading) {
  const btn = $('btn-predict');
  const spinner = $('btn-spinner');
  const icon = $('btn-icon');
  const labelEl = $('btn-label');

  if (btn) btn.disabled = loading;
  if (spinner) spinner.classList.toggle('hidden', !loading);
  if (icon) icon.classList.toggle('hidden', loading);
  if (labelEl) labelEl.textContent = label;
}

/* ------------------------------------------------------------------ */
/* Result rendering — every value from the real response               */
/* ------------------------------------------------------------------ */

function hideOverlays() {
  $('overlay-empty')?.classList.add('hidden');
  $('overlay-error')?.classList.add('hidden');
}

function showError(message) {
  const overlay = $('overlay-error');
  if (overlay) {
    const title = $('overlay-error-title');
    if (title) title.textContent = 'Prediction Request Failed';
    $('error-msg').textContent = message;
    $('overlay-error').classList.remove('hidden');
    $('overlay-empty')?.classList.add('hidden');
  }
  setStatus(message, 'error');
}

/**
 * Dedicated handling for the backend geographic gate (HTTP 400 with a
 * structured detail payload — see MAX_SENSOR_DISTANCE_KM in
 * src/sensor_lookup.py). Unsupported locations get a clear explanation
 * instead of the generic failure overlay.
 */
function showLocationNotSupported(error) {
  const overlay = $('overlay-error');
  if (overlay) {
    const title = $('overlay-error-title');
    if (title) title.textContent = 'Location not supported';

    let message =
      "This location is outside IntelliTraffic's supported California PeMS " +
      'traffic network. Please choose a location within the supported area.';

    if (Number.isFinite(error.nearestSensorDistanceKm)) {
      const distance = error.nearestSensorDistanceKm.toLocaleString('en-US', {
        maximumFractionDigits: 1
      });
      const sensor = error.nearestSensorId ? ` #${error.nearestSensorId}` : '';
      message += ` Nearest supported sensor${sensor} is ${distance} km away.`;
    }

    $('error-msg').textContent = message;
    $('overlay-error').classList.remove('hidden');
    $('overlay-empty')?.classList.add('hidden');
  }
  setStatus(
    'Location not supported — choose a location within 50 km of a PeMS sensor.',
    'error'
  );
}

function applyResult(response, latencyMs, locationShort) {
  const sensor = response.sensor;
  const volume = Math.round(Number(response.prediction));
  const bandKey = classifyVolume(volume);
  const band = bandState(bandKey);

  hideOverlays();

  // Ambient glow + pulse dot + status pill
  const glow = $('ambient-glow');
  if (glow) {
    glow.className =
      `absolute -top-32 -right-32 w-80 h-80 ${band.glowClass} rounded-full blur-[100px] pointer-events-none transition-all duration-500`;
  }

  const dot = $('status-pulse-dot');
  if (dot) {
    dot.className = `w-3 h-3 rounded-full animate-ping ${band.dotClass}`;
  }

  const pill = $('status-pill');
  if (pill) {
    pill.className =
      'px-space-md py-1.5 rounded-full flex items-center gap-2 ' + band.pillClass;
    pill.innerHTML =
      `<span class="material-symbols-outlined text-[16px]">${band.pillIcon}</span>` +
      `<span class="font-label-md text-label-md font-bold tracking-widest uppercase">${band.pillText}</span>`;
  }

  // Core metric
  const metric = $('metric-number');
  if (metric) metric.textContent = volume.toLocaleString('en-US');

  // Nearest sensor chip (replaces the fake baseline-delta card)
  const chip = $('sensor-chip-value');
  if (chip && sensor) {
    chip.textContent =
      `#${sensor.sensor_id} · ${Number(sensor.distance_km).toFixed(2)} km · ${corridorLabel(sensor)}`;
  }

  // Specification matrix
  const inputs = readInputs();
  const dateObj = new Date(`${inputs.date}T12:00:00`);
  const dayName = WEEKDAY_NAMES[dateObj.getDay()] || '';

  const specTime = $('spec-time');
  if (specTime) specTime.textContent = `${inputs.date} ${inputs.time} · ${dayName}`;
  const specHistory = $('spec-history');
  if (specHistory) {
    specHistory.textContent = response.historical_reference_time
      ? `${response.historical_reference_time} (real)`
      : '—';
  }
  const specArterial = $('spec-arterial');
  if (specArterial) specArterial.textContent = locationShort;
  const specSensor = $('spec-sensor');
  if (specSensor && sensor) {
    specSensor.textContent = `#${sensor.sensor_id} (${corridorLabel(sensor)})`;
  }
  const specOffset = $('spec-offset');
  if (specOffset && sensor) {
    specOffset.textContent = `${Number(sensor.distance_km).toFixed(2)} km`;
  }

  // Spectrum segments
  ['low', 'moderate', 'heavy', 'severe'].forEach((key) => {
    const segment = $(`spectrum-${key}`);
    if (!segment) return;
    segment.className = key === bandKey
      ? `h-full w-1/4 rounded-full transition-colors duration-300 ${band.segmentClass}`
      : SEGMENT_BASE_CLASS;
  });

  // ML context panel — only verifiable values
  const inputs2 = readInputs();
  const hour = parseInt(inputs2.time.split(':')[0], 10);
  const mfHour = $('mf-hour');
  if (mfHour) mfHour.textContent = `${String(hour).padStart(2, '0')}:00 HRS`;
  const mfDay = $('mf-day');
  if (mfDay) mfDay.textContent = dayName;
  const mfRush = $('mf-rush');
  if (mfRush) {
    const rush = isRushHour(hour);
    mfRush.textContent = rush ? 'True [1.0]' : 'False [0.0]';
    mfRush.style.color = rush ? '#ffb4ab' : '#dee2f6';
  }
  if (sensor) {
    const mfDistance = $('mf-distance');
    if (mfDistance) {
      mfDistance.textContent = `${Number(sensor.distance_km).toFixed(2)} km`;
    }
    const mfLanes = $('mf-lanes');
    if (mfLanes) mfLanes.textContent = `${sensor.lanes} lanes`;
  }
  const mfLatency = $('mf-latency');
  if (mfLatency) mfLatency.textContent = `${latencyMs} ms`;

  // Maps: target + real nearest sensor
  const targetLat = state.pinnedCoords
    ? state.pinnedCoords.lat
    : response.sent_payload.latitude;
  const targetLng = state.pinnedCoords
    ? state.pinnedCoords.lng
    : response.sent_payload.longitude;

  propagateLocation(targetLat, targetLng, locationShort);
  propagateSensor(sensor, volume, bandKey, locationShort);

  // Ribbon
  const sector = $('sector-label');
  if (sector) sector.textContent = `TARGET // ${locationShort.toUpperCase()}`;

  // Notify the analytics view + footer latency
  state.lastScenario = {
    locationName: inputs.location,
    shortName: locationShort,
    latitude: response.sent_payload.latitude,
    longitude: response.sent_payload.longitude,
    date: inputs.date,
    time: inputs.time,
    dayType: response.day_type,
    temperature: inputs.temperature,
    rain: inputs.rain,
    snow: inputs.snow,
    cloudiness: inputs.cloudiness,
    volume,
    bandKey,
    sensor
  };

  window.dispatchEvent(new CustomEvent('it:prediction', {
    detail: { scenario: state.lastScenario, response, latencyMs }
  }));

  setStatus(
    `LightGBM V2 → ${volume.toLocaleString('en-US')} veh/h · sensor #${sensor.sensor_id} ` +
    `(${Number(sensor.distance_km).toFixed(2)} km · ${corridorLabel(sensor)}). ` +
    `Real history basis: ${response.historical_reference_time}.`,
    'success'
  );

  // Multi-sensor corridor for the Traffic Map — real /traffic-map run with
  // the exact same inputs (same model, same year mapping). Never fabricated.
  refreshCorridor({
    latitude: response.sent_payload.latitude,
    longitude: response.sent_payload.longitude,
    date: inputs.date,
    time: inputs.time,
    day_type: response.day_type,
    temperature: inputs.temperature,
    rain: inputs.rain,
    snow: inputs.snow,
    cloudiness: inputs.cloudiness
  }, locationShort);
}

/* ------------------------------------------------------------------ */
/* Main prediction flow                                                */
/* ------------------------------------------------------------------ */

export async function runPrediction() {
  if (state.isPredicting) return;

  const inputs = readInputs();

  const validationError = validateInputs(inputs);
  if (validationError) {
    showError(`Input error — ${validationError}`);
    return;
  }

  const dayType = deriveDayType(inputs.date);
  if (!dayType) {
    showError('Input error — Invalid prediction date.');
    return;
  }

  state.isPredicting = true;
  hideOverlays();

  const startedAt = performance.now();

  try {
    // 1. Resolve the target coordinates (pinned > coordinate pair > geocode)
    let latitude;
    let longitude;
    let displayName;

    if (state.pinnedCoords) {
      latitude = state.pinnedCoords.lat;
      longitude = state.pinnedCoords.lng;
      displayName = state.pinnedCoords.label;
      setButtonStage('RUNNING LIGHTGBM V2...', true);
    } else {
      const coords = parseCoordinatePair(inputs.location);

      if (coords) {
        latitude = coords.lat;
        longitude = coords.lng;
        displayName = `Coordinate pin (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        setButtonStage('RUNNING LIGHTGBM V2...', true);
      } else {
        setButtonStage('LOCATING TARGET...', true);
        setStatus(`Locating "${inputs.location}"...`, 'info');

        const geo = await geocodeLocation(inputs.location);

        if (!geo) {
          throw new Error(`Could not find "${inputs.location}". Try a more specific location.`);
        }
        if (!Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) {
          throw new Error('Geocoding returned invalid coordinates.');
        }

        latitude = geo.latitude;
        longitude = geo.longitude;
        displayName = geo.displayName;
        setButtonStage('RUNNING LIGHTGBM V2...', true);
      }
    }

    const locationShort = shortPlaceName(displayName);

    // 2. Real LightGBM V2 inference via the backend
    const response = await predictTraffic({
      latitude,
      longitude,
      date: inputs.date,
      time: inputs.time,
      day_type: dayType,
      temperature: inputs.temperature,
      rain: inputs.rain,
      snow: inputs.snow,
      cloudiness: inputs.cloudiness
    });

    const latencyMs = Math.round(performance.now() - startedAt);

    applyResult(response, latencyMs, locationShort);
    return state.lastScenario;

  } catch (error) {
    console.error('Prediction failed:', error);

    if (error instanceof LocationNotSupportedError) {
      showLocationNotSupported(error);
      return null;
    }

    showError(
      `${error.message || 'Failed to reach the backend.'} — check your connection and try again.`
    );
    return null;

  } finally {
    state.isPredicting = false;
    setButtonStage(BTN_LABEL_IDLE, false);
  }
}

/* ------------------------------------------------------------------ */
/* Multi-sensor corridor (POST /traffic-map)                           */
/* ------------------------------------------------------------------ */

let corridorRun = 0;

/**
 * Fetch real predictions for the 8 nearest PeMS sensors and paint them on
 * both maps. Failures surface as an honest map status — no fallback data.
 */
async function refreshCorridor(params, locationShort) {
  const runId = ++corridorRun;

  setCorridorStatus('loading', 'ANALYZING NEARBY PEMS CORRIDORS…');

  try {
    const result = await fetchTrafficMap(params);
    if (runId !== corridorRun) return; // a newer prediction superseded this run

    const segments = result.segments || [];
    propagateCorridor(segments, {
      locationName: locationShort,
      predictionTime: result.prediction_time,
      historicalReferenceTime: result.historical_reference_time
    });

    const errors = (result.errors || []).length;
    setCorridorStatus(
      'success',
      `${segments.length} REAL SENSORS PREDICTED · ${result.historical_reference_time}` +
        (errors ? ` · ${errors} SKIPPED` : '')
    );
  } catch (error) {
    if (runId !== corridorRun) return;
    console.error('Corridor prediction failed:', error);

    if (error instanceof LocationNotSupportedError) {
      setCorridorStatus(
        'error',
        'LOCATION NOT SUPPORTED — outside the PeMS network'
      );
      return;
    }

    setCorridorStatus('error', `CORRIDOR FAILED — ${error.message || 'backend unreachable'}`);
  }
}

/* ------------------------------------------------------------------ */
/* GPS + map pinning                                                   */
/* ------------------------------------------------------------------ */

function setPinned(lat, lng, label) {
  state.pinnedCoords = { lat, lng, label };
  const input = $('input-location');
  if (input) {
    input.value = `Pinned: ${label} (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  }
  setStatus(`Target pinned at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Run a prediction to map it to the nearest PeMS sensor.`, 'info');
  propagateLocation(lat, lng, label);
}

function clearPinIfManualEdit() {
  const input = $('input-location');
  if (!input) return;
  if (state.pinnedCoords && !input.value.startsWith('Pinned:')) {
    state.pinnedCoords = null;
  }
}

function requestGps() {
  if (!navigator.geolocation) {
    setStatus('Geolocation is not supported by this browser.', 'error');
    return;
  }

  setStatus('Querying device GPS...', 'info');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      setPinned(latitude, longitude, 'GPS location');
      getMap('dash')?.flyTo(latitude, longitude, 13);
    },
    () => {
      setStatus('GPS permission denied — type a location or pin one on the map.', 'error');
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
}

let pickMode = false;

function togglePickMode() {
  pickMode = !pickMode;
  getMap('dash')?.setPickMode(pickMode);
  setStatus(
    pickMode
      ? 'Pick mode — click anywhere on the map below to drop the target pin.'
      : '',
    'info'
  );
}

function onDashboardPick(lat, lng) {
  if (pickMode) {
    setPinned(lat, lng, 'Map pin');
    pickMode = false;
    getMap('dash')?.setPickMode(false);
  }
}

/**
 * Bridge for main.js — map clicks (dashboard card or full map view) are
 * forwarded here; they only land while pick mode is armed via btn-map-pin.
 */
export function handleMapPick(lat, lng) {
  onDashboardPick(lat, lng);
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

export function initDashboard() {
  // Defaults inside the supported prediction window (2026–2030; the
  // backend maps each date onto the matching real 2017–2021 history)
  const dateInput = $('input-date');
  if (dateInput && !dateInput.value) dateInput.value = '2026-10-15';
  if (dateInput) {
    dateInput.min = DATE_MIN;
    dateInput.max = DATE_MAX;
  }

  const timeInput = $('input-time');
  if (timeInput && !timeInput.value) timeInput.value = '18:00';

  syncDayTypeControls();
  syncTimeBadge();

  // Sliders — live value labels
  [
    ['slider-temp', 'val-temp', (v) => `${v}°C`],
    ['slider-rain', 'val-rain', (v) => `${v} mm`],
    ['slider-snow', 'val-snow', (v) => `${v} mm`],
    ['slider-cloud', 'val-cloud', (v) => `${v}%`]
  ].forEach(([sliderId, labelId, fmt]) => {
    const slider = $(sliderId);
    const label = $(labelId);
    if (!slider || !label) return;
    label.textContent = fmt(slider.value);
    slider.addEventListener('input', () => {
      label.textContent = fmt(slider.value);
    });
  });

  $('input-date')?.addEventListener('change', () => {
    syncDayTypeControls();
    clearPinIfManualEdit();
  });
  $('input-time')?.addEventListener('change', syncTimeBadge);
  $('input-location')?.addEventListener('input', clearPinIfManualEdit);

  $('btn-weekday')?.addEventListener('click', onDayTypeButtonClick);
  $('btn-weekend')?.addEventListener('click', onDayTypeButtonClick);

  $('weather-header')?.addEventListener('click', () => {
    const content = $('weather-content');
    const chevron = $('weather-chevron');
    if (!content || !chevron) return;
    content.classList.toggle('hidden');
    chevron.style.transform = content.classList.contains('hidden')
      ? 'rotate(180deg)'
      : 'rotate(0deg)';
  });

  $('btn-predict')?.addEventListener('click', runPrediction);
  $('overlay-empty-run')?.addEventListener('click', runPrediction);
  $('overlay-retry')?.addEventListener('click', runPrediction);
  $('btn-gps')?.addEventListener('click', requestGps);
  $('btn-map-pin')?.addEventListener('click', togglePickMode);
}

export function getScenario() {
  return state.lastScenario;
}
