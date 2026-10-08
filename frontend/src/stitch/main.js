/**
 * Stitch frontend entrypoint.
 *
 * Boots the four Stitch views (Dashboard cockpit, Traffic Map, Analytics,
 * About), wires the glass-header router and reports real API health.
 */

import { initDashboard, handleMapPick } from './dashboard.js';
import { initAnalytics } from './analytics.js';
import { initAbout } from './about.js';
import { initMaps, getMap, hideInspector } from './map.js';
import { checkApiHealth } from './client.js';
import { initThemeToggle } from './theme.js';

const VIEWS = {
  dashboard: 'view-dashboard',
  map: 'view-map',
  analytics: 'view-analytics',
  about: 'view-about'
};

const NAV_ACTIVE =
  'px-space-md py-1.5 rounded whitespace-nowrap transition-all duration-200 ' +
  'bg-primary-container text-on-primary-container font-headline-sm ' +
  'shadow-[0_0_16px_rgba(0,240,255,0.4)]';
const NAV_INACTIVE =
  'px-space-md py-1.5 rounded whitespace-nowrap text-on-surface-variant ' +
  'hover:text-on-surface font-body-md text-body-md transition-all duration-200';

/* ------------------------------------------------------------------ */
/* View router                                                         */
/* ------------------------------------------------------------------ */

function switchView(name) {
  const targetId = VIEWS[name];
  if (!targetId) return;

  document.querySelectorAll('.stitch-view').forEach((view) => {
    view.classList.add('hidden');
  });

  const target = document.getElementById(targetId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('flex');
  }

  document.querySelectorAll('nav a[data-view]').forEach((link) => {
    link.className = link.dataset.view === name ? NAV_ACTIVE : NAV_INACTIVE;
    if (link.dataset.view === name) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  // Leaflet instances created/kept in hidden containers need a size pass
  if (name === 'dashboard') getMap('dash')?.invalidate();
  if (name === 'map') getMap('full')?.invalidate();
}

function bindRouter() {
  document.querySelectorAll('nav a[data-view]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      switchView(link.dataset.view);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Real API health indicator                                           */
/* ------------------------------------------------------------------ */

const HEALTH_DOT = {
  pending: 'w-1.5 h-1.5 rounded-full bg-outline animate-pulse',
  online: 'w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]',
  offline: 'w-1.5 h-1.5 rounded-full bg-error shadow-[0_0_8px_#ffb4ab]'
};

function renderHealth(state, text) {
  const badgeIds = ['health-badge', 'health-badge-desktop'];
  const labelIds = ['footer-health'];

  badgeIds.forEach((id) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    const dot = badge.querySelector('span');
    if (dot) dot.className = HEALTH_DOT[state];
    const label = badge.querySelector('span + span');
    if (label) label.textContent = text;
  });

  labelIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });

  const telemetry = document.getElementById('telemetry-status');
  if (telemetry) {
    telemetry.textContent = state === 'online' ? 'LIGHTGBM V2 SYNCED' : text;
    telemetry.classList.remove('status-text-info', 'status-text-success', 'status-text-error');
    telemetry.classList.add(
      'status-text-' +
        (state === 'online' ? 'success' : state === 'offline' ? 'error' : 'info')
    );
  }
}

async function refreshHealth() {
  renderHealth('pending', 'API CHECKING...');
  const ok = await checkApiHealth();
  renderHealth(
    ok ? 'online' : 'offline',
    ok ? 'API ONLINE · LIGHTGBM V2' : 'API OFFLINE — CHECK CONNECTION'
  );
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  // Each step is isolated: a failure in one subsystem must never prevent
  // the router or the health indicator from coming up.
  const steps = [
    () => initThemeToggle(),
    () => initDashboard(),
    () => initAnalytics('analytics-container'),
    () => initAbout('about-container'),
    () => initMaps({ onDashboardPick: handleMapPick, onFullPick: handleMapPick }),
    () => {
      document
        .getElementById('insp-close')
        ?.addEventListener('click', hideInspector);
    },
    () => bindRouter(),
    () => refreshHealth()
  ];

  steps.forEach((step) => {
    try {
      step();
    } catch (error) {
      console.error('Stitch boot step failed:', error);
    }
  });

  // Re-verify periodically so the badge reflects the real backend state
  setInterval(() => {
    refreshHealth?.();
  }, 30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
