/**
 * Severity bands, state themes and clearly-labelled reference data.
 *
 * Band thresholds follow the mandated IntelliTraffic severity scale and are
 * also consistent with the real V2 dataset distribution (hourly PeMS traffic
 * across all sensors, 2019):
 *   p50 ≈ 207 · p75 ≈ 367 · p90 ≈ 493 · p99 ≈ 675 · max 999 veh/h
 *   LOW < 200 (green) · MODERATE 200–399.99 (yellow) ·
 *   HIGH 400–599.99 (red) · SEVERE ≥ 600 (blue)
 *
 * The reference profiles below are the MEAN hourly volumes of all 8,600
 * sensors in the 2019 hourly dataset — labelled as a reference pattern in
 * the UI, never presented as a prediction.
 */

export const BANDS = {
  low:      { min: 0,   max: 200, label: 'Low',      color: '#10b981' },
  moderate: { min: 200, max: 400, label: 'Moderate', color: '#f59e0b' },
  heavy:    { min: 400, max: 600, label: 'High',     color: '#ef4444' },
  severe:   { min: 600, max: Infinity, label: 'Severe', color: '#3b82f6' }
};

export const CHART_MAX_VPH = 1000;

/** Mean hourly volume (veh/h) across all sensors — 2019 hourly dataset. */
export const REFERENCE_2019 = {
  source: 'Dataset mean · all sensors · 2019',
  weekday: [76, 55, 51, 65, 126, 223, 300, 343, 335, 316, 310, 315,
            324, 334, 351, 356, 355, 351, 322, 278, 238, 210, 169, 121],
  weekend: [115, 80, 65, 55, 62, 89, 133, 180, 231, 281, 315, 332,
            340, 342, 341, 338, 333, 324, 302, 274, 250, 229, 194, 144]
};

export function classifyVolume(volume) {
  const v = Number(volume);

  if (!Number.isFinite(v)) return null;
  if (v < BANDS.low.max) return 'low';
  if (v < BANDS.moderate.max) return 'moderate';
  if (v < BANDS.heavy.max) return 'heavy';
  return 'severe';
}

/** Same rush-hour rule the backend uses for the is_rush_hour feature. */
export function isRushHour(hour) {
  return [7, 8, 9, 16, 17, 18].includes(Number(hour));
}

/**
 * Corridor label for a sensor — PeMS freeway ids like "I5-N" already carry
 * the direction, so avoid rendering the redundant "I5-N N".
 */
export function corridorLabel(sensor) {
  if (!sensor) return '—';
  const freeway = String(sensor.freeway || '').trim();
  const direction = String(sensor.direction || '').trim();
  if (!freeway) return direction || '—';
  if (!direction) return freeway;
  return freeway.toLowerCase().endsWith(`-${direction.toLowerCase()}`)
    ? freeway
    : `${freeway} ${direction}`;
}

/**
 * Weather classification derived from the user's actual slider values
 * (same rule as the previous frontend — a real derivation, not a guess).
 */
export function deriveWeatherLabel(rain, snow, cloudiness) {
  if (Number(snow) > 0) return 'Snow';
  if (Number(rain) > 0) return 'Rain';
  if (Number(cloudiness) >= 70) return 'Clouds';
  return 'Clear';
}

/**
 * Visual state per severity band — mirrors the Stitch cockpit states
 * (ambient glow, pulse dot, status pill, spectrum segment).
 */
export function bandState(bandKey) {
  const states = {
    low: {
      glowClass: 'bg-emerald-500/15',
      dotClass: 'bg-emerald-400 shadow-[0_0_12px_#34d399]',
      pillClass: 'bg-emerald-950/80 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.3)]',
      pillIcon: 'check_circle',
      pillText: 'LOW TRAFFIC',
      segmentClass: 'bg-emerald-400 shadow-[0_0_8px_#34d399]',
      segmentGlow: '#34d399'
    },
    moderate: {
      glowClass: 'bg-amber-500/15',
      dotClass: 'bg-amber-400 shadow-[0_0_12px_#fbbf24]',
      pillClass: 'bg-amber-950/80 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.3)]',
      pillIcon: 'info',
      pillText: 'MODERATE TRAFFIC',
      segmentClass: 'bg-amber-400 shadow-[0_0_8px_#fbbf24]',
      segmentGlow: '#fbbf24'
    },
    heavy: {
      glowClass: 'bg-error/15',
      dotClass: 'bg-error shadow-[0_0_12px_#ffb4ab]',
      pillClass: 'bg-error-container text-on-error-container shadow-[0_0_20px_rgba(255,180,171,0.3)]',
      pillIcon: 'warning',
      pillText: 'HIGH TRAFFIC',
      segmentClass: 'bg-error shadow-[0_0_8px_#ffb4ab]',
      segmentGlow: '#ef4444'
    },
    severe: {
      glowClass: 'bg-blue-500/15',
      dotClass: 'bg-blue-400 shadow-[0_0_12px_#60a5fa]',
      pillClass: 'bg-blue-950/80 text-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.4)]',
      pillIcon: 'crisis_alert',
      pillText: 'SEVERE GRIDLOCK',
      segmentClass: 'bg-blue-400 shadow-[0_0_8px_#3b82f6]',
      segmentGlow: '#3b82f6'
    }
  };

  return states[bandKey] || states.low;
}

/** Base (inactive) spectrum segment classes. */
export const SEGMENT_BASE_CLASS =
  'h-full w-1/4 rounded-full bg-surface-variant transition-colors duration-300';

/** Fixed weather scenario definitions for the real 4-run sensitivity. */
export const WEATHER_VARIANTS = [
  { label: 'Clear',  rain: 0, snow: 0, cloudiness: 0  },
  { label: 'Clouds', rain: 0, snow: 0, cloudiness: 80 },
  { label: 'Rain',   rain: 10, snow: 0, cloudiness: 90 },
  { label: 'Snow',   rain: 0, snow: 5, cloudiness: 90 }
];
