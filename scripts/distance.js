export function haversineDistanceMeters(a, b) {
  const R = 6371e3; // metres
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lng - a.lng);

  const sinHalfDeltaPhi = Math.sin(Δφ / 2);
  const sinHalfDeltaLambda = Math.sin(Δλ / 2);

  const x =
    sinHalfDeltaPhi * sinHalfDeltaPhi +
    Math.cos(φ1) * Math.cos(φ2) * sinHalfDeltaLambda * sinHalfDeltaLambda;
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return R * y;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}
