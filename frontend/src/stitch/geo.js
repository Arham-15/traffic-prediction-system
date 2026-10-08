/**
 * Geocoding — OpenStreetMap Nominatim with throttle + cache.
 * Ported from the proven implementation in the previous frontend.
 */

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
 * Resolve a free-text place name to real coordinates via OpenStreetMap
 * Nominatim. Returns null when no match exists; throws a friendly Error
 * on network/HTTP failures.
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
    throw new Error('geocoding service unreachable — check your internet connection');
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

/** Short human label: first ~3 comma segments of a Nominatim display name. */
export function shortPlaceName(displayName) {
  return String(displayName || '')
    .split(',')
    .slice(0, 3)
    .join(',')
    .trim();
}

/** Match "38.58, -121.49" style coordinate pairs; returns {lat,lng} or null. */
export function parseCoordinatePair(text) {
  const match = String(text || '').match(
    /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/
  );
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lng) || lng < -180 || lng > 180
  ) {
    return null;
  }

  return { lat, lng };
}
