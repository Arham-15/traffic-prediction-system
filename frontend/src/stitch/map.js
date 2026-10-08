/**
 * Leaflet map module — real CARTO raster tiles, real markers, Stitch-styled HUD.
 *
 * Two instances are managed:
 *   - 'dash'  : the compact card on the Dashboard cockpit
 *   - 'full'  : the full-viewport Traffic Map view
 *
 * Basemap = CARTO raster tiles (basemaps.cartocdn.com), authenticated with the
 * build-time VITE_CARTO_API_KEY environment variable. The dark basemap keeps
 * the CSS filter class, which inverts these light CARTO tiles for the dark theme.
 */

import { parseCoordinatePair, geocodeLocation, shortPlaceName } from './geo.js';
import { BANDS, classifyVolume, bandState, corridorLabel } from './severity.js';

// CARTO Basemaps API key — supplied at build time, used only in the tile URL below.
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY || '';

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

const CARTO_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png' +
  `?key=${CARTO_API_KEY}`;

const MAP_LAYERS = {
  dark: {
    url: CARTO_TILE_URL,
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 20,
    className: 'map-tiles-dark'
  },
  streets: {
    url: CARTO_TILE_URL,
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 20,
    className: ''
  }
};

const DEFAULT_CENTER = [38.5816, -121.4944]; // Sacramento
const DEFAULT_ZOOM = 11;

const instances = {};

function createUserIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="stitch-user-marker"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12]
  });
}

function createSensorIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="stitch-sensor-marker"><span class="material-symbols-outlined">sensors</span></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14]
  });
}

function popupHtml(title, lines) {
  const body = lines
    .filter(Boolean)
    .map((line) => `<div>${line}</div>`)
    .join('');

  return `<div class="stitch-popup"><strong>${title}</strong>${body}</div>`;
}

function createMap(containerId, { onPick, onBoundsChange } = {}) {
  const container = document.getElementById(containerId);
  if (!container || typeof L === 'undefined') return null;

  const map = L.map(containerId, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
    worldCopyJump: true
  });

  const state = { layerKey: 'dark', tileLayer: null };
  state.tileLayer = L.tileLayer(
    MAP_LAYERS.dark.url,
    {
      attribution: MAP_LAYERS.dark.attribution,
      maxZoom: MAP_LAYERS.dark.maxZoom,
      subdomains: MAP_LAYERS.dark.subdomains,
      className: MAP_LAYERS.dark.className
    }
  ).addTo(map);

  const userMarker = L.marker(DEFAULT_CENTER, { icon: createUserIcon() })
    .addTo(map)
    .bindPopup(popupHtml('Target location', ['Run a prediction to locate the nearest sensor']));

  let sensorMarker = null;
  let corridorLayer = null;

  if (onPick) {
    map.on('click', (event) => {
      onPick(event.latlng.lat, event.latlng.lng);
    });
  }

  const instance = {
    map,
    state,
    userMarker,
    sensorMarker: () => sensorMarker,

    setLayer(layerKey) {
      if (!MAP_LAYERS[layerKey] || layerKey === state.layerKey) return;
      state.layerKey = layerKey;
      map.removeLayer(state.tileLayer);
      const config = MAP_LAYERS[layerKey];
      state.tileLayer = L.tileLayer(config.url, {
        attribution: config.attribution,
        maxZoom: config.maxZoom,
        subdomains: config.subdomains,
        className: config.className || ''
      });
      state.tileLayer.addTo(map);
    },

    setLocation(lat, lng, name, coordsLabel) {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;

      // A hidden container has zero size — animating into it produces
      // NaN frame math in Leaflet. Jump instantly instead.
      const isVisible = container.offsetWidth > 0 && container.offsetHeight > 0;
      if (isVisible) {
        map.flyTo([latNum, lngNum], Math.max(map.getZoom(), 12), { duration: 1.2 });
      } else {
        map.setView([latNum, lngNum], Math.max(map.getZoom(), 12), { animate: false });
      }

      userMarker.setLatLng([latNum, lngNum]).bindPopup(
        popupHtml(
          name || 'Target location',
          [`Lat ${latNum.toFixed(5)} · Lng ${lngNum.toFixed(5)}`].concat(
            coordsLabel ? [coordsLabel] : []
          )
        )
      ).openPopup();
    },

    setSensor(sensor, prediction, bandKey) {
      if (!sensor) return;

      const lat = Number(sensor.latitude);
      const lng = Number(sensor.longitude);

      if (sensorMarker) {
        sensorMarker.remove();
      }

      const band = bandState(bandKey || classifyVolume(prediction));
      const color = band.segmentGlow || BANDS.low.color;

      sensorMarker = L.marker([lat, lng], { icon: createSensorIcon() })
        .addTo(map)
        .bindPopup(
          popupHtml(
            `PeMS sensor #${sensor.sensor_id}`,
            [
              `${corridorLabel(sensor)} · ${sensor.lanes} lanes`,
              Number(sensor.distance_km).toFixed(2) + ' km from target',
              `District ${sensor.district} · ${sensor.county} County`,
              prediction !== undefined && prediction !== null
                ? `<span style="color:${color};font-weight:600">Predicted ${Math.round(Number(prediction)).toLocaleString('en-US')} veh/h</span>`
                : ''
            ]
          )
        );

      // Draw the target->sensor relationship by fitting both points
      const group = L.featureGroup([userMarker, sensorMarker]);
      const bounds = group.getBounds().pad(0.35);
      const isVisible = container.offsetWidth > 0 && container.offsetHeight > 0;
      if (isVisible) {
        map.fitBounds(bounds, { animate: true, maxZoom: 13 });
      } else {
        map.setView(bounds.getCenter(), 12, { animate: false });
      }
    },

    /**
     * Render the real multi-sensor corridor from POST /traffic-map.
     * Every segment/marker is anchored to a real PeMS sensor coordinate and
     * coloured by the real V2 prediction for that sensor — nothing is
     * simulated. PeMS metadata has no road geometry, so each sensor is
     * drawn as a short, direction-oriented segment centred on its real
     * coordinate (a clearly-associated representation, not fake geometry).
     */
    setCorridor(segments, meta = {}) {
      if (corridorLayer) {
        corridorLayer.remove();
        corridorLayer = null;
      }

      const clean = (segments || []).filter((segment) => {
        const lat = Number(segment.latitude);
        const lng = Number(segment.longitude);
        return (
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Number.isFinite(Number(segment.prediction))
        );
      });

      if (!clean.length) return;

      corridorLayer = L.layerGroup().addTo(map);

      clean.forEach((segment) => {
        const lat = Number(segment.latitude);
        const lng = Number(segment.longitude);
        const prediction = Number(segment.prediction);
        const bandKey = classifyVolume(prediction);
        const band = bandState(bandKey);
        const color = band.segmentGlow || BANDS[bandKey].color;

        // ~200 m segment oriented along the sensor's real travel direction
        const half = 0.0009;
        const lngScale = Math.cos((lat * Math.PI) / 180);
        const isEastWest = ['E', 'W', 'NE', 'NW', 'SE', 'SW'].includes(
          String(segment.direction || '').toUpperCase()
        );
        const coords = isEastWest
          ? [[lat, lng - half / lngScale], [lat, lng + half / lngScale]]
          : [[lat - half, lng], [lat + half, lng]];

        const popup = popupHtml(
          `PeMS sensor #${segment.sensor_id}`,
          [
            `<span style="color:${color};font-weight:600">${Math.round(prediction).toLocaleString('en-US')} veh/h · ${band.pillText}</span>`,
            `${corridorLabel(segment)} · ${segment.lanes} lanes`,
            Number(segment.distance_km).toFixed(2) + ' km from target',
            meta.locationName ? `Target: ${meta.locationName}` : '',
            segment.historical_reference_time
              ? `History basis: ${segment.historical_reference_time} (real)`
              : ''
          ]
        );

        L.polyline(coords, {
          color,
          weight: 6,
          opacity: 0.85,
          className: 'stitch-corridor-segment'
        })
          .bindPopup(popup)
          .addTo(corridorLayer);

        L.circleMarker([lat, lng], {
          radius: 5,
          color: '#ffffff',
          weight: 1.5,
          fillColor: color,
          fillOpacity: 1
        })
          .bindPopup(popup)
          .addTo(corridorLayer);
      });

      const group = L.featureGroup([
        userMarker,
        ...corridorLayer.getLayers().filter((layer) => layer.getLatLng)
      ]);
      const bounds = group.getBounds().pad(0.3);
      const isVisible = container.offsetWidth > 0 && container.offsetHeight > 0;
      if (isVisible) {
        map.fitBounds(bounds, { animate: true, maxZoom: 13 });
      } else {
        map.setView(bounds.getCenter(), Math.max(map.getZoom(), 12), { animate: false });
      }
    },

    clearCorridor() {
      if (corridorLayer) {
        corridorLayer.remove();
        corridorLayer = null;
      }
    },

    flyTo(lat, lng, zoom) {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;

      const isVisible = container.offsetWidth > 0 && container.offsetHeight > 0;
      if (isVisible) {
        map.flyTo([latNum, lngNum], zoom || 13, { duration: 1.2 });
      } else {
        map.setView([latNum, lngNum], zoom || 13, { animate: false });
      }
    },

    invalidate() {
      setTimeout(() => map.invalidateSize(), 60);
    },

    setPickMode(enabled) {
      if (enabled) {
        container.classList.add('map-pick-mode');
      } else {
        container.classList.remove('map-pick-mode');
      }
    },

    bindHud({ searchInputId, searchGoId, layerButtonClass, zoomInId, zoomOutId, gpsId, fullscreenId }) {
      const searchInput = document.getElementById(searchInputId);
      const searchGo = document.getElementById(searchGoId);

      const runSearch = async () => {
        if (!searchInput) return;
        const raw = searchInput.value.trim();
        if (!raw) return;

        const coords = parseCoordinatePair(raw);
        if (coords) {
          instance.setLocation(coords.lat, coords.lng, 'Coordinate pin', 'Manual coordinate query');
          if (onPick) onPick(coords.lat, coords.lng);
          return;
        }

        try {
          const geo = await geocodeLocation(raw);
          if (geo) {
            instance.setLocation(geo.latitude, geo.longitude, shortPlaceName(geo.displayName));
            if (onPick) onPick(geo.latitude, geo.longitude);
          } else if (searchGo) {
            searchGo.textContent = 'N/A';
            setTimeout(() => { searchGo.textContent = 'GO'; }, 1500);
          }
        } catch (_) {
          // throttled or offline — surface via the button flash
          if (searchGo) {
            searchGo.textContent = 'ERR';
            setTimeout(() => { searchGo.textContent = 'GO'; }, 1500);
          }
        }
      };

      if (searchGo) searchGo.addEventListener('click', runSearch);
      if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') runSearch();
        });
      }

      if (layerButtonClass) {
        document.querySelectorAll(`.${layerButtonClass}`).forEach((button) => {
          button.addEventListener('click', () => {
            instance.setLayer(button.dataset.layer);
            document.querySelectorAll(`.${layerButtonClass}`).forEach((item) => {
              item.setAttribute('aria-pressed', String(item === button));
            });
          });
        });
      }

      if (zoomInId) {
        document.getElementById(zoomInId)?.addEventListener('click', () => map.zoomIn());
      }
      if (zoomOutId) {
        document.getElementById(zoomOutId)?.addEventListener('click', () => map.zoomOut());
      }
      if (gpsId) {
        document.getElementById(gpsId)?.addEventListener('click', () => {
          map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 1.2 });
        });
      }
      if (fullscreenId) {
        document.getElementById(fullscreenId)?.addEventListener('click', () => {
          if (!document.fullscreenElement) {
            container.parentElement?.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen?.();
          }
        });
      }
    }
  };

  return instance;
}

export function initMaps({ onDashboardPick, onFullPick } = {}) {
  instances.dash = createMap('dash-map', { onPick: onDashboardPick });
  instances.full = createMap('full-map', { onPick: onFullPick });

  instances.dash?.bindHud({
    searchInputId: 'dash-coord-search',
    searchGoId: 'dash-coord-go',
    layerButtonClass: 'dash-layer-btn',
    zoomInId: 'dash-zoom-in',
    zoomOutId: 'dash-zoom-out',
    gpsId: 'dash-gps'
  });

  instances.full?.bindHud({
    searchInputId: 'full-coord-search',
    searchGoId: 'full-coord-go',
    layerButtonClass: 'full-layer-btn',
    zoomInId: 'full-zoom-in',
    zoomOutId: 'full-zoom-out',
    gpsId: 'full-gps',
    fullscreenId: 'full-fullscreen'
  });

  instances.full?.setLocation(DEFAULT_CENTER[0], DEFAULT_CENTER[1], 'Sacramento, California');
  instances.full?.userMarker.closePopup();

  return instances;
}

export function getMap(key) {
  return instances[key] || null;
}

/** Push a resolved location to every map instance. */
export function propagateLocation(lat, lng, name) {
  Object.values(instances).forEach((instance) => {
    instance?.setLocation(lat, lng, name);
  });
}

/** Push a prediction + sensor result to every map instance. */
export function propagateSensor(sensor, prediction, bandKey, locationName) {
  Object.entries(instances).forEach(([key, instance]) => {
    if (!instance) return;
    instance.setSensor(sensor, prediction, bandKey);
    if (key === 'full') {
      updateInspector(sensor, prediction, bandKey, locationName);
    }
  });
}

/** Push the real /traffic-map corridor to every map instance. */
export function propagateCorridor(segments, meta) {
  Object.values(instances).forEach((instance) => {
    instance?.setCorridor(segments, meta);
  });
}

/** Remove corridor segments from every map instance. */
export function clearCorridors() {
  Object.values(instances).forEach((instance) => {
    instance?.clearCorridor();
  });
}

/**
 * Corridor status chip on the map cards (dash + full). kind: 'loading' |
 * 'success' | 'error' | 'hidden'. The text is always a real outcome —
 * loading progress, real segment counts, or the actual backend error.
 */
export function setCorridorStatus(kind, text) {
  ['dash-corridor-status', 'full-corridor-status'].forEach((id) => {
    const chip = document.getElementById(id);
    if (!chip) return;

    if (kind === 'hidden') {
      chip.classList.add('hidden');
      return;
    }

    chip.classList.remove('hidden');
    chip.textContent = text;
    const variant = kind === 'error' || kind === 'success' ? kind : 'info';
    chip.classList.remove('status-chip-info', 'status-chip-success', 'status-chip-error');
    chip.classList.add(`status-chip-${variant}`);
  });
}

/** Populate the Traffic Map inspector drawer from a real response. */
export function updateInspector(sensor, prediction, bandKey, locationName) {
  const panel = document.getElementById('inspector-panel');
  if (!panel || !sensor) return;

  panel.classList.remove('hidden');

  const band = bandState(bandKey || classifyVolume(prediction));
  const badge = document.getElementById('insp-badge');
  if (badge) {
    badge.textContent = band.pillText;
    badge.className =
      'px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold tracking-wider animate-pulse ' +
      band.pillClass;
  }

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('insp-flow', Number.isFinite(Number(prediction))
    ? Math.round(Number(prediction)).toLocaleString('en-US')
    : '—');
  setText('insp-band', band.pillText);
  setText('insp-id', `PeMS #${sensor.sensor_id}`);
  setText('insp-corridor', `${corridorLabel(sensor)} · ${sensor.lanes} lanes`);
  setText('insp-coords', `${Number(sensor.latitude).toFixed(5)}, ${Number(sensor.longitude).toFixed(5)}`);
  setText('insp-distance', `${Number(sensor.distance_km).toFixed(2)} km from ${locationName || 'target'}`);
  setText('insp-region', `District ${sensor.district} · ${sensor.county} County`);

  const scale = document.getElementById('insp-flow-scale');
  if (scale) {
    const pct = Math.max(2, Math.min(100, Math.round((Number(prediction) / 1000) * 100)));
    scale.style.width = `${pct}%`;
    scale.style.backgroundColor = band.segmentGlow;
  }
}

export function hideInspector() {
  document.getElementById('inspector-panel')?.classList.add('hidden');
}
