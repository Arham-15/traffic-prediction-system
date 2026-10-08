// In dev the Vite dev server proxies /api -> FastAPI (see vite.config.js),
// which avoids CORS entirely because the backend has no CORS middleware.
// In a production build the absolute VITE_API_BASE_URL is used.
export const API_BASE_URL =
  import.meta.env.DEV
    ? '/api'
    : import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';


/**
 * Build the exact JSON body required by the IntelliTraffic V2 API.
 *
 * Frontend inputs:
 * - location: object containing latitude/longitude, or a string
 * - date: YYYY-MM-DD
 * - time: HH:mm or HH:mm:ss
 * - day_type: Weekday / Weekend
 * - temperature: Celsius
 * - rain: mm
 * - snow: mm
 * - cloudiness: percentage
 */
export function buildPayload(params) {
  const {
    location = '',
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

  const dateTimeStr = `${date} ${formattedTime}`;

  return {
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    date_time: dateTimeStr,
    day_type: day_type || 'Weekday',
    temperature: parseFloat(temperature),
    rain: parseFloat(rain) || 0.0,
    snow: parseFloat(snow) || 0.0,
    cloudiness: parseFloat(cloudiness) || 0.0
  };
}


/**
 * Predict traffic using the IntelliTraffic V2 API.
 */
async function postJson(endpoint, payload) {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
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
      `Request to ${endpoint} failed (${response.status} ${response.statusText})`;

    try {
      const errJson = await response.json();

      if (errJson.detail) {
        errorDetail = Array.isArray(errJson.detail)
          ? errJson.detail
              .map((d) => d.msg || JSON.stringify(d))
              .join(', ')
          : String(errJson.detail);
      }
    } catch (_) {}

    throw new Error(errorDetail);
  }

  const result = await response.json();

  return {
    ...result,
    sent_payload: payload
  };
}


/**
 * Predict traffic using the IntelliTraffic V2 API.
 */
export async function predictTraffic(params) {
  const payload = buildPayload(params);

  return postJson('/predict', payload);
}


/**
 * Fetch real multi-sensor predictions for the traffic map view.
 * Same payload contract as /predict - the backend maps the selected
 * 2026-2030 date onto the real 2017-2021 history for every sensor.
 */
export async function fetchTrafficMap(params) {
  const payload = buildPayload(params);

  return postJson('/traffic-map', payload);
}


/**
 * Health check to verify API connectivity.
 */
export async function checkApiHealth() {
  try {
    const res = await fetch(
      `${API_BASE_URL}/`,
      {
        method: 'GET'
      }
    );

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