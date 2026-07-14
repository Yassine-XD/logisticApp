// src/utils/geo.js
// Shared geographic helpers. This is the ONE place Haversine lives —
// controllers/services must not reimplement it.

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance in km between two {lat,lng} points.
 * Returns Infinity when either point lacks valid coordinates.
 */
function distanceKm(a, b) {
  if (
    !a ||
    !b ||
    !Number.isFinite(a.lat) ||
    !Number.isFinite(a.lng) ||
    !Number.isFinite(b.lat) ||
    !Number.isFinite(b.lng)
  ) {
    return Infinity;
  }
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function hasValidGeo(geo) {
  return geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng);
}

module.exports = { distanceKm, hasValidGeo, EARTH_RADIUS_KM };
