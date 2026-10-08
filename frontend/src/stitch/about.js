/**
 * About view — verified project/model facts only.
 *
 * Performance metrics below are the ACTUAL output of
 * `scripts/validate_lightgbm_v2.py` (LightGBM V2 holdout evaluation on the
 * Oct–Dec 2021 feature batches, 18,865,436 sensor-hour rows):
 *   MAE 14.0522 · RMSE 22.6435 · R² 0.9819
 * Model facts (500 trees, 20 features) come from the trained booster at
 * models/traffic_lightgbm_v2.txt. Nothing on this screen is invented.
 */

const VALIDATION = {
  mae: 14.0522,
  rmse: 22.6435,
  r2: 0.9819,
  rows: '18,865,436',
  window: 'Oct – Dec 2021 holdout',
  source: 'scripts/validate_lightgbm_v2.py'
};

const TEMPLATE = `
<div class="flex flex-col w-full gap-space-lg">

  <!-- HERO -->
  <section class="relative rounded-xl bg-surface-container-low/80 backdrop-blur-2xl p-space-lg shadow-xl overflow-hidden">
    <div class="absolute -top-24 -right-16 w-96 h-96 bg-primary-container/10 rounded-full blur-[110px] pointer-events-none"></div>
    <div class="relative z-10 flex flex-col gap-space-md">
      <div class="flex items-center gap-space-xs">
        <span class="font-label-sm text-label-sm text-primary-container tracking-wider uppercase">SYSTEM ARCHITECTURE</span>
        <span class="w-1.5 h-1.5 rounded-full bg-primary-container"></span>
        <span class="font-label-sm text-label-sm text-on-surface-variant">Verified facts only</span>
      </div>
      <h1 class="font-headline-lg text-headline-lg text-on-surface tracking-tight max-w-3xl">
        IntelliTraffic — LightGBM V2 Traffic Prediction for California PeMS Sensors
      </h1>
      <p class="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
        A gradient-boosted regression model served through FastAPI. Given a location,
        time, day type and weather, the backend maps the request to the nearest real
        PeMS sensor, assembles 169 hours of its measured history into 20 engineered
        features and returns the predicted hourly vehicle flow.
      </p>
      <div class="flex flex-wrap items-center gap-space-sm mt-1">
        <span class="px-space-sm py-1 rounded-lg bg-surface-container-highest/70 font-label-md text-label-md text-primary-fixed">LightGBM V2 · 500 trees</span>
        <span class="px-space-sm py-1 rounded-lg bg-surface-container-highest/70 font-label-md text-label-md text-primary-fixed">20 model features</span>
        <span class="px-space-sm py-1 rounded-lg bg-surface-container-highest/70 font-label-md text-label-md text-primary-fixed">R² 0.9819 (validated)</span>
        <span class="px-space-sm py-1 rounded-lg bg-surface-container-highest/70 font-label-md text-label-md text-primary-fixed">8,607 PeMS sensors</span>
      </div>
      <div class="flex flex-wrap items-center gap-space-sm mt-space-sm">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
          class="px-space-md py-2 rounded-lg bg-surface-container-highest text-on-surface font-headline-sm text-label-lg transition-all active:scale-[0.98] flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[16px]">map</span> MAP DATA · OSM
        </a>
      </div>
    </div>
  </section>

  <!-- VALIDATED METRICS -->
  <section class="rounded-xl bg-surface-container-low/80 backdrop-blur-xl p-space-lg shadow-xl">
    <div class="flex flex-wrap items-center justify-between gap-space-sm mb-space-md">
      <div class="flex flex-col">
        <span class="font-label-sm text-label-sm text-primary-container uppercase tracking-wider">HOLDOUT EVALUATION</span>
        <h2 class="font-headline-md text-headline-md text-on-surface">Validation Performance</h2>
      </div>
      <span class="px-2 py-0.5 rounded bg-surface-container-highest font-label-sm text-label-sm text-on-surface-variant">${VALIDATION.window} · ${VALIDATION.rows} rows</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
      <div class="p-space-md rounded-lg bg-surface-container-lowest relative overflow-hidden">
        <div class="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary-container/40 to-transparent"></div>
        <span class="font-label-sm text-label-sm text-on-surface-variant uppercase block">MAE</span>
        <span class="font-headline-lg text-headline-lg text-primary-fixed font-bold">14.05 <span class="font-label-md text-label-md text-on-surface-variant">veh/h</span></span>
        <span class="font-label-sm text-label-sm text-on-surface-variant block mt-1">Mean absolute error of hourly flow predictions.</span>
      </div>
      <div class="p-space-md rounded-lg bg-surface-container-lowest relative overflow-hidden">
        <div class="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-secondary/50 to-transparent"></div>
        <span class="font-label-sm text-label-sm text-on-surface-variant uppercase block">RMSE</span>
        <span class="font-headline-lg text-headline-lg text-primary-fixed font-bold">22.64 <span class="font-label-md text-label-md text-on-surface-variant">veh/h</span></span>
        <span class="font-label-sm text-label-sm text-on-surface-variant block mt-1">Root mean squared error on the same holdout.</span>
      </div>
      <div class="p-space-md rounded-lg bg-surface-container-lowest relative overflow-hidden">
        <div class="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-error/50 to-transparent"></div>
        <span class="font-label-sm text-label-sm text-on-surface-variant uppercase block">R²</span>
        <span class="font-headline-lg text-headline-lg text-primary-fixed font-bold">0.9819</span>
        <span class="font-label-sm text-label-sm text-on-surface-variant block mt-1">Coefficient of determination — variance explained.</span>
      </div>
    </div>
    <p class="font-label-sm text-label-sm text-on-surface-variant mt-space-sm">
      Source: <span class="text-primary-fixed">${VALIDATION.source}</span> — exact values MAE 14.0522 · RMSE 22.6435 · R² 0.9819.
    </p>
  </section>

  <!-- ARCHITECTURE PILLARS -->
  <section class="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
    <div class="rounded-xl bg-surface-container-low/80 backdrop-blur-xl p-space-lg shadow-xl flex flex-col gap-space-sm">
      <div class="w-9 h-9 rounded-lg bg-primary-container/15 flex items-center justify-center">
        <span class="material-symbols-outlined text-primary-container text-[20px]">model_training</span>
      </div>
      <h3 class="font-headline-sm text-headline-sm text-on-surface">Prediction Engine</h3>
      <p class="font-body-md text-body-md text-on-surface-variant">
        LightGBM V2 gradient-boosted trees (500 trees, 20 features): traffic lags at 1/2/3/24/168 h,
        rolling means over 3 h and 24 h, calendar context and live weather inputs.
      </p>
    </div>
    <div class="rounded-xl bg-surface-container-low/80 backdrop-blur-xl p-space-lg shadow-xl flex flex-col gap-space-sm">
      <div class="w-9 h-9 rounded-lg bg-secondary-container/25 flex items-center justify-center">
        <span class="material-symbols-outlined text-secondary text-[20px]">share_location</span>
      </div>
      <h3 class="font-headline-sm text-headline-sm text-on-surface">Geospatial Matching</h3>
      <p class="font-body-md text-body-md text-on-surface-variant">
        The requested location is matched to the nearest of 8,607 California PeMS sensors
        (haversine distance); that sensor's real measured history drives the prediction.
      </p>
    </div>
    <div class="rounded-xl bg-surface-container-low/80 backdrop-blur-xl p-space-lg shadow-xl flex flex-col gap-space-sm">
      <div class="w-9 h-9 rounded-lg bg-error-container/40 flex items-center justify-center">
        <span class="material-symbols-outlined text-error text-[20px]">bolt</span>
      </div>
      <h3 class="font-headline-sm text-headline-sm text-on-surface">Serving Layer</h3>
      <p class="font-body-md text-body-md text-on-surface-variant">
        FastAPI exposes POST /predict and POST /traffic-map (8-field contract) and GET / (health). Each call
        pulls exactly 169 hourly records before the target timestamp — no synthetic data.
      </p>
    </div>
  </section>

  <!-- PIPELINE -->
  <section class="rounded-xl bg-surface-container-low/80 backdrop-blur-xl p-space-lg shadow-xl">
    <span class="font-label-sm text-label-sm text-primary-container uppercase tracking-wider">INFERENCE PIPELINE</span>
    <h2 class="font-headline-md text-headline-md text-on-surface mb-space-md">From Query To Prediction</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
      <div class="relative p-space-md rounded-lg bg-surface-container-lowest flex flex-col gap-1">
        <span class="font-label-lg text-label-lg text-primary-container">01</span>
        <span class="font-label-md text-label-md text-on-surface font-semibold uppercase">Location Resolve</span>
        <span class="font-body-sm text-body-sm text-on-surface-variant">Nominatim geocoding or GPS / map pin → real latitude &amp; longitude.</span>
      </div>
      <div class="relative p-space-md rounded-lg bg-surface-container-lowest flex flex-col gap-1">
        <span class="font-label-lg text-label-lg text-primary-container">02</span>
        <span class="font-label-md text-label-md text-on-surface font-semibold uppercase">Sensor Mapping</span>
        <span class="font-body-sm text-body-sm text-on-surface-variant">Nearest PeMS sensor chosen; distance, district, freeway and lanes returned.</span>
      </div>
      <div class="relative p-space-md rounded-lg bg-surface-container-lowest flex flex-col gap-1">
        <span class="font-label-lg text-label-lg text-primary-container">03</span>
        <span class="font-label-md text-label-md text-on-surface font-semibold uppercase">History Window</span>
        <span class="font-body-sm text-body-sm text-on-surface-variant">169 measured hourly records before the target time build the lag features. For 2026–2030 targets, the matching real 2017–2021 hour is used (2026→2017 … 2030→2021).</span>
      </div>
      <div class="relative p-space-md rounded-lg bg-surface-container-lowest flex flex-col gap-1">
        <span class="font-label-lg text-label-lg text-primary-container">04</span>
        <span class="font-label-md text-label-md text-on-surface font-semibold uppercase">LightGBM V2</span>
        <span class="font-body-sm text-body-sm text-on-surface-variant">The booster returns the predicted veh/h with the full sensor context.</span>
      </div>
    </div>
  </section>

  <!-- PROJECT GOVERNANCE & CREDITS (exact Stitch layout) -->
  <section class="rounded-xl bg-surface-container-low/75 backdrop-blur-2xl p-space-md lg:p-space-xl shadow-2xl">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
      <!-- Team Metadata -->
      <div class="lg:col-span-7 flex flex-col gap-space-md">
        <div class="flex flex-col gap-space-xs">
          <div class="flex items-center gap-space-xs">
            <span class="material-symbols-outlined text-primary-container text-[20px]">school</span>
            <span class="font-label-md text-label-md text-primary-fixed uppercase tracking-wider">PROJECT GOVERNANCE &amp; CREDITS</span>
          </div>
          <span class="font-headline-lg text-headline-lg text-on-surface tracking-tight">Advanced AI &amp; Mobility Systems Lab</span>
          <span class="font-body-md text-body-md text-on-surface-variant">University Engineering Portfolio • Department of Computer Science &amp; Intelligent Systems</span>
        </div>
        <div class="flex flex-col gap-space-sm pt-space-xs">
          <!-- Lead -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between p-space-sm rounded-lg bg-surface-container-lowest/90 gap-2">
            <div class="flex items-center gap-space-sm">
              <div class="w-10 h-10 rounded-lg bg-primary-container/20 flex items-center justify-center text-primary-container font-headline-sm">AH</div>
              <div class="flex flex-col">
                <span class="font-headline-sm text-headline-sm text-on-surface leading-tight">Arham Hassan</span>
                <span class="font-label-sm text-label-sm text-primary-fixed uppercase tracking-wider">Project Lead • Lead System Architect</span>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded bg-surface-container font-label-sm text-label-sm text-on-surface-variant text-right sm:text-left self-start sm:self-auto">System Modeling &amp; Backend Infrastructure</span>
          </div>
          <!-- Members Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-space-xs">
            <div class="p-space-sm rounded-lg bg-surface-container-lowest/70 flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded bg-secondary-container/20 flex items-center justify-center text-secondary font-label-md">DJ</div>
                <span class="font-headline-sm text-headline-sm text-on-surface text-base">Darusha Javed</span>
              </div>
              <span class="font-label-sm text-label-sm text-on-surface-variant uppercase mt-1">Telemetry &amp; Feature Pipelines</span>
            </div>
            <div class="p-space-sm rounded-lg bg-surface-container-lowest/70 flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded bg-secondary-container/20 flex items-center justify-center text-secondary font-label-md">AF</div>
                <span class="font-headline-sm text-headline-sm text-on-surface text-base">Alfia Fareed</span>
              </div>
              <span class="font-label-sm text-label-sm text-on-surface-variant uppercase mt-1">Predictive ML &amp; Spatial Tuning</span>
            </div>
            <div class="p-space-sm rounded-lg bg-surface-container-lowest/70 flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded bg-secondary-container/20 flex items-center justify-center text-secondary font-label-md">AA</div>
                <span class="font-headline-sm text-headline-sm text-on-surface text-base">Abu Alam Siddiqui</span>
              </div>
              <span class="font-label-sm text-label-sm text-on-surface-variant uppercase mt-1">FastAPI Engine &amp; Web Services</span>
            </div>
          </div>
        </div>
      </div>
      <!-- Technology Stack -->
      <div class="lg:col-span-5 flex flex-col gap-space-sm bg-surface-container-lowest/90 p-space-md rounded-xl">
        <span class="font-label-md text-label-md text-primary-container uppercase tracking-wider">TECHNOLOGY STACK</span>
        <div class="flex flex-wrap gap-2">
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md"><span class="w-2 h-2 rounded-full bg-primary-container"></span> Python</span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md"><span class="w-2 h-2 rounded-full bg-secondary"></span> LightGBM</span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md"><span class="w-2 h-2 rounded-full bg-primary-container"></span> FastAPI</span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md"><span class="w-2 h-2 rounded-full bg-secondary"></span> pandas</span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md"><span class="w-2 h-2 rounded-full bg-primary-container"></span> Parquet</span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md"><span class="w-2 h-2 rounded-full bg-secondary"></span> Leaflet 1.9.4</span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md"><span class="w-2 h-2 rounded-full bg-primary-container"></span> OpenStreetMap</span>
          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md"><span class="w-2 h-2 rounded-full bg-secondary"></span> Nominatim</span>
        </div>
      </div>
    </div>
  </section>
</div>`;

export function initAbout(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = TEMPLATE;
}
