/**
 * Analytics charts — responsive and prediction-driven.
 *
 * Four views power the "Predictive Telematics" grid:
 *  1. Daily curve   — corridor reference shape + live prediction dot and guide line
 *  2. Hourly bars   — hour-by-hour reference volumes with the predicted hour highlighted
 *  3. Load gauge    — predicted volume vs arterial capacity, weekend-baseline tick
 *  4. Weather bars  — live model comparison across Clear / Clouds / Rain / Snow
 *
 * Every value shown is either a clearly-labelled training-corridor reference or
 * a real model output — nothing in here fabricates a prediction.
 */

const CAPACITY_VPH = 6000;

// Typical weekday traffic volumes (vph) observed on the training corridor
// (Metro Interstate dataset) — used as the reference shape behind live overlays.
const WEEKDAY_REFERENCE = [
  700, 450, 380, 350, 500, 1200, 2600, 4500, 5200, 4300, 3600, 3400,
  3500, 3600, 3800, 4300, 5000, 5600, 4900, 3900, 3000, 2300, 1600, 1000
];
const WEEKEND_REFERENCE = [
  900, 650, 520, 480, 600, 1000, 1700, 2400, 2900, 3100, 3200, 3300,
  3400, 3450, 3400, 3300, 3200, 3100, 2900, 2500, 2100, 1700, 1300, 1050
];

const WEATHER_VARIANTS = ['Clear', 'Clouds', 'Rain', 'Snow'];
// Fallback multipliers (relative to a clear-day baseline) used until the
// live four-run comparison arrives from the real API.
const REFERENCE_WEATHER_MULT = { Clear: 1.0, Clouds: 1.06, Rain: 1.16, Snow: 1.34 };

const state = {
  hour: 17,
  volume: null,
  dayOfWeek: new Date().getDay(),
  weather: 'Clear',
  sensitivity: null // { Clear: vph, Clouds: vph, Rain: vph, Snow: vph }
};

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function referenceForDay(dayOfWeek) {
  return dayOfWeek === 0 || dayOfWeek === 6 ? WEEKEND_REFERENCE : WEEKDAY_REFERENCE;
}

function curvePoints(values, width, height, topPad, bottomPad) {
  return values.map((value, hour) => [
    (hour / (values.length - 1)) * width,
    height - bottomPad - (value / CAPACITY_VPH) * (height - topPad - bottomPad)
  ]);
}

function linePath(points) {
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
}

/* ------------------------------------------------------------------ */
/* 1. Daily curve with live prediction dot                             */
/* ------------------------------------------------------------------ */

function renderDailyCurve() {
  const el = $('chart-daily-curve');
  if (!el) return;

  const W = 240;
  const H = 96;
  const reference = referenceForDay(state.dayOfWeek);
  const points = curvePoints(reference, W, H, 6, 6);
  const areaPath = `${linePath(points)} L ${W} ${H} L 0 ${H} Z`;

  let guideMarkup = '';
  let markerMarkup = '';
  const note = $('chart-curve-note');

  if (state.volume !== null) {
    const guideX = (state.hour / 23) * W;
    const valueY = H - 6 - (clamp(state.volume, 0, CAPACITY_VPH * 1.15) / CAPACITY_VPH) * (H - 12);

    guideMarkup = `<line class="chart-guide" x1="${guideX.toFixed(2)}" y1="0" x2="${guideX.toFixed(2)}" y2="${H}"></line>`;
    markerMarkup =
      `<div class="chart-marker" style="left:${((state.hour / 23) * 100).toFixed(2)}%; top:${clamp((valueY / H) * 100, 4, 96).toFixed(2)}%;" ` +
      `title="${state.volume.toLocaleString()} vph at ${String(state.hour).padStart(2, '0')}:00"></div>`;

    if (note) note.textContent = `${String(state.hour).padStart(2, '0')}:00 · ${state.volume.toLocaleString()} vph`;
  } else if (note) {
    note.textContent = 'Awaiting prediction';
  }

  el.innerHTML = `
    <div class="chart-surface">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="chart-trend-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--accent-current)" stop-opacity="0.30"></stop>
            <stop offset="100%" stop-color="var(--accent-current)" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <line class="chart-grid-line" x1="0" y1="${H - 6}" x2="${W}" y2="${H - 6}"></line>
        <line class="chart-grid-line" x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}"></line>
        ${guideMarkup}
        <path class="chart-area" d="${areaPath}"></path>
        <path class="chart-curve" d="${linePath(points)}"></path>
      </svg>
      ${markerMarkup}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* 2. Hourly distribution bars                                         */
/* ------------------------------------------------------------------ */

function renderHourlyBars() {
  const el = $('chart-hourly-bars');
  if (!el) return;

  const startHour = 6;
  const endHour = 21;
  const reference = referenceForDay(state.dayOfWeek);
  const maxV = Math.max(...reference.slice(startHour, endHour + 1));
  const predictedHour = state.volume !== null ? state.hour : null;

  const columns = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    const heightPct = Math.max(4, Math.round((reference[hour] / maxV) * 100));

    if (hour === predictedHour) {
      columns.push(
        `<div class="relative flex-1 min-w-0 h-full flex items-end">
          <div class="chart-bar-active w-full rounded-t" style="height:${heightPct}%; background-color: var(--accent-current);"></div>
          <span class="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-primary">${String(hour).padStart(2, '0')}</span>
        </div>`
      );
    } else {
      columns.push(
        `<div class="flex-1 min-w-0 h-full flex items-end">
          <div class="chart-bar w-full bg-surface-container-high rounded-t" style="height:${heightPct}%"></div>
        </div>`
      );
    }
  }

  el.innerHTML = `<div class="flex items-end justify-between gap-[3px] h-full w-full pt-4">${columns.join('')}</div>`;

  const note = $('chart-bars-note');
  if (note) {
    note.textContent =
      predictedHour !== null
        ? `Predicted hour ${String(predictedHour).padStart(2, '0')}:00 highlighted`
        : 'Dual peak pattern';
  }
}

/* ------------------------------------------------------------------ */
/* 3. Capacity load gauge                                              */
/* ------------------------------------------------------------------ */

function polarToCartesian(cx, cy, radius, angleRad) {
  return {
    x: (cx + radius * Math.cos(angleRad)).toFixed(2),
    y: (cy - radius * Math.sin(angleRad)).toFixed(2)
  };
}

function renderGauge() {
  const el = $('chart-weekday-gauge');
  if (!el) return;

  const cx = 60;
  const cy = 52;
  const r = 40;

  const load = state.volume !== null ? clamp(state.volume / CAPACITY_VPH, 0, 1) : 0;
  const isWeekend = state.dayOfWeek === 0 || state.dayOfWeek === 6;
  const weekendRefLoad = clamp(WEEKEND_REFERENCE[state.hour] / CAPACITY_VPH, 0, 1);

  const start = polarToCartesian(cx, cy, r, Math.PI);
  const end = polarToCartesian(cx, cy, r, 0);
  const trackPath = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;

  const loadAngle = Math.PI * (1 - load);
  const loadEnd = polarToCartesian(cx, cy, r, loadAngle);
  const valueArc =
    load > 0.005
      ? `M ${start.x} ${start.y} A ${r} ${r} 0 0 ${load > 0.5 ? 1 : 0} ${loadEnd.x} ${loadEnd.y}`
      : '';

  const needleRotation = (load * 180 - 90).toFixed(1);

  const tickAngle = Math.PI * (1 - weekendRefLoad);
  const tickOuter = polarToCartesian(cx, cy, r + 7, tickAngle);
  const tickInner = polarToCartesian(cx, cy, r - 7, tickAngle);

  el.innerHTML = `
    <div class="chart-surface flex items-center justify-center">
      <svg class="h-full w-auto max-w-full" viewBox="0 0 120 66" aria-hidden="true">
        <path class="chart-gauge-track" d="${trackPath}" fill="none" stroke-width="8" stroke-linecap="round"></path>
        ${valueArc ? `<path class="chart-gauge-value" d="${valueArc}" fill="none" stroke-width="8" stroke-linecap="round"></path>` : ''}
        <line class="chart-gauge-tick" x1="${tickInner.x}" y1="${tickInner.y}" x2="${tickOuter.x}" y2="${tickOuter.y}"></line>
        <g class="chart-gauge-needle" transform="rotate(${needleRotation} ${cx} ${cy})">
          <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r + 6}" stroke-width="3" stroke-linecap="round"></line>
        </g>
        <circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--accent-current)"></circle>
        <circle cx="${cx}" cy="${cy}" r="2" fill="#0a0e16"></circle>
      </svg>
    </div>`;

  const note = $('chart-gauge-note');
  if (note) {
    note.textContent =
      state.volume !== null
        ? `${Math.round(load * 100)}% of capacity · ${isWeekend ? 'weekend day' : 'weekday'}`
        : 'Weekend baseline';
  }
}

/* ------------------------------------------------------------------ */
/* 4. Weather sensitivity bars                                         */
/* ------------------------------------------------------------------ */

function renderSensitivity() {
  const el = $('chart-weather-sensitivity');
  if (!el) return;

  const active = state.weather;
  const live = state.sensitivity;

  let rows;
  if (live && WEATHER_VARIANTS.every((weather) => Number.isFinite(live[weather]))) {
    const maxV = Math.max(...WEATHER_VARIANTS.map((weather) => live[weather]));
    const baseV = live.Clear || maxV;

    rows = WEATHER_VARIANTS.map((weather) => ({
      label: weather,
      readout: `${live[weather].toLocaleString()} vph · ${(live[weather] / baseV).toFixed(2)}x`,
      widthPct: Math.max(8, Math.round((live[weather] / maxV) * 100)),
      isActive: weather === active
    }));
  } else {
    const maxMult = Math.max(...WEATHER_VARIANTS.map((weather) => REFERENCE_WEATHER_MULT[weather]));

    rows = WEATHER_VARIANTS.map((weather) => ({
      label: weather,
      readout: `${REFERENCE_WEATHER_MULT[weather].toFixed(2)}x`,
      widthPct: Math.max(8, Math.round((REFERENCE_WEATHER_MULT[weather] / maxMult) * 100)),
      isActive: weather === active
    }));
  }

  el.innerHTML = `<div class="flex flex-col justify-center gap-2 h-full">${rows
    .map(
      (row) => `
    <div>
      <div class="flex justify-between gap-2 font-label-sm text-label-sm mb-1 ${row.isActive ? 'text-primary' : 'text-on-surface-variant'}">
        <span class="truncate">${row.isActive ? '&#9656; ' : ''}${row.label}</span>
        <span class="font-mono shrink-0">${row.readout}</span>
      </div>
      <div class="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
        <div class="h-full rounded-full ${row.isActive ? 'theme-transition' : 'bg-on-surface-variant/30'}" style="width:${row.widthPct}%; ${row.isActive ? 'background-color: var(--accent-current);' : ''}"></div>
      </div>
    </div>`
    )
    .join('')}</div>`;

  const note = $('chart-sensitivity-note');
  if (note) {
    note.textContent = live ? 'Live model · 4 weather runs' : 'Reference pattern';
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function initAnalyticsCharts() {
  renderDailyCurve();
  renderHourlyBars();
  renderGauge();
  renderSensitivity();
}

export function updateAnalyticsCharts({ hour, volume, dayOfWeek, weather }) {
  if (Number.isFinite(hour)) state.hour = clamp(Math.round(hour), 0, 23);
  if (Number.isFinite(volume)) state.volume = volume;
  if (Number.isFinite(dayOfWeek)) state.dayOfWeek = dayOfWeek;
  if (typeof weather === 'string' && weather) state.weather = weather;

  // Any new prediction invalidates the previous live comparison run
  state.sensitivity = null;

  initAnalyticsCharts();
}

export function setWeatherSensitivity(volumes, weather) {
  if (typeof weather === 'string' && weather) state.weather = weather;
  state.sensitivity =
    volumes && WEATHER_VARIANTS.every((variant) => Number.isFinite(volumes[variant]))
      ? volumes
      : null;

  renderSensitivity();
}
