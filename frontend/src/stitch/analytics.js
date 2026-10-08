/**
 * Analytics view — every series is REAL model output.
 *
 *  - 24-hour profile: 24 sequential POST /api/predict runs (one per hour of
 *    the selected day), token-guarded, cancellable, cached per scenario.
 *  - Operating-state donut: the sweep classified into the calibrated bands.
 *  - Weather sensitivity: 4 real runs (Clear / Clouds / Rain / Snow).
 *  - Input echo: the exact JSON payload sent on the last prediction.
 *
 * The reference curve is clearly labelled as the 2019 dataset mean —
 * never presented as a prediction.
 */

import { buildPayload, predictTraffic } from './client.js';
import {
  BANDS,
  CHART_MAX_VPH,
  REFERENCE_2019,
  classifyVolume,
  deriveWeatherLabel,
  WEATHER_VARIANTS
} from './severity.js';

const W = 960;
const H = 300;
const PAD = { left: 52, right: 16, top: 16, bottom: 34 };

const state = {
  scenario: null,          // last real prediction scenario (from event)
  sweep: null,             // { key, volumes[24] }
  weather: null,           // { volumes: {Clear,...}, active }
  sweepToken: 0,
  weatherToken: 0,
  running: false,
  cache: new Map()
};

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* View template (Stitch analytics screen structure)                   */
/* ------------------------------------------------------------------ */

const TEMPLATE = `
<div class="flex flex-col w-full gap-space-lg">
  <!-- Top Telemetry Ribbon -->
  <div class="relative w-full rounded-xl bg-surface-container-low/85 backdrop-blur-2xl p-space-md shadow-xl overflow-hidden">
    <div class="absolute -right-20 -top-20 w-80 h-80 bg-primary-container/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md relative z-10">
      <div class="flex flex-wrap items-center gap-space-md">
        <div class="flex items-center gap-space-sm bg-surface-container-lowest/80 px-space-md py-space-sm rounded-lg">
          <span class="material-symbols-outlined text-primary-container text-[20px]" style="font-variation-settings: 'FILL' 1;">sensors</span>
          <div class="flex flex-col">
            <span class="font-headline-sm text-headline-sm text-primary-fixed tracking-tight" id="an-scenario-title">Awaiting scenario</span>
            <span class="font-label-md text-label-md text-on-surface-variant" id="an-scenario-sub">Run a prediction on the Dashboard first</span>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-space-sm">
        <div class="bg-surface-container-highest/60 backdrop-blur-md px-space-md py-space-xs rounded-lg flex flex-col min-w-[130px]">
          <span class="font-label-sm text-label-sm text-on-surface-variant uppercase">Focus prediction</span>
          <div class="flex items-baseline gap-1 mt-0.5">
            <span class="font-headline-md text-headline-md text-primary-fixed" id="an-focus-value">—</span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">veh/h</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Main Analytics Grid -->
  <div class="grid grid-cols-1 xl:grid-cols-12 gap-space-lg">

    <!-- SECTION A: 24-Hour Profile Curve -->
    <div class="xl:col-span-12 rounded-xl bg-surface-container-low/70 backdrop-blur-2xl p-space-lg shadow-xl relative overflow-hidden">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-space-sm mb-space-md">
        <div>
          <div class="flex items-center gap-space-xs">
            <span class="font-label-sm text-label-sm text-primary-container tracking-wider uppercase">CHRONO-TELEMETRY</span>
            <span class="w-1.5 h-1.5 rounded-full bg-primary-container"></span>
            <span class="font-label-sm text-label-sm text-on-surface-variant" id="an-curve-meta">24 real model runs</span>
          </div>
          <h2 class="font-headline-lg text-headline-lg text-on-surface mt-0.5">24-Hour Predicted Traffic Profile</h2>
        </div>
        <div class="flex flex-wrap items-center gap-space-md">
          <div class="flex items-center gap-space-xs">
            <span class="w-3 h-1 rounded-full bg-primary-container shadow-[0_0_8px_#00f0ff]"></span>
            <span class="font-label-md text-label-md text-on-surface">Predicted — LightGBM V2</span>
          </div>
          <div class="flex items-center gap-space-xs">
            <span class="w-3 h-1 rounded-full bg-secondary-container"></span>
            <span class="font-label-md text-label-md text-on-surface-variant">Reference · 2019 dataset mean</span>
          </div>
        </div>
      </div>
      <div class="w-full relative bg-surface-container-lowest/70 rounded-xl p-space-md overflow-x-auto">
        <div class="min-w-[720px] h-[320px] relative" id="an-curve"></div>
      </div>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm mt-space-md">
        <span class="font-label-md text-label-md text-on-surface-variant" id="an-curve-note">Reference pattern only — run the profile for real predictions.</span>
        <div class="flex items-center gap-space-sm">
          <div class="hidden flex-col min-w-[180px]" id="an-progress-wrap">
            <div class="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
              <div class="h-full rounded-full bg-primary-container shadow-[0_0_8px_rgba(0,240,255,0.6)] transition-all duration-200" id="an-progress-fill" style="width:0%"></div>
            </div>
            <span class="font-label-sm text-label-sm text-on-surface-variant mt-1" id="an-progress-text">0 / 24 runs</span>
          </div>
          <button type="button" id="btn-run-sweep"
            class="px-space-md py-2 rounded-lg bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold shadow-[0_0_16px_rgba(0,240,255,0.35)] hover:shadow-[0_0_24px_rgba(0,240,255,0.6)] transition-all active:scale-[0.98] flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">play_arrow</span> RUN 24-H PROFILE
          </button>
          <button type="button" id="btn-cancel-sweep"
            class="hidden px-space-md py-2 rounded-lg bg-surface-container-highest text-on-surface font-label-md text-label-md transition-all active:scale-[0.98] flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[16px]">stop_circle</span> CANCEL
          </button>
        </div>
      </div>
    </div>

    <!-- SECTION B: Operating State Distribution (from the sweep) -->
    <div class="xl:col-span-4 rounded-xl bg-surface-container-low/75 backdrop-blur-xl p-space-lg shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between">
          <span class="font-label-sm text-label-sm text-primary-container uppercase tracking-wider">VOLUME SEGMENTATION</span>
          <span class="bg-surface-container-highest px-space-xs py-0.5 rounded font-label-sm text-label-sm text-on-surface-variant">24H SWEEP</span>
        </div>
        <h3 class="font-headline-sm text-headline-sm text-on-surface mt-1">Operating State Distribution</h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">The 24 real predictions classified into calibrated volume bands.</p>
        <div class="my-space-md flex items-center justify-center relative">
          <div id="an-donut"></div>
          <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span class="font-label-sm text-label-sm text-on-surface-variant uppercase">Sweep Span</span>
            <span class="font-headline-lg text-headline-lg text-on-surface font-bold" id="an-donut-center-value">24.0<span class="text-headline-sm text-on-surface-variant">h</span></span>
            <span class="font-label-sm text-label-sm text-primary-container">4 volume bands</span>
          </div>
        </div>
        <div class="space-y-space-sm mt-space-sm" id="an-donut-rows"></div>
      </div>
    </div>

    <!-- SECTION C: Weather Sensitivity (4 real runs) -->
    <div class="xl:col-span-5 rounded-xl bg-surface-container-low/75 backdrop-blur-xl p-space-lg shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between">
          <span class="font-label-sm text-label-sm text-primary-container uppercase tracking-wider">WEATHER SENSITIVITY</span>
          <span class="bg-surface-container-highest px-space-xs py-0.5 rounded font-label-sm text-label-sm text-on-surface-variant">4 REAL RUNS</span>
        </div>
        <h3 class="font-headline-sm text-headline-sm text-on-surface mt-1">Scenario Comparison at Focus Hour</h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">The model re-run on your scenario under four weather inputs.</p>
        <div class="flex flex-col justify-center gap-2 mt-space-md" id="an-weather"></div>
        <span class="font-label-sm text-label-sm text-on-surface-variant block mt-space-sm" id="an-weather-note">Runs automatically after each prediction.</span>
      </div>
    </div>

    <!-- SECTION D: Exact payload echo -->
    <div class="xl:col-span-3 rounded-xl bg-surface-container-low/75 backdrop-blur-xl p-space-lg shadow-xl flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between">
          <span class="font-label-sm text-label-sm text-primary-container uppercase tracking-wider">TRANSPARENCY</span>
          <span class="bg-surface-container-highest px-space-xs py-0.5 rounded font-label-sm text-label-sm text-on-surface-variant">LAST REQUEST</span>
        </div>
        <h3 class="font-headline-sm text-headline-sm text-on-surface mt-1">Exact Payload Sent</h3>
        <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">The real JSON body delivered to POST /api/predict.</p>
        <pre class="mt-space-md p-space-sm rounded-lg bg-surface-container-lowest/90 font-label-sm text-label-sm text-primary-fixed overflow-x-auto whitespace-pre-wrap" id="an-echo">Awaiting first prediction…</pre>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div class="fixed bottom-6 right-6 z-50 transform transition-all duration-300 pointer-events-none rounded-xl bg-surface-container-high/95 backdrop-blur-2xl p-space-md shadow-2xl flex items-center gap-space-md max-w-md translate-y-24 opacity-0" id="an-toast">
    <div class="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center flex-shrink-0">
      <span class="material-symbols-outlined text-primary-container text-[18px]" id="an-toast-icon">check_circle</span>
    </div>
    <div class="flex flex-col min-w-0">
      <span class="font-headline-sm text-[14px] text-on-surface" id="an-toast-title"></span>
      <span class="font-body-sm text-body-sm text-on-surface-variant truncate" id="an-toast-msg"></span>
    </div>
  </div>
</div>`;

let toastTimeout = null;

function showToast(title, msg, isError = false) {
  const toast = $('an-toast');
  if (!toast) return;

  const icon = $('an-toast-icon');
  if (icon) {
    icon.textContent = isError ? 'report_problem' : 'check_circle';
    icon.style.color = '';
    icon.classList.toggle('status-text-error', isError);
  }

  $('an-toast-title').textContent = title;
  $('an-toast-msg').textContent = msg;
  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-24', 'opacity-0');
  }, 3600);
}

/* ------------------------------------------------------------------ */
/* 24-hour sweep engine                                                */
/* ------------------------------------------------------------------ */

function scenarioCacheKey(scenario) {
  return [
    scenario.latitude,
    scenario.longitude,
    scenario.date,
    scenario.temperature,
    scenario.rain,
    scenario.snow,
    scenario.cloudiness
  ].join('|');
}

function setSweepRunning(running) {
  state.running = running;
  $('btn-run-sweep')?.classList.toggle('hidden', running);
  $('btn-cancel-sweep')?.classList.toggle('hidden', !running);
  $('an-progress-wrap')?.classList.toggle('hidden', !running);
  if (!running) {
    const fill = $('an-progress-fill');
    if (fill) fill.style.width = '0%';
  }
}

export async function runSweep() {
  if (state.running) return;
  if (!state.scenario) {
    showToast('No scenario yet', 'Run a prediction on the Dashboard first.', true);
    return;
  }

  const token = ++state.sweepToken;
  const scenario = state.scenario;
  const cacheKey = scenarioCacheKey(scenario);

  const cached = state.cache.get(cacheKey);
  if (cached) {
    state.sweep = { key: cacheKey, volumes: cached };
    renderCurve();
    renderDonut();
    showToast('Cached profile', '24-h profile restored for this exact scenario.');
    return;
  }

  setSweepRunning(true);
  const volumes = [];

  try {
    for (let hour = 0; hour < 24; hour += 1) {
      if (token !== state.sweepToken) return; // cancelled

      const hh = String(hour).padStart(2, '0');
      const response = await predictTraffic({
        latitude: scenario.latitude,
        longitude: scenario.longitude,
        date: scenario.date,
        time: `${hh}:00`,
        day_type: scenario.dayType,
        temperature: scenario.temperature,
        rain: scenario.rain,
        snow: scenario.snow,
        cloudiness: scenario.cloudiness
      });

      if (token !== state.sweepToken) return;

      const value = Number(response.prediction);
      if (!Number.isFinite(value)) {
        throw new Error(`Unexpected response at ${hh}:00`);
      }

      volumes.push(value);

      const fill = $('an-progress-fill');
      const text = $('an-progress-text');
      if (fill) fill.style.width = `${Math.round(((hour + 1) / 24) * 100)}%`;
      if (text) text.textContent = `${hour + 1} / 24 runs`;
    }

    state.cache.set(cacheKey, volumes);
    state.sweep = { key: cacheKey, volumes };
    renderCurve();
    renderDonut();
    showToast(
      '24-h profile complete',
      `24 real LightGBM V2 runs · sensor #${scenario.sensor.sensor_id}.`
    );

  } catch (error) {
    if (token === state.sweepToken) {
      console.warn('Sweep failed:', error);
      showToast('Profile interrupted', error.message || 'A real model run failed.', true);
    }
  } finally {
    if (token === state.sweepToken) {
      setSweepRunning(false);
    }
  }
}

function cancelSweep() {
  state.sweepToken += 1;
  setSweepRunning(false);
  showToast('Profile cancelled', 'No further model runs were issued.');
}

/* ------------------------------------------------------------------ */
/* Curve rendering                                                     */
/* ------------------------------------------------------------------ */

function xFor(hour) {
  return PAD.left + (hour / 23) * (W - PAD.left - PAD.right);
}

function yFor(volume) {
  const top = PAD.top;
  const bottom = H - PAD.bottom;
  return bottom - (Math.min(volume, CHART_MAX_VPH) / CHART_MAX_VPH) * (bottom - top);
}

function linePath(values) {
  return values
    .map((value, hour) => `${hour === 0 ? 'M' : 'L'} ${xFor(hour).toFixed(1)} ${yFor(value).toFixed(1)}`)
    .join(' ');
}

function renderCurve() {
  const host = $('an-curve');
  if (!host) return;

  const scenario = state.scenario;
  const isWeekend = scenario
    ? scenario.dayType === 'Weekend'
    : false;
  const reference = isWeekend ? REFERENCE_2019.weekend : REFERENCE_2019.weekday;
  const sweep = state.sweep ? state.sweep.volumes : null;

  const gridLines = [0, 250, 500, 750, 1000]
    .map((v) => `
      <line x1="${PAD.left}" x2="${W - PAD.right}" y1="${yFor(v)}" y2="${yFor(v)}"
        style="stroke:var(--it-svg-grid)" stroke-dasharray="3 4" stroke-width="1"></line>
      <text x="${PAD.left - 8}" y="${yFor(v) + 3}" text-anchor="end"
        class="font-label-sm" style="fill:var(--it-svg-muted)" font-size="9">${v.toLocaleString('en-US')}</text>`)
    .join('');

  const xLabels = [0, 3, 6, 9, 12, 15, 18, 21, 23]
    .map((hour) => {
      const focus = scenario ? parseInt(scenario.time.split(':')[0], 10) : -1;
      const isFocus = hour === focus;
      return `<text x="${xFor(hour)}" y="${H - 10}" text-anchor="middle"
        class="font-label-md" style="fill:var(${isFocus ? '--it-svg-accent' : '--it-svg-muted'})" font-size="10"
        ${isFocus ? 'font-weight="600"' : ''}>${String(hour).padStart(2, '0')}:00${isFocus ? ' (FOCUS)' : ''}</text>`;
    })
    .join('');

  const refPath = linePath(reference);
  const refArea = `${refPath} L ${xFor(23)} ${yFor(0)} L ${xFor(0)} ${yFor(0)} Z`;

  let predictedMarkup = '';
  let focusMarkup = '';

  if (sweep) {
    const predPath = linePath(sweep);
    const predArea = `${predPath} L ${xFor(23)} ${yFor(0)} L ${xFor(0)} ${yFor(0)} Z`;

    predictedMarkup = `
      <path d="${predArea}" fill="url(#an-cyan-area)"></path>
      <path d="${predPath}" fill="none" filter="url(#an-cyan-glow)"
        style="stroke:var(--it-svg-accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>`;

    const focusHour = scenario ? parseInt(scenario.time.split(':')[0], 10) : 0;
    const focusValue = Math.round(sweep[focusHour] ?? 0);
    const bandKey = classifyVolume(focusValue);
    const band = BANDS[bandKey];
    const px = xFor(focusHour);
    const py = yFor(sweep[focusHour] ?? 0);
    const boxX = Math.max(PAD.left, Math.min(px - 85, W - PAD.right - 170));

    focusMarkup = `
      <line x1="${px}" x2="${px}" y1="${py}" y2="${yFor(0)}"
        style="stroke:var(--it-svg-accent)" stroke-dasharray="2 3" stroke-width="1.2" opacity="0.7"></line>
      <circle cx="${px}" cy="${py}" r="12" style="fill:var(--it-svg-accent)" opacity="0.22">
        <animate attributeName="r" dur="2.2s" repeatCount="indefinite" values="7;16;7"></animate>
        <animate attributeName="opacity" dur="2.2s" repeatCount="indefinite" values="0.4;0.05;0.4"></animate>
      </circle>
      <circle cx="${px}" cy="${py}" r="4.5" fill="#ffffff" style="stroke:var(--it-svg-accent)" stroke-width="2.4"></circle>
      <g transform="translate(${boxX}, ${Math.max(2, py - 62)})">
        <rect width="170" height="44" rx="6" style="fill:var(--it-svg-panel);stroke:var(--it-svg-accent)" fill-opacity="0.95" stroke-width="1"></rect>
        <text x="10" y="17" class="font-label-sm" style="fill:var(--it-svg-panel-cyan)" font-size="9" letter-spacing="1">PREDICTED · ${String(focusHour).padStart(2, '0')}:00</text>
        <text x="10" y="35" class="font-label-md" style="fill:var(--it-svg-panel-strong)" font-size="13" font-weight="600">${focusValue.toLocaleString('en-US')} veh/h
          <tspan fill="${band.color}">${band.label.toUpperCase()}</tspan></text>
      </g>`;
  }

  host.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="w-full h-full overflow-visible">
    <defs>
      <linearGradient id="an-cyan-area" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" style="stop-color:var(--it-svg-accent)" stop-opacity="0.30"></stop>
        <stop offset="90%" style="stop-color:var(--it-svg-accent)" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="an-blue-area" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" style="stop-color:var(--it-svg-secondary)" stop-opacity="0.16"></stop>
        <stop offset="100%" style="stop-color:var(--it-svg-secondary)" stop-opacity="0"></stop>
      </linearGradient>
      <filter id="an-cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur result="blur" stdDeviation="3"></feGaussianBlur>
        <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
      </filter>
    </defs>
    ${gridLines}
    <text x="${PAD.left - 8}" y="${PAD.top - 4}" text-anchor="end" style="fill:var(--it-svg-muted)" font-size="9" class="font-label-sm">veh/h</text>
    ${xLabels}
    <path d="${refArea}" fill="url(#an-blue-area)"></path>
    <path d="${refPath}" fill="none" style="stroke:var(--it-svg-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 0"></path>
    ${predictedMarkup}
    ${focusMarkup}
  </svg>`;

  const note = $('an-curve-note');
  if (note) {
    note.textContent = sweep && scenario
      ? `24 real model runs · ${scenario.shortName} · sensor #${scenario.sensor.sensor_id} · ${scenario.date} · ${deriveWeatherLabel(scenario.rain, scenario.snow, scenario.cloudiness)} inputs.`
      : 'Reference pattern only (2019 dataset mean) — run the profile for real predictions.';
  }

  const meta = $('an-curve-meta');
  if (meta) {
    meta.textContent = sweep ? '24 real runs complete' : '24 real model runs';
  }
}

/* ------------------------------------------------------------------ */
/* Donut rendering (from the sweep)                                    */
/* ------------------------------------------------------------------ */

function renderDonut() {
  const host = $('an-donut');
  const rows = $('an-donut-rows');
  if (!host || !rows) return;

  const sweep = state.sweep ? state.sweep.volumes : null;
  const circumference = 2 * Math.PI * 48;

  if (!sweep) {
    host.innerHTML = `
      <svg class="w-48 h-48 -rotate-90 transform" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="48" fill="transparent" style="stroke:var(--it-svg-track)" stroke-width="12"></circle>
      </svg>`;
    rows.innerHTML = BAND_ORDER.map((key) => {
      const band = BANDS[key];
      const range = key === 'low'
        ? `&lt; ${band.max} veh/h`
        : key === 'severe'
          ? `&gt; ${band.min} veh/h`
          : `${band.min} – ${band.max} veh/h`;
      return `
        <div class="bg-surface-container-highest/40 p-space-sm rounded-lg flex items-center justify-between opacity-50">
          <div class="flex items-center gap-space-sm">
            <span class="w-2.5 h-2.5 rounded-full" style="background:${band.color}"></span>
            <div class="flex flex-col">
              <span class="font-body-md text-body-md text-on-surface font-medium">${band.label}</span>
              <span class="font-label-sm text-label-sm text-on-surface-variant">${range}</span>
            </div>
          </div>
          <div class="text-right">
            <span class="font-label-lg text-label-lg text-on-surface-variant font-semibold">—</span>
            <div class="font-label-sm text-label-sm text-on-surface-variant">run profile</div>
          </div>
        </div>`;
    }).join('');
    return;
  }

  const counts = BAND_ORDER.map((key) => ({
    key,
    band: BANDS[key],
    hours: sweep.filter((v) => classifyVolume(v) === key).length
  }));

  let offset = 0;
  const segments = counts
    .filter((entry) => entry.hours > 0)
    .map((entry) => {
      const dash = (entry.hours / 24) * circumference;
      const markup =
        `<circle cx="60" cy="60" r="48" fill="transparent" stroke="${entry.band.color}"
          stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}" stroke-width="12"></circle>`;
      offset += dash;
      return markup;
    })
    .join('');

  host.innerHTML = `
    <svg class="w-48 h-48 -rotate-90 transform" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="48" fill="transparent" style="stroke:var(--it-svg-track)" stroke-width="12"></circle>
      ${segments}
    </svg>`;

  rows.innerHTML = counts.map((entry) => {
    const band = entry.band;
    const range = entry.key === 'low'
      ? `&lt; ${band.max} veh/h`
      : entry.key === 'severe'
        ? `&gt; ${band.min} veh/h`
        : `${band.min} – ${band.max} veh/h`;
    const pct = Math.round((entry.hours / 24) * 100);
    return `
      <div class="bg-surface-container-highest/40 p-space-sm rounded-lg flex items-center justify-between">
        <div class="flex items-center gap-space-sm">
          <span class="w-2.5 h-2.5 rounded-full" style="background:${band.color}"></span>
          <div class="flex flex-col">
            <span class="font-body-md text-body-md text-on-surface font-medium">${band.label}</span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">${range}</span>
          </div>
        </div>
        <div class="text-right">
          <span class="font-label-lg text-label-lg font-semibold" style="color:${band.color}">${pct}%</span>
          <div class="font-label-sm text-label-sm text-on-surface-variant">${entry.hours} h</div>
        </div>
      </div>`;
  }).join('');
}

const BAND_ORDER = ['low', 'moderate', 'heavy', 'severe'];

/* ------------------------------------------------------------------ */
/* Weather sensitivity — 4 real runs                                   */
/* ------------------------------------------------------------------ */

async function runWeatherSensitivity(scenario) {
  const token = ++state.weatherToken;
  const volumes = {};

  try {
    for (const variant of WEATHER_VARIANTS) {
      const response = await predictTraffic({
        latitude: scenario.latitude,
        longitude: scenario.longitude,
        date: scenario.date,
        time: scenario.time,
        day_type: scenario.dayType,
        temperature: scenario.temperature,
        rain: variant.rain,
        snow: variant.snow,
        cloudiness: variant.cloudiness
      });

      if (token !== state.weatherToken) return;

      const value = Number(response.prediction);
      if (!Number.isFinite(value)) throw new Error('Unexpected weather run response');

      volumes[variant.label] = value;
    }

    if (token === state.weatherToken) {
      state.weather = {
        volumes,
        active: deriveWeatherLabel(scenario.rain, scenario.snow, scenario.cloudiness)
      };
      renderWeather();
    }
  } catch (error) {
    if (token === state.weatherToken) {
      console.warn('Weather sensitivity unavailable:', error);
      state.weather = null;
      renderWeather();
      const note = $('an-weather-note');
      if (note) note.textContent = 'Weather comparison unavailable — a real run failed.';
    }
  }
}

function renderWeather() {
  const host = $('an-weather');
  if (!host) return;

  const live = state.weather;

  if (!live) {
    host.innerHTML =
      `<div class="p-space-sm rounded-lg bg-surface-container-lowest/70 font-label-md text-label-md text-on-surface-variant text-center">` +
      `Awaiting the first prediction — four real model runs will populate this card.</div>`;
    return;
  }

  const maxV = Math.max(...WEATHER_VARIANTS.map((variant) => live.volumes[variant.label]));
  const baseV = live.volumes.Clear || maxV;

  host.innerHTML = WEATHER_VARIANTS.map((variant) => {
    const value = live.volumes[variant.label];
    const isActive = variant.label === live.active;
    return `
    <div>
      <div class="flex justify-between gap-2 font-label-md text-label-md mb-1 ${isActive ? 'text-primary' : 'text-on-surface-variant'}">
        <span class="truncate">${isActive ? '&#9656; ' : ''}${variant.label}${isActive ? ' (your inputs)' : ''}</span>
        <span class="font-mono shrink-0">${Math.round(value).toLocaleString('en-US')} vph · ${(value / baseV).toFixed(2)}x vs Clear</span>
      </div>
      <div class="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all duration-500"
          style="width:${Math.max(8, Math.round((value / maxV) * 100))}%;
                 background:${isActive ? 'var(--accent-current, #00f0ff)' : 'rgba(185, 202, 203, 0.35)'}"></div>
      </div>
    </div>`;
  }).join('');

  const note = $('an-weather-note');
  if (note) note.textContent = 'Live model · 4 real weather runs at the focus hour.';
}

/* ------------------------------------------------------------------ */
/* Prediction event                                                    */
/* ------------------------------------------------------------------ */

function onPrediction({ scenario, response }) {
  state.scenario = scenario;
  state.sweep = null; // new scenario invalidates the previous sweep

  $('an-scenario-title').textContent = `${scenario.shortName} · #${scenario.sensor.sensor_id}`;
  $('an-scenario-sub').textContent =
    `${scenario.sensor.freeway} ${scenario.sensor.direction} · ${Number(scenario.sensor.distance_km).toFixed(2)} km · ${scenario.date}`;
  $('an-focus-value').textContent = scenario.volume.toLocaleString('en-US');

  $('an-echo').textContent = JSON.stringify(response.sent_payload, null, 2);

  renderCurve();
  renderDonut();
  renderWeather();

  runWeatherSensitivity(scenario);
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

export function initAnalytics(containerId) {
  const container = $(containerId);
  if (!container) return;

  container.innerHTML = TEMPLATE;

  $('btn-run-sweep')?.addEventListener('click', runSweep);
  $('btn-cancel-sweep')?.addEventListener('click', cancelSweep);

  renderCurve();
  renderDonut();
  renderWeather();

  window.addEventListener('it:prediction', (event) => onPrediction(event.detail || {}));
}
