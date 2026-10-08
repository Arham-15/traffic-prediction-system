import { predictTraffic, checkApiHealth, fetchTrafficMap, API_BASE_URL, buildPayload } from './api/client.js';
import { initThreeAssistant } from './components/ThreeAssistant.js';
import { initAnalyticsCharts, updateAnalyticsCharts, setWeatherSensitivity } from './components/charts.js';

// Theme Definitions adhering strictly to Stitch color rules
export const THEMES = {
  neutral: {
    accent: '#00f2fe',
    glow: 'rgba(0, 242, 254, 0.25)',
    badgeText: 'Awaiting',
    badgeBg: 'rgba(0, 242, 254, 0.2)',
    badgeColor: '#00f2fe'
  },
  low: {
    accent: '#10b981', // Emerald Green
    glow: 'rgba(16, 185, 129, 0.25)',
    badgeText: 'Low',
    badgeBg: 'rgba(16, 185, 129, 0.2)',
    badgeColor: '#10b981'
  },
  moderate: {
    accent: '#f59e0b', // Amber / Gold
    glow: 'rgba(245, 158, 11, 0.25)',
    badgeText: 'Moderate',
    badgeBg: 'rgba(245, 158, 11, 0.2)',
    badgeColor: '#f59e0b'
  },
  high: {
    accent: '#ef4444', // Vivid Red / Crimson (MANDATED)
    glow: 'rgba(239, 68, 68, 0.3)',
    badgeText: 'High',
    badgeBg: 'rgba(239, 68, 68, 0.2)',
    badgeColor: '#ef4444'
  },
  severe: {
    accent: '#3b82f6', // Vivid Blue (MANDATED for SEVERE)
    glow: 'rgba(59, 130, 246, 0.35)',
    badgeText: 'Severe',
    badgeBg: 'rgba(59, 130, 246, 0.2)',
    badgeColor: '#3b82f6'
  }
};

/* Calibrated severity bands shared by the whole application
   (mirrors src/severity.py — the backend remains authoritative):
   LOW < 200 | MODERATE 200-399.99 | HIGH 400-599.99 | SEVERE >= 600 */
export const SEVERITY_COLORS = {
  low: '#10b981',
  moderate: '#f59e0b',
  high: '#ef4444',
  severe: '#3b82f6'
};

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));

const readNumber = (elementId, fallback) => {
  const raw = document.getElementById(elementId)?.value;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function setLocationStatus(message, kind = 'info') {
  const el = document.getElementById('location-status');
  if (!el) return;

  if (!message) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }

  el.textContent = message;
  el.classList.remove('hidden');
  el.style.color =
    kind === 'error' ? '#ffb4ab' : kind === 'success' ? '#4edea3' : '#b9cacb';
}

/* ------------------------------------------------------------------ */
/* Leaflet map state                                                   */
/* ------------------------------------------------------------------ */

const MAP_LAYERS = {
  // Dark theme is rendered by CSS-filtering standard OSM tiles (no API key needed)
  dark: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
    className: 'map-tiles-dark'
  },
  streets: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19
  }
};

let trafficMap = null;
let activeTileLayer = null;
let trafficMarker = null;
let currentLayerKey = 'dark';

export function applyTheme(themeKey) {
  const theme = THEMES[themeKey] || THEMES.neutral;
  const root = document.documentElement;
  root.style.setProperty('--accent-current', theme.accent);
  root.style.setProperty('--accent-glow', theme.glow);

  // Update Result Card Elements
  const bar = document.getElementById('result-accent-bar');
  const badge = document.getElementById('result-badge');
  const densityBar = document.getElementById('result-density-bar');

  if (bar) bar.style.backgroundColor = theme.accent;
  if (badge) {
    badge.textContent = theme.badgeText;
    badge.style.backgroundColor = theme.badgeBg;
    badge.style.color = theme.badgeColor;
  }
  if (densityBar) densityBar.style.backgroundColor = theme.accent;
}

export function determineSeverity(vehicles) {
  if (vehicles < 200) return 'low';
  if (vehicles < 400) return 'moderate';
  if (vehicles < 600) return 'high';
  return 'severe';
}

export function setPreset(loc, date, time, temp, rain = 0, snow = 0, clouds = 0) {
  const locEl = document.getElementById('input-location');
  const dateEl = document.getElementById('input-date');
  const timeEl = document.getElementById('input-time');
  const dayTypeEl = document.getElementById('input-day-type');
  const tempEl = document.getElementById('input-temp');
  const rainEl = document.getElementById('input-rain');
  const snowEl = document.getElementById('input-snow');
  const cloudsEl = document.getElementById('input-clouds');

  if (locEl) locEl.value = loc;
  if (dateEl) dateEl.value = date;
  if (timeEl) timeEl.value = time;
  if (tempEl) tempEl.value = temp;
  if (rainEl) rainEl.value = rain;
  if (snowEl) snowEl.value = snow;
  if (cloudsEl) cloudsEl.value = clouds;

  if (dayTypeEl && date) {
    const dateObj = new Date(`${date}T12:00:00`);

    if (!Number.isNaN(dateObj.getTime())) {
      dayTypeEl.value =
        dateObj.getDay() === 0 ||
        dateObj.getDay() === 6
          ? 'Weekend'
          : 'Weekday';
    }
  }

  updatePayloadSync();
  triggerPredictionExecution();
}
export function updatePayloadSync() {
  const raw = {
    location: document.getElementById('input-location')?.value || '',
    latitude: null,
    longitude: null,
    date: document.getElementById('input-date')?.value || '2026-10-15',
    time: document.getElementById('input-time')?.value || '18:00',
    day_type: document.getElementById('input-day-type')?.value || 'Weekday',
    temperature: readNumber('input-temp', 20),
    rain: readNumber('input-rain', 0),
    snow: readNumber('input-snow', 0),
    cloudiness: readNumber('input-clouds', 0)
  };

  const preview = document.getElementById('json-preview');

  if (preview) {
    preview.textContent = JSON.stringify(
      buildPayload(raw),
      null,
      2
    );
  }
}
export function togglePayloadDrawer() {
  const drawer = document.getElementById('payload-drawer');
  if (drawer) {
    drawer.classList.toggle('hidden');
    updatePayloadSync();
  }
}

let isPredicting = false;

const geocodeCache = new Map();
let lastGeocodeRequestAt = 0;

// Nominatim usage policy: max ~1 request per second
async function respectGeocodingThrottle() {
  const wait = lastGeocodeRequestAt + 1100 - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastGeocodeRequestAt = Date.now();
}

/**
 * Resolve a free-text place name to real coordinates via OpenStreetMap Nominatim.
 * Returns null when no match exists; throws a friendly Error on network/HTTP failures.
 */
export async function geocodeLocation(locationName) {
  const query = (locationName || '').trim();
  if (query.length < 2) return null;

  const cacheKey = query.toLowerCase();
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  await respectGeocodingThrottle();

  let response;
  try {
    response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } }
    );
  } catch (_) {
    throw new Error('geocoding service unreachable â€” check your internet connection');
  }

  if (!response.ok) {
    throw new Error(`geocoding request rejected (HTTP ${response.status})`);
  }

  const results = await response.json();
  const match = results.length
    ? {
        latitude: Number(results[0].lat),
        longitude: Number(results[0].lon),
        displayName: String(results[0].display_name || query)
      }
    : null;

  geocodeCache.set(cacheKey, match);
  return match;
}

export async function triggerPredictionExecution() {
  if (isPredicting) return null;

  const btn = document.getElementById('btn-submit');
  const btnText = document.getElementById('btn-text');
  const btnIcon = document.getElementById('btn-icon');
  const barWrap = document.getElementById('loading-bar-wrap');
  const barFill = document.getElementById('loading-bar-fill');
  const errorBanner = document.getElementById('prediction-error-banner');
  const dayTypeEl = document.getElementById('input-day-type');

  if (errorBanner) {
    errorBanner.classList.add('hidden');
    errorBanner.textContent = '';
  }

  // --- 1. Read + validate inputs ---
  const loc = (
    document.getElementById('input-location')?.value || ''
  ).trim();

  const date = document.getElementById('input-date')?.value || '';
  const time = document.getElementById('input-time')?.value || '';

  const selectedDayType =
    dayTypeEl?.value || '';

  const temp = readNumber('input-temp', NaN);
  const rain = readNumber('input-rain', NaN);
  const snow = readNumber('input-snow', NaN);
  const clouds = readNumber('input-clouds', NaN);

  const validationError =
    loc.length < 2
      ? 'Enter a target location (at least 2 characters).'
      : !date
        ? 'Choose a prediction date.'
        : date < '2026-01-01' || date > '2030-12-31'
          ? 'Prediction date must be between 2026-01-01 and 2030-12-31.'
          : !time
            ? 'Choose a prediction time.'
            : !selectedDayType
              ? 'Choose Weekday or Weekend.'
              : !Number.isFinite(temp) || temp < -90 || temp > 60
                ? 'Temperature must be a number between -90 °C and 60 °C.'
                : !Number.isFinite(rain) || rain < 0 || rain > 100
                  ? 'Rain must be a number between 0 and 100 mm.'
                  : !Number.isFinite(snow) || snow < 0 || snow > 100
                    ? 'Snow must be a number between 0 and 100 mm.'
                    : !Number.isFinite(clouds) || clouds < 0 || clouds > 100
                      ? 'Cloudiness must be a number between 0 and 100 %.'
                      : null;

  if (validationError) {
    if (errorBanner) {
      errorBanner.textContent =
        `Input error — ${validationError}`;
      errorBanner.classList.remove('hidden');
    }
    return null;
  }

  // Backend derives day type from the date.
  const dateObj = new Date(`${date}T12:00:00`);

  if (Number.isNaN(dateObj.getTime())) {
    if (errorBanner) {
      errorBanner.textContent =
        'Input error — Invalid prediction date.';
      errorBanner.classList.remove('hidden');
    }
    return null;
  }

  const actualDayType =
    dateObj.getDay() === 0 ||
    dateObj.getDay() === 6
      ? 'Weekend'
      : 'Weekday';

  if (selectedDayType !== actualDayType) {
    if (errorBanner) {
      errorBanner.textContent =
        `Input error — ${date} is a ${actualDayType}. ` +
        `Please select ${actualDayType}.`;
      errorBanner.classList.remove('hidden');
    }

    if (dayTypeEl) {
      dayTypeEl.value = actualDayType;
    }

    return null;
  }

  // --- 2. Loading state ---
  isPredicting = true;

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Locating Sensor...';
  if (btnIcon) btnIcon.textContent = 'location_searching';
  if (barWrap) barWrap.classList.remove('hidden');
  if (barFill) barFill.style.width = '25%';

  setLocationStatus(
    `Locating "${loc}"...`,
    'info'
  );

  const startedAt = performance.now();

  try {
    // --- 3. Geocode location first ---
    const geo = await geocodeLocation(loc);

    if (!geo) {
      throw new Error(
        `Could not find "${loc}". Try a more specific location.`
      );
    }

    if (
      !Number.isFinite(geo.latitude) ||
      !Number.isFinite(geo.longitude)
    ) {
      throw new Error(
        'Geocoding returned invalid coordinates.'
      );
    }

    if (barFill) barFill.style.width = '50%';

    setLocationStatus(
      `Location found. Running LightGBM V2 on nearest PeMS sensor...`,
      'info'
    );

    if (btnText) btnText.textContent = 'Running Inference...';
    if (btnIcon) btnIcon.textContent = 'model_training';

    // --- 4. Real FastAPI V2 prediction ---
    const response = await predictTraffic({
      location: loc,
      latitude: geo.latitude,
      longitude: geo.longitude,
      date,
      time,
      day_type: actualDayType,
      temperature: temp,
      rain,
      snow,
      cloudiness: clouds
    });

    const latencyMs =
      Math.round(performance.now() - startedAt);

    // --- 5. Update map from actual geocoded location ---
    updateTrafficMapLocation(
      geo.latitude,
      geo.longitude,
      loc
    );

    const shortName = geo.displayName
      .split(',')
      .slice(0, 3)
      .join(',')
      .trim();

    const sensor = response.sensor;

    if (sensor) {
      setLocationStatus(
        `Mapped to ${shortName}. ` +
        `Nearest PeMS sensor: ${sensor.sensor_id} ` +
        `(${Number(sensor.distance_km).toFixed(2)} km away).`,
        'success'
      );
    } else {
      setLocationStatus(
        `Map centered on ${shortName}.`,
        'success'
      );
    }

    if (barFill) barFill.style.width = '100%';

    // V2 response field is "prediction".
    const volume =
      Math.round(Number(response.prediction));

    if (!Number.isFinite(volume)) {
      throw new Error(
        'Backend returned an unexpected prediction value.'
      );
    }

    const severity = determineSeverity(volume);

    // --- 6. Update Result Card ---
    const resVolume =
      document.getElementById('result-volume');

    const resLoc =
      document.getElementById('result-location');

    const resTimestamp =
      document.getElementById('result-timestamp');

    const resDensityPct =
      document.getElementById('result-density-pct');

    const resDensityBar =
      document.getElementById('result-density-bar');

    const resSummary =
      document.getElementById('result-summary');

    if (resVolume) {
      resVolume.textContent =
        volume.toLocaleString();
    }

    if (resLoc) {
      resLoc.textContent = loc;
    }

    if (resTimestamp) {
      resTimestamp.textContent =
        `${date} • ${time}`;
    }

    // Backend-reported historical reference time (real 2017-2021 basis).
    const resHistRef =
      document.getElementById('result-hist-ref');

    if (resHistRef) {
      resHistRef.textContent =
        response.historical_reference_time
          ? `${response.historical_reference_time} (real history)`
          : '—';
    }

    // Density against the calibrated V2 output range
    // (real PeMS observations on this corridor peak near 993 vph).
    const densityPct =
      Math.min(
        99,
        Math.max(
          1,
          Math.round((volume / 1000) * 100)
        )
      );

    if (resDensityPct) {
      resDensityPct.textContent =
        `${densityPct}% of V2 range`;
    }

    if (resDensityBar) {
      resDensityBar.style.width =
        `${densityPct}%`;
    }

    // --- 7. Map pin & corridor updates ---
    const pinName =
      document.getElementById('map-pin-name');

    const pinDensity =
      document.getElementById('map-pin-density');

    if (pinName) {
      pinName.textContent = loc;
    }

    if (pinDensity) {
      pinDensity.textContent =
        `Density: ${densityPct}%`;
    }

    // --- 8. Latency ---
    const resLatency =
      document.getElementById('result-latency');

    const footerLatency =
      document.getElementById('footer-latency');

    if (resLatency) {
      resLatency.textContent =
        `${latencyMs} ms`;
    }

    if (footerLatency) {
      footerLatency.textContent =
        `${latencyMs} ms`;
    }

    // --- 9. Honest V2 analytical summary ---
    let summary =
      `LightGBM V2 predicted ` +
      `${volume.toLocaleString()} vehicles/hour ` +
      `for ${date} at ${time}. ` +
      `The location was matched to the nearest real ` +
      `PeMS traffic sensor. `;

    if (sensor) {
      summary +=
        `Sensor ${sensor.sensor_id} is ` +
        `${Number(sensor.distance_km).toFixed(2)} km away ` +
        `on ${sensor.freeway}-${sensor.direction}. `;
    }

    if (severity === 'high' ||
        severity === 'severe') {

      summary +=
        `High predicted traffic load.`;
    } else if (severity === 'moderate') {

      summary +=
        `Moderate predicted traffic load.`;
    } else {

      summary +=
        `Low predicted traffic load.`;
    }

    if (resSummary) {
      resSummary.textContent = summary;
    }

    // --- 10. Apply severity theme ---
    applyTheme(severity);

    const theme = THEMES[severity];

    addPredictionRow(
      loc,
      date,
      time,
      volume,
      theme.badgeText,
      theme.badgeBg,
      theme.badgeColor
    );

    // --- 11. Analytics ---
    const predictedHour =
      parseInt((time || '').split(':')[0], 10);

    updateAnalyticsCharts({
      hour: Number.isFinite(predictedHour)
        ? predictedHour
        : 18,
      volume,
      dayOfWeek: dateObj.getDay(),
      weather: clouds >= 70
        ? 'Clouds'
        : rain > 0
          ? 'Rain'
          : snow > 0
            ? 'Snow'
            : 'Clear'
    });

    if (
      typeof window.__setTrafficSeverityColor ===
      'function'
    ) {
      window.__setTrafficSeverityColor(
        theme.accent
      );
    }

    // --- 12. Real V2 weather sensitivity ---
    scheduleWeatherSensitivity({
      location: loc,
      latitude: geo.latitude,
      longitude: geo.longitude,
      date,
      time,
      day_type: actualDayType,
      temp,
      cloudiness: clouds
    });

    // --- 13. Real corridor predictions for map highlighting ---
    refreshCorridorTraffic({
      location: loc,
      latitude: geo.latitude,
      longitude: geo.longitude,
      date,
      time,
      day_type: actualDayType,
      temp,
      rain,
      snow,
      clouds
    });

    return {
      volume,
      severity,
      latencyMs,
      geo,
      sensor
    };

  } catch (err) {
    console.error(
      'Prediction failed:',
      err
    );

    if (errorBanner) {
      errorBanner.textContent =
        `API Error: ${err.message || 'Failed to connect to backend'}. ` +
        `Ensure FastAPI is running on http://127.0.0.1:8000 (dev proxy: ${API_BASE_URL})`;

      errorBanner.classList.remove('hidden');
    } else {
      alert(
        `Prediction failed: ${err.message}`
      );
    }

    return null;

  } finally {
    isPredicting = false;

    setTimeout(() => {
      if (btn) btn.disabled = false;

      if (btnText) {
        btnText.textContent =
          'Predict Traffic';
      }

      if (btnIcon) {
        btnIcon.textContent =
          'auto_awesome';
      }

      if (barWrap) {
        barWrap.classList.add('hidden');
      }

      if (barFill) {
        barFill.style.width = '0%';
      }
    }, 350);
  }
}
/* ------------------------------------------------------------------ */
/* Weather sensitivity â€” four real model runs on the same scenario     */
/* ------------------------------------------------------------------ */

let sensitivityRunToken = 0;

/**
 * Re-runs the current corridor scenario under Clear / Clouds / Rain / Snow so
 * the sensitivity chart shows genuine model behaviour instead of a fake curve.
 * Results only apply if no newer prediction has started in the meantime.
 */
async function scheduleWeatherSensitivity(base) {
  const token = ++sensitivityRunToken;

  const variants = [
    {
      label: 'Clear',
      rain: 0,
      snow: 0,
      cloudiness: 0
    },
    {
      label: 'Clouds',
      rain: 0,
      snow: 0,
      cloudiness: 80
    },
    {
      label: 'Rain',
      rain: 10,
      snow: 0,
      cloudiness: 90
    },
    {
      label: 'Snow',
      rain: 0,
      snow: 5,
      cloudiness: 90
    }
  ];

  const volumes = {};

  try {
    for (const variant of variants) {
      const response = await predictTraffic({
        location: base.location,
        latitude: base.latitude,
        longitude: base.longitude,
        date: base.date,
        time: base.time,
        day_type: base.day_type,
        temperature: base.temp,
        rain: variant.rain,
        snow: variant.snow,
        cloudiness: variant.cloudiness
      });

      if (token !== sensitivityRunToken) {
        return;
      }

      const value =
        Math.round(Number(response.prediction));

      if (!Number.isFinite(value)) {
        throw new Error(
          'Unexpected sensitivity response'
        );
      }

      volumes[variant.label] = value;
    }

    if (token === sensitivityRunToken) {
      setWeatherSensitivity(
        volumes,
        'Clear'
      );
    }

  } catch (error) {
    if (token === sensitivityRunToken) {
      console.warn(
        'Weather sensitivity unavailable:',
        error
      );

      setWeatherSensitivity(
        null,
        'Clear'
      );
    }
  }
}
export function addPredictionRow(loc, date, time, volume, badgeLabel, badgeBg, badgeColor) {
  const tbody = document.getElementById('predictions-table-body');
  if (!tbody) return;

  // First real row replaces the empty-state placeholder
  const emptyRow = document.getElementById('history-empty-row');
  if (emptyRow) emptyRow.remove();

  const row = document.createElement('tr');
  row.className = 'hover:bg-surface-container-high/40 transition-colors border-b border-white/5';
  row.innerHTML = `
    <td class="py-space-sm px-space-md text-primary font-medium flex items-center gap-2">
      <span class="material-symbols-outlined text-[16px] text-on-surface-variant">trip_origin</span>
      ${escapeHtml(loc)}
    </td>
    <td class="py-space-sm px-space-md text-on-surface-variant font-mono text-xs">${escapeHtml(date)}</td>
    <td class="py-space-sm px-space-md text-on-surface font-mono text-xs">${escapeHtml(time)}</td>
    <td class="py-space-sm px-space-md font-mono text-primary font-semibold">${volume.toLocaleString()} vph</td>
    <td class="py-space-sm px-space-md">
      <span class="px-space-sm py-0.5 rounded-full text-label-sm font-semibold" style="background-color: ${badgeBg}; color: ${badgeColor};">${escapeHtml(badgeLabel)}</span>
    </td>
    <td class="py-space-sm px-space-md text-right">
      <button type="button" class="text-primary-container hover:underline text-label-sm font-mono rerun-btn">Re-run</button>
    </td>
  `;

  // Attach re-run handler
  const btn = row.querySelector('.rerun-btn');
  if (btn) {
    btn.onclick = () => {
      const locEl = document.getElementById('input-location');
      const timeEl = document.getElementById('input-time');
      if (locEl) locEl.value = loc;
      if (timeEl) timeEl.value = time;
      updatePayloadSync();
      triggerPredictionExecution();
    };
  }

  tbody.insertBefore(row, tbody.firstChild);
}

export function handlePredictSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  triggerPredictionExecution();
}

// Chatbot Panel Interactions
export function toggleChatPanel() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;

  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);

  // Keep the 3D robot widget and the chat drawer from overlapping
  const widget = document.getElementById('assistant-widget');
  if (widget) widget.classList.toggle('hidden', opening);
}

export function setBotStatus(status, color) {
  const text = document.getElementById('bot-status-text');
  const dot = document.getElementById('bot-status-dot');
  if (text) text.textContent = `Status: ${status}`;
  if (dot) dot.style.backgroundColor = color;
}

export function sendQuickPrompt(promptText) {
  const input = document.getElementById('chat-input');
  if (input) input.value = promptText;
  processChatMessage(promptText);
}

export function handleChatSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('chat-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  processChatMessage(val);
  input.value = '';
}

export function triggerMicVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const input = document.getElementById('chat-input');

  if (!SpeechRecognition) {
    appendMessage('bot', 'Voice input is not supported in this browser â€” please type your question instead.', true);
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  setBotStatus('Listening...', '#f59e0b');
  if (typeof window.__setTrafficAssistantState === 'function') {
    window.__setTrafficAssistantState('listening');
  }

  recognition.onresult = (event) => {
    const transcript = String(event.results[0][0].transcript || '').trim();
    if (!transcript) return;
    if (input) input.value = transcript;
    processChatMessage(transcript);
  };

  recognition.onerror = () => {
    finishAssistantTurn();
    appendMessage('bot', 'Could not capture voice input. Check microphone permissions and try again.', true);
  };

  try {
    recognition.start();
  } catch (_) {
    finishAssistantTurn();
  }
}

export function appendMessage(sender, text, isAi = false) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `flex gap-2 ${isAi ? '' : 'flex-row-reverse'}`;

  if (isAi) {
    msgDiv.innerHTML = `
      <div class="w-6 h-6 rounded-full bg-primary-container/20 flex-shrink-0 flex items-center justify-center text-primary-container text-[14px]">
        <span class="material-symbols-outlined text-[14px]">smart_toy</span>
      </div>
      <div class="bg-surface-container-low p-space-sm rounded-xl rounded-tl-none text-on-surface-variant text-sm">
        ${text}
      </div>
    `;
  } else {
    msgDiv.innerHTML = `
      <div class="bg-primary-container text-on-primary-container p-space-sm rounded-xl rounded-tr-none font-medium text-sm">
        ${escapeHtml(text)}
      </div>
    `;
  }
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/* ------------------------------------------------------------------ */
/* Chat NLU helpers                                                    */
/* ------------------------------------------------------------------ */

const CHAT_LOCATIONS = [
  { keys: ['bandra', 'bkc', 'mumbai'], value: 'Bandra-Kurla Complex' },
  { keys: ['islamabad'], value: 'Islamabad' },
  { keys: ['karachi'], value: 'Karachi' },
  { keys: ['lahore'], value: 'Lahore' },
  { keys: ['delhi', 'ring road'], value: 'Outer Ring Road, Delhi' },
  { keys: ['bengaluru', 'bangalore', 'silk board', 'orr'], value: 'Central Silk Board, Bengaluru' },
  { keys: ['st. paul', 'saint paul'], value: 'St. Paul' },
  { keys: ['msp', 'airport'], value: 'MSP Airport' },
  { keys: ['minneapolis', 'downtown'], value: 'Downtown Minneapolis' },
  { keys: ['dubai'], value: 'Dubai' },
  { keys: ['london'], value: 'London' }
];

function matchesWord(lowerText, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(lowerText);
}

const toIsoDate = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

/** Extract every clock time in the sentence, normalized to HH:MM, in order. */
function parseChatTimes(text) {
  const found = [];
  const ampm = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/gi;
  const military = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
  let match;

  while ((match = ampm.exec(text)) !== null) {
    let hours = parseInt(match[1], 10) % 12;
    if (match[3].toLowerCase() === 'pm') hours += 12;
    found.push({ index: match.index, value: `${String(hours).padStart(2, '0')}:${match[2] || '00'}` });
  }
  while ((match = military.exec(text)) !== null) {
    found.push({ index: match.index, value: `${String(parseInt(match[1], 10)).padStart(2, '0')}:${match[2]}` });
  }

  const seen = new Set();
  return found
    .filter((entry) => {
      if (seen.has(entry.value)) return false;
      seen.add(entry.value);
      return true;
    })
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.value);
}

/** Resolve today / tomorrow / weekday names to an ISO date, else null. */
function parseChatDate(text) {
  const lower = text.toLowerCase();

  // IntelliTraffic V2 predicts 2026-2030 dates, backed by real
  // 2017-2021 history. If the user gives an explicit date, use it.
  const explicitDate = lower.match(
    /\b(2026|2027|2028|2029|2030)[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/
  );

  if (explicitDate) {
    return explicitDate[0].replace(/\//g, '-');
  }

  // "Today", "tomorrow", and weekday names resolve against the
  // currently selected workspace date (2026-2030 window).
  const dateInput = document.getElementById('input-date');
  const currentDate = dateInput?.value || '2026-10-15';

  const parsedCurrentDate = new Date(`${currentDate}T12:00:00`);

  if (
    !Number.isNaN(parsedCurrentDate.getTime()) &&
    parsedCurrentDate.getFullYear() >= 2026 &&
    parsedCurrentDate.getFullYear() <= 2030
  ) {
    if (
      lower.includes('today') ||
      lower.includes('tonight') ||
      lower.includes('now')
    ) {
      return toIsoDate(parsedCurrentDate);
    }

    if (lower.includes('tomorrow')) {
      const tomorrow = new Date(parsedCurrentDate);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (tomorrow.getFullYear() <= 2030) {
        return toIsoDate(tomorrow);
      }

      return toIsoDate(parsedCurrentDate);
    }

    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday'
    ];

    for (let i = 0; i < dayNames.length; i += 1) {
      if (lower.includes(dayNames[i])) {
        const target = new Date(parsedCurrentDate);
        const diff =
          ((i - parsedCurrentDate.getDay()) + 7) % 7 || 7;

        target.setDate(target.getDate() + diff);

        if (target.getFullYear() <= 2030) {
          return toIsoDate(target);
        }

        return toIsoDate(parsedCurrentDate);
      }
    }
  }

  return null;
}

/** Map natural weather words to the backend's one-hot vocabulary. */
/**
 * Map natural weather words to the numeric weather inputs
 * expected by the LightGBM V2 model.
 */
function parseChatWeather(text) {
  const lower = text.toLowerCase();

  if (/\b(rain|rainy|raining|showers?|drizzle|precip)\b/.test(lower)) {
    return {
      label: 'Rain',
      rain: 10,
      snow: 0,
      cloudiness: 90
    };
  }

  if (/\b(snow|snowy|snowing|blizzard)\b/.test(lower)) {
    return {
      label: 'Snow',
      rain: 0,
      snow: 5,
      cloudiness: 90
    };
  }

  if (/\b(fog|mist)\b/.test(lower)) {
    return {
      label: 'Fog',
      rain: 0,
      snow: 0,
      cloudiness: 40
    };
  }

  if (/\b(storm|thunderstorm|thunder)\b/.test(lower)) {
    return {
      label: 'Thunderstorm',
      rain: 20,
      snow: 0,
      cloudiness: 95
    };
  }

  if (/\b(clear|sunny|sunshine)\b/.test(lower)) {
    return {
      label: 'Clear',
      rain: 0,
      snow: 0,
      cloudiness: 0
    };
  }

  if (/\b(cloudy|clouds|overcast)\b/.test(lower)) {
    return {
      label: 'Clouds',
      rain: 0,
      snow: 0,
      cloudiness: 75
    };
  }

  return null;
}
/** Known corridors first, then a generic "in/at/for <place>" extraction. */
function parseChatLocation(text) {
  const lower = text.toLowerCase();

  for (const entry of CHAT_LOCATIONS) {
    if (entry.keys.some((key) => matchesWord(lower, key))) return entry.value;
  }

  const match = text.match(
    /\b(?:in|at|for|near)\s+([A-Za-z][A-Za-z .'-]{2,48}?)(?=\s+(?:at|on|by|around|tomorrow|today|tonight|this|next)\b|[,.?!]|$)/i
  );
  if (match) {
    const candidate = match[1].trim().replace(/\s+(?:traffic|please|now)$/i, '');
    if (candidate.length >= 3 && !/^(the|a|an|here|there|it|my|our)$/i.test(candidate)) return candidate;
  }

  return null;
}

let assistantStatusTimer = null;

/** Settle the assistant UI + 3D robot back to idle after a reply. */
function finishAssistantTurn() {
  setBotStatus('Answering', '#00f2fe');
  if (typeof window.__setTrafficAssistantState === 'function') {
    window.__setTrafficAssistantState('answering');
  }
  clearTimeout(assistantStatusTimer);
  assistantStatusTimer = setTimeout(() => {
    setBotStatus('Ready', '#4edea3');
    if (typeof window.__setTrafficAssistantState === 'function') {
      window.__setTrafficAssistantState('idle');
    }
  }, 2200);
}

export async function processChatMessage(userText) {
  appendMessage('user', userText, false);
  setBotStatus('Thinking...', '#f59e0b');
  if (typeof window.__setTrafficAssistantState === 'function') {
    window.__setTrafficAssistantState('thinking');
  }

  const lower = userText.toLowerCase();

  // Capability / greeting intents get a help card instead of a prediction
  if (
    /\b(help|capabilities|what can you (do|answer))\b/.test(lower) ||
    /^(hi|hello|hey)[\s!?.]*$/.test(lower.trim())
  ) {
    appendMessage(
      'bot',
      'I answer in natural language using the <strong>LightGBM V2 traffic model</strong>. Try things like:<br>' +
        'â€¢ â€œTraffic in Minneapolis Downtown at 6 PMâ€<br>' +
        'â€¢ â€œPredict traffic in Islamabad tomorrow at 9 AMâ€<br>' +
        'â€¢ â€œWhat if it rains in St. Paul at 8 AM?â€<br>' +
        'â€¢ â€œCompare traffic at 8 AM and 6 PMâ€<br>' +
        'Times, dates (today / tomorrow / weekday names), weather words and many corridors are understood.',
      true
    );
    finishAssistantTurn();
    return;
  }

  const times = parseChatTimes(userText);
  const weatherInfo = parseChatWeather(userText);
  const dateIso = parseChatDate(userText);
  const parsedLocation = parseChatLocation(userText);
  const wantsCompare = times.length >= 2 || /\b(compare|versus|vs)\b/.test(lower);

  // Synchronize the workspace form so the chat and the Predict button
  // share the same real V2 inference path.
  const locEl = document.getElementById('input-location');
  const timeEl = document.getElementById('input-time');
  const dayTypeEl = document.getElementById('input-day-type');
  const tempEl = document.getElementById('input-temp');
  const rainEl = document.getElementById('input-rain');
  const snowEl = document.getElementById('input-snow');
  const cloudsEl = document.getElementById('input-clouds');
  const dateEl = document.getElementById('input-date');

  if (parsedLocation && locEl) {
    locEl.value = parsedLocation;
  }

  if (dateIso && dateEl) {
    dateEl.value = dateIso;
  }

  if (weatherInfo) {
    if (rainEl) {
      rainEl.value = weatherInfo.rain;
    }

    if (snowEl) {
      snowEl.value = weatherInfo.snow;
    }

    if (cloudsEl) {
      cloudsEl.value = weatherInfo.cloudiness;
    }
  }

  if (dateEl?.value && dayTypeEl) {
    const chatDate = new Date(
      `${dateEl.value}T12:00:00`
    );

    if (!Number.isNaN(chatDate.getTime())) {
      dayTypeEl.value =
        chatDate.getDay() === 0 ||
        chatDate.getDay() === 6
          ? 'Weekend'
          : 'Weekday';
    }
  }

  const activeLocation =
    (locEl?.value || '').trim();

  const activeWeather =
    weatherInfo?.label ||
    (
      Number(cloudsEl?.value || 0) >= 70
        ? 'Clouds'
        : Number(rainEl?.value || 0) > 0
          ? 'Rain'
          : Number(snowEl?.value || 0) > 0
            ? 'Snow'
            : 'Clear'
    );

  // --- Comparison intent: two real model runs, e.g. "compare 8 AM and 6 PM" ---
  if (wantsCompare && times.length >= 2) {
    const runs = [];

    for (const runTime of times.slice(0, 2)) {
      if (timeEl) timeEl.value = runTime;
      updatePayloadSync();
      setBotStatus(`Querying model for ${runTime}...`, '#00f2fe');

      const result = await triggerPredictionExecution();
      if (!result) {
        appendMessage('bot', 'I could not complete the comparison â€” please check the workspace form and try again.', true);
        finishAssistantTurn();
        return;
      }
      runs.push({ time: runTime, ...result });
    }

    const [first, second] = runs;
    const heavier = first.volume >= second.volume ? first : second;
    const lighter = heavier === first ? second : first;
    const gapPct = lighter.volume > 0 ? Math.round(((heavier.volume - lighter.volume) / lighter.volume) * 100) : 0;

    appendMessage(
      'bot',
      `<strong>Peak comparison</strong> for ${escapeHtml(activeLocation)}:<br>` +
        `â€¢ ${escapeHtml(first.time)} â†’ <strong>${first.volume.toLocaleString()} vph</strong> (${THEMES[first.severity].badgeText})<br>` +
        `â€¢ ${escapeHtml(second.time)} â†’ <strong>${second.volume.toLocaleString()} vph</strong> (${THEMES[second.severity].badgeText})<br>` +
        `${escapeHtml(heavier.time)} carries about <strong>${gapPct}%</strong> more traffic ` +
        `(${(heavier.volume - lighter.volume).toLocaleString()} vph). Two real model runs â€” map, analytics and history are updated.`,
      true
    );
    finishAssistantTurn();
    return;
  }

  // --- Single prediction intent (uses parsed values, falls back to the form) ---
  if (timeEl && times.length === 1) timeEl.value = times[0];
  updatePayloadSync();

  setBotStatus('Querying ML model...', '#00f2fe');
  const result = await triggerPredictionExecution();

  if (!result) {
    finishAssistantTurn();
    appendMessage('bot', 'I could not complete that prediction â€” please check the workspace form and try again.', true);
    return;
  }

  const activeTime = timeEl?.value || '18:00';
  const advice = {
    low: 'Light flow â€” the corridor should clear quickly.',
    moderate: 'Moderate congestion â€” normal signal timing should cope.',
    high: 'Heavy congestion â€” expect queues through this window.',
    severe: 'Severe overload â€” consider re-timing the trip or an alternate route.'
  }[result.severity];

  appendMessage(
    'bot',
    `Real model prediction for <strong>${escapeHtml(activeLocation)}</strong> at ` +
      `<strong>${escapeHtml(activeTime)}</strong> (${escapeHtml(activeWeather)}): ` +
      `<strong>${result.volume.toLocaleString()} vehicles/hr</strong> â€” ` +
      `<span style="color:${THEMES[result.severity].accent}; font-weight:bold;">${THEMES[result.severity].badgeText}</span>. ` +
      `${advice} Workspace, map and history updated.`,
    true
  );
  finishAssistantTurn();
}

/**
 * Build the pulsing prediction marker icon (styled via .traffic-marker in main.css).
 */
function createMarkerIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="traffic-marker"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12]
  });
}

/**
 * Update the Leaflet map using real latitude and longitude from geocoding.
 * This only drives the map view â€” it never alters the model prediction.
 */
export function updateTrafficMapLocation(latitude, longitude, locationName = 'Selected Location') {
  if (!trafficMap) {
    console.warn('Traffic map is not initialized.');
    return;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.warn('Invalid coordinates:', latitude, longitude);
    return;
  }

  trafficMap.flyTo([lat, lng], 14, { duration: 1.5 });

  const popupHtml =
    `<strong>${escapeHtml(locationName)}</strong><br>Map view — prediction uses the nearest real PeMS sensor`;

  if (trafficMarker) {
    trafficMarker
      .setLatLng([lat, lng])
      .bindPopup(popupHtml)
      .openPopup();
  } else {
    trafficMarker = L.marker([lat, lng], { icon: createMarkerIcon() })
      .addTo(trafficMap)
      .bindPopup(popupHtml)
      .openPopup();
  }

  // Update dashboard location text
  const mapPinName = document.getElementById('map-pin-name');
  if (mapPinName) mapPinName.textContent = locationName;
}

/* ------------------------------------------------------------------ */
/* Corridor traffic map — real /traffic-map predictions                */
/* ------------------------------------------------------------------ */

let corridorLayer = null;

function severityColor(severityKey) {
  const key = String(severityKey || '').toLowerCase();
  return SEVERITY_COLORS[key] || '#849495';
}

/**
 * Short segment representation centred on the REAL sensor coordinate,
 * oriented along the sensor's real PeMS direction (N/S/E/W).
 *
 * PeMS metadata provides point coordinates only — no GIS road geometry —
 * so this is a clearly-associated segment marker for the sensor, not
 * fabricated road geometry.
 */
function corridorSegmentCoords(segment) {
  const lat = Number(segment.latitude);
  const lng = Number(segment.longitude);
  const dir = String(segment.direction || '').trim().toUpperCase();

  const half = 0.0009; // ~100 m half-length
  const lngScale = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));

  let dLat = 0;
  let dLng = 0;

  if (dir === 'E' || dir === 'W') {
    dLng = half * lngScale;
  } else {
    // N, S or unspecified — orient along the north-south axis
    dLat = half;
  }

  return [
    [lat - dLat, lng - dLng],
    [lat + dLat, lng + dLng]
  ];
}

function corridorPopupHtml(segment) {
  const color = severityColor(segment.severity);
  const volume = Math.round(Number(segment.prediction)).toLocaleString();

  return (
    `<div style="min-width:210px">` +
    `<strong>Sensor ${escapeHtml(String(segment.sensor_id))}</strong><br>` +
    `Prediction: <strong style="color:${color}">${volume} veh/hr</strong><br>` +
    `Severity: <strong style="color:${color}">${escapeHtml(String(segment.severity || '—'))}</strong><br>` +
    `Freeway: ${escapeHtml(String(segment.freeway || '—'))} · Direction ${escapeHtml(String(segment.direction || '—'))}<br>` +
    `Lanes: ${escapeHtml(String(segment.lanes ?? '—'))} · Type: ${escapeHtml(String(segment.type || '—'))}<br>` +
    `Distance: ${Number(segment.distance_km).toFixed(2)} km<br>` +
    `<span style="color:#849495">Real LightGBM V2 run · history basis ${escapeHtml(String(segment.historical_reference_time || '—'))}</span>` +
    `</div>`
  );
}

/** Replace the corridor segments on the Leaflet map with new real results. */
function renderCorridorSegments(segments) {
  if (!trafficMap) return;

  if (corridorLayer) {
    corridorLayer.remove();
    corridorLayer = null;
  }

  corridorLayer = L.layerGroup();

  segments.forEach((segment) => {
    const lat = Number(segment.latitude);
    const lng = Number(segment.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const color = severityColor(segment.severity);
    const popupHtml = corridorPopupHtml(segment);

    // Severity-coloured segment representation of the sensor's road position
    L.polyline(corridorSegmentCoords(segment), {
      color,
      weight: 6,
      opacity: 0.85,
      className: 'corridor-segment'
    }).bindPopup(popupHtml).addTo(corridorLayer);

    // Exact real sensor coordinate
    L.circleMarker([lat, lng], {
      radius: 5,
      color: '#ffffff',
      weight: 1.5,
      fillColor: color,
      fillOpacity: 1
    }).bindPopup(popupHtml).addTo(corridorLayer);
  });

  corridorLayer.addTo(trafficMap);
}

function setCorridorStatus(message, kind = 'info') {
  const chip = document.getElementById('map-corridor-status');
  const text = document.getElementById('map-corridor-text');

  if (!chip || !text) return;

  text.textContent = message;

  const dot = chip.querySelector('span');

  if (dot) {
    dot.style.backgroundColor =
      kind === 'error' ? '#ef4444' : kind === 'success' ? '#4edea3' : '#00f2fe';
  }
}

/**
 * Fetch real multi-sensor predictions from POST /traffic-map and highlight
 * the surrounding PeMS corridor on the map. Loading and error states are
 * surfaced on the map status chip — no fake segments are ever drawn.
 */
async function refreshCorridorTraffic(base) {
  setCorridorStatus('Analyzing nearby PeMS corridors…', 'info');

  try {
    const response = await fetchTrafficMap({
      location: base.location,
      latitude: base.latitude,
      longitude: base.longitude,
      date: base.date,
      time: base.time,
      day_type: base.day_type,
      temperature: base.temp,
      rain: base.rain,
      snow: base.snow,
      cloudiness: base.clouds
    });

    const segments =
      Array.isArray(response.segments) ? response.segments : [];

    if (!segments.length) {
      setCorridorStatus(
        'No corridor predictions available for this location.',
        'error'
      );
      return;
    }

    renderCorridorSegments(segments);

    const counts = segments.reduce((acc, segment) => {
      const key = String(segment.severity || '').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const errorNote =
      Array.isArray(response.errors) && response.errors.length
        ? ` (${response.errors.length} sensor(s) without history)`
        : '';

    setCorridorStatus(
      `${segments.length} real sensor predictions${errorNote} — ` +
      `Low: ${counts.low || 0} · Moderate: ${counts.moderate || 0} · ` +
      `High: ${counts.high || 0} · Severe: ${counts.severe || 0}`,
      'success'
    );

  } catch (error) {
    console.error('Corridor analysis failed:', error);
    setCorridorStatus(`Corridor analysis failed: ${error.message}`, 'error');
  }
}

// Expose only the functions referenced by inline HTML attributes
window.setPreset = setPreset;
window.handlePredictSubmit = handlePredictSubmit;
window.toggleChatPanel = toggleChatPanel;
window.sendQuickPrompt = sendQuickPrompt;
window.handleChatSubmit = handleChatSubmit;
window.triggerMicVoice = triggerMicVoice;

// Initialize on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  // Set a valid prediction date if empty.
  // IntelliTraffic V2 supports the 2026-2030 prediction window.
  const dateInput = document.getElementById('input-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = '2026-10-15';
  }

  // Set current time if empty
  const timeInput = document.getElementById('input-time');
  if (timeInput && !timeInput.value) {
    timeInput.value = '18:00';
  }

  // Wire input change listeners to sync JSON preview
  const form = document.getElementById('prediction-form');
  if (form) {
    form.addEventListener('input', updatePayloadSync);
    form.addEventListener('change', updatePayloadSync);
  }

  updatePayloadSync();
  applyTheme('neutral'); // Awaiting state until the first real prediction
  initAnalyticsCharts(); // Reference patterns until a live prediction lands

  // Payload drawer toggle (shared endpoint console)
  const payloadToggle = document.getElementById('payload-toggle');
  const payloadDrawer = document.getElementById('payload-drawer');
  if (payloadToggle && payloadDrawer) {
    payloadToggle.addEventListener('click', () => {
      togglePayloadDrawer();
      payloadToggle.setAttribute('aria-expanded', String(!payloadDrawer.classList.contains('hidden')));
    });
  }

  // --- Live API health check: update status badges on load ---
  const apiStatusDot = document.getElementById('api-status-dot');
  const apiStatusText = document.getElementById('api-status-text');
  checkApiHealth().then((isOnline) => {
    if (apiStatusText) {
      apiStatusText.textContent = isOnline ? 'Online' : 'Offline';
      apiStatusText.style.color = isOnline ? '#10b981' : '#ef4444';
    }
    if (apiStatusDot) {
      apiStatusDot.style.backgroundColor = isOnline ? '#10b981' : '#ef4444';
    }
    setBotStatus(isOnline ? 'Ready' : 'API Offline', isOnline ? '#10b981' : '#ef4444');
    if (!isOnline) {
      const banner = document.getElementById('prediction-error-banner');
      if (banner) {
        banner.textContent = `Cannot reach the API at ${API_BASE_URL}. Start the backend: uvicorn src.main:app --host 127.0.0.1 --port 8000`;
        banner.classList.remove('hidden');
      }
    }
  });
  // Leaflet map (initialized only now that its container exists)
  initTrafficMap();
  centerMapOnCurrentInput();

  // Initialize Three.js 3D Robot Assistant
  try {
    initThreeAssistant();
  } catch (e) {
    console.warn('Failed to initialize Three.js assistant:', e);
  }
});
/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */
function initNavigation() {
  const navLinks = document.querySelectorAll('#main-nav a[data-path]');

  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = document.querySelector(link.getAttribute('href'));

      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveNavLink(link);
      history.replaceState(null, '', link.getAttribute('href'));
    });
  });

  // Scrollspy: highlight the nav link for the section currently in view
  const sections = Array.from(navLinks)
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const link = document.querySelector(`#main-nav a[href="#${entry.target.id}"]`);
          if (link) setActiveNavLink(link);
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
  }
}

function setActiveNavLink(activeLink) {
  document.querySelectorAll('#main-nav a[data-path]').forEach((item) => {
    if (item === activeLink) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });
}

/* ------------------------------------------------------------------ */
/* Leaflet map setup                                                   */
/* ------------------------------------------------------------------ */
function initTrafficMap() {
  const mapElement = document.getElementById('traffic-map');

  if (!mapElement || typeof L === 'undefined') {
    console.warn('Leaflet is unavailable â€” map section disabled.');
    return;
  }

  trafficMap = L.map(mapElement, {
    center: [44.95, -93.26], // default view (model training city)
    zoom: 12,
    zoomControl: true,
    worldCopyJump: true
  });

  activeTileLayer = createTileLayer(currentLayerKey);
  activeTileLayer.addTo(trafficMap);

  trafficMarker = L.marker(trafficMap.getCenter(), { icon: createMarkerIcon() })
    .addTo(trafficMap)
    .bindPopup('Map context â€” enter a location to center the view');

  // Ensure correct sizing once the section becomes visible and on window resize
  const refreshSize = () => trafficMap && trafficMap.invalidateSize();

  if ('IntersectionObserver' in window) {
    const sizeObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          refreshSize();
          sizeObserver.disconnect();
        }
      });
    }, { threshold: 0.15 });

    sizeObserver.observe(mapElement);
  }

  window.addEventListener('resize', debounce(refreshSize, 200));

  bindMapLayerToggle();
}

function createTileLayer(layerKey) {
  const config = MAP_LAYERS[layerKey] || MAP_LAYERS.dark;

  return L.tileLayer(config.url, {
    attribution: config.attribution,
    subdomains: config.subdomains,
    maxZoom: config.maxZoom,
    className: config.className || ''
  });
}

function bindMapLayerToggle() {
  const buttons = document.querySelectorAll('#map-layer-toggle .map-layer-btn');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const layerKey = button.dataset.layer;

      if (!layerKey || layerKey === currentLayerKey || !trafficMap) return;

      currentLayerKey = layerKey;

      if (activeTileLayer) trafficMap.removeLayer(activeTileLayer);
      activeTileLayer = createTileLayer(layerKey);
      activeTileLayer.addTo(trafficMap);

      buttons.forEach((item) => {
        item.setAttribute('aria-pressed', String(item === button));
      });
    });
  });
}

// Geocode the current input value once so the map reflects it on first load
async function centerMapOnCurrentInput() {
  const loc = (document.getElementById('input-location')?.value || '').trim();

  if (!loc || loc.length < 2 || !trafficMap) return;

  try {
    const geo = await geocodeLocation(loc);

    if (geo) {
      updateTrafficMapLocation(geo.latitude, geo.longitude, loc);
      const shortName = geo.displayName.split(',').slice(0, 3).join(',').trim();
      setLocationStatus(`Map centered on ${shortName}.`, 'success');
    }
  } catch (_) {
    // Silent on first load â€” explicit feedback appears when the user predicts
  }
}
