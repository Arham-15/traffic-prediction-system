/**
 * IntelliTraffic API client — Stitch frontend.
 *
 * Talks to the FastAPI LightGBM V2 backend. In dev the Vite proxy forwards
 * /api to the deployed Azure backend (see vite.config.js); in production the
 * VITE_STITCH_API_BASE_URL from .env.production is baked in at build time.
 *
 * NOTE: VITE_API_BASE_URL (used by the previous frontend, set to the bare
 * backend URL in .env) is deliberately NOT consulted here — direct
 * cross-origin browser calls are blocked by the backend's origin allow-list.
 * Set VITE_STITCH_API_BASE_URL to override for special deployments.
 */

export const API_BASE_URL =
  import.meta.env.VITE_STITCH_API_BASE_URL || '/api';

/**
 * Thrown when the backend geographic gate rejects the location: the API
 * answers HTTP 400 with a structured `detail` object (message,
 * max_distance_km, nearest_sensor_id, nearest_sensor_distance_km — see
 * MAX_SENSOR_DISTANCE_KM in src/sensor_lookup.py). Callers can catch this
 * type to show the dedicated "Location not supported" UI.
 */
export class LocationNotSupportedError extends Error {
  constructor(detail) {
    super(
      (detail && detail.message) ||
        'Location is outside the supported California PeMS traffic network.'
    );
    this.name = 'LocationNotSupportedError';
    this.maxDistanceKm = detail ? detail.max_distance_km : null;
    this.nearestSensorId = detail ? detail.nearest_sensor_id : null;
    const km = Number(detail && detail.nearest_sensor_distance_km);
    this.nearestSensorDistanceKm = Number.isFinite(km) ? km : null;
  }
}

/**
 * Normalize a backend error body into a message string, or into a typed
 * LocationNotSupportedError when the rejection is the geographic gate.
 */
function parseApiErrorDetail(errJson) {
  const detail = errJson && errJson.detail;

  if (!detail) {
    return null;
  }

  if (
    typeof detail === 'object' &&
    !Array.isArray(detail) &&
    (detail.message || detail.max_distance_km)
  ) {
    return new LocationNotSupportedError(detail);
  }

  return Array.isArray(detail)
    ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
    : String(detail);
}

/**
 * Build the exact JSON body required by the IntelliTraffic V2 API.
 *
 * Backend contract (src/main.py):
 *  - latitude, longitude: float
 *  - date_time: "YYYY-MM-DD HH:MM:SS"
 *  - day_type: "Weekday" | "Weekend" (must match the date or the API
 *    replies 400 — the UI derives this from the date)
 *  - temperature: Celsius, rain/snow: mm, cloudiness: percent
 */
export function buildPayload(params) {
  const {
    latitude,
    longitude,
    date,
    time,
    day_type,
    temperature,
    rain = 0.0,
    snow = 0.0,
    cloudiness = 0
  } = params;

  const formattedTime =
    time && time.length === 5
      ? `${time}:00`
      : time;

  return {
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    date_time: `${date} ${formattedTime}`,
    day_type: day_type || 'Weekday',
    temperature: parseFloat(temperature),
    rain: parseFloat(rain) || 0.0,
    snow: parseFloat(snow) || 0.0,
    cloudiness: parseFloat(cloudiness) || 0.0
  };
}

/**
 * Run a real LightGBM V2 prediction.
 * Returns the backend response plus the exact payload that was sent.
 */
export async function predictTraffic(params) {
  const payload = buildPayload(params);

  const response = await fetch(
    `${API_BASE_URL}/predict`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    let errorDetail =
      `Prediction request failed (${response.status} ${response.statusText})`;

    try {
      const errJson = await response.json();

      if (errJson.detail) {
        errorDetail = parseApiErrorDetail(errJson);
      }
    } catch (_) {
      // keep the generic status-based message
    }

    if (errorDetail instanceof LocationNotSupportedError) {
      throw errorDetail;
    }

    throw new Error(errorDetail);
  }

  const result = await response.json();

  return {
    ...result,
    sent_payload: payload
  };
}

/**
 * Multi-sensor corridor predictions for the Traffic Map view.
 * Calls the real POST /traffic-map endpoint (same V2 model + year mapping
 * as /predict); the backend returns per-sensor predictions with real
 * coordinates, severity and historical reference times.
 */
export async function fetchTrafficMap(params) {
  const payload = buildPayload(params);

  const response = await fetch(
    `${API_BASE_URL}/traffic-map`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    let errorDetail =
      `Corridor prediction failed (${response.status} ${response.statusText})`;

    try {
      const errJson = await response.json();

      if (errJson.detail) {
        errorDetail = parseApiErrorDetail(errJson);
      }
    } catch (_) {
      // keep the generic status-based message
    }

    if (errorDetail instanceof LocationNotSupportedError) {
      throw errorDetail;
    }

    throw new Error(errorDetail);
  }

  return response.json();
}

/**
 * Health check against GET /api/ — verifies both reachability and that
 * the running backend really is the LightGBM V2 service.
 */
export async function checkApiHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/`, { method: 'GET' });

    if (!res.ok) {
      return false;
    }

    const data = await res.json();

    return (
      data.message === 'IntelliTraffic API is running' &&
      data.model === 'LightGBM V2'
    );
  } catch (_) {
    return false;
  }
}
