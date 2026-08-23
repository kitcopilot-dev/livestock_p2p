/**
 * Route distance estimation.
 *
 * Sale-derived loads open on the load board without a seller-supplied
 * distance, so we estimate the haul with a small embedded city-coordinate
 * table (US demo cities) + haversine. Unknown cities fall back to a
 * conservative default so miles hauled stays meaningful.
 */

interface CityCoord {
  lat: number;
  lng: number;
}

/** Lat/lng for the demo markets (and common hubs). */
const CITY_COORDS: Record<string, CityCoord> = {
  "oklahoma city": { lat: 35.4676, lng: -97.5164 },
  "amarillo": { lat: 35.222, lng: -101.8313 },
  "fayetteville": { lat: 36.0626, lng: -94.1574 },
  "memphis": { lat: 35.1495, lng: -90.049 },
  "nashville": { lat: 36.1627, lng: -86.7816 },
  "wichita": { lat: 37.6872, lng: -97.3301 },
  "greeley": { lat: 40.4233, lng: -104.7091 },
  "denver": { lat: 39.7392, lng: -104.9903 },
  "dallas": { lat: 32.7767, lng: -96.797 },
  "tulsa": { lat: 36.154, lng: -95.9928 },
  "kansas city": { lat: 39.0997, lng: -94.5786 },
  "lubbock": { lat: 33.5779, lng: -101.8552 },
};

function coordFor(raw: string | null): CityCoord | null {
  if (!raw) return null;
  // "Oklahoma City, OK" -> "oklahoma city"
  const city = raw.split(",")[0]!.trim().toLowerCase();
  return CITY_COORDS[city] ?? null;
}

function haversineMiles(a: CityCoord, b: CityCoord): number {
  const R = 3958.8; // earth radius in miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Round-trip average of the two city distances when both resolve; else 180 mi. */
export function estimateRouteMiles(origin: string | null, destination: string | null): number {
  const a = coordFor(origin);
  const b = coordFor(destination);
  if (a && b) return Math.max(40, Math.round(haversineMiles(a, b)));
  return 180;
}
