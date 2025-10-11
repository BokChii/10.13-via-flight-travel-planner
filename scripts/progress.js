export function calculateNavigationProgress(routePlan, position) {
  if (!routePlan || !position || !routePlan.segments?.length) {
    return null;
  }

  const totalDistanceMeters = routePlan.totalDistanceMeters ?? 0;

  let cumulativeBeforeSegment = 0;
  let closest = null;

  routePlan.segments.forEach((segment, segmentIndex) => {
    const legs = segment.legs || [];
    let cumulativeWithinSegment = 0;

    legs.forEach((leg, legIndex) => {
      const start = parseLatLng(leg.originLocation);
      const end = parseLatLng(leg.destinationLocation);
      if (!start || !end) {
        cumulativeWithinSegment += leg.distanceValue ?? 0;
        return;
      }

      const metrics = projectPointMetrics(start, end, position);
      const legDistance = leg.distanceValue || metrics.legLength;

      if (!closest || metrics.distance < closest.distanceToLegMeters) {
        closest = {
          segmentIndex,
          legIndex,
          distanceToLegMeters: metrics.distance,
          cumulativeBeforeSegment,
          cumulativeWithinSegment,
          legTravelled: clamp(
            legDistance * metrics.fractionAlong,
            0,
            legDistance
          ),
          legDistance,
        };
      }

      cumulativeWithinSegment += legDistance;
    });

    cumulativeBeforeSegment += segment.distanceMeters ?? cumulativeWithinSegment;
  });

  if (!closest) return null;

  const cumulativeBeforeLeg =
    closest.cumulativeBeforeSegment + closest.cumulativeWithinSegment;
  const travelledMeters = cumulativeBeforeLeg + closest.legTravelled;
  const remainingMeters = Math.max(totalDistanceMeters - travelledMeters, 0);
  const progressRatio = totalDistanceMeters > 0 ? clamp(travelledMeters / totalDistanceMeters, 0, 1) : 0;

  return {
    closestSegmentIndex: closest.segmentIndex,
    closestLegIndex: closest.legIndex,
    distanceToLegMeters: closest.distanceToLegMeters,
    travelledMeters,
    remainingMeters,
    progressRatio,
  };
}

function parseLatLng(value) {
  if (!value) return null;
  if (typeof value.lat === "number" && typeof value.lng === "number") {
    return { lat: value.lat, lng: value.lng };
  }
  if (Array.isArray(value) && value.length === 2) {
    return { lat: value[0], lng: value[1] };
  }
  return null;
}

function projectPointMetrics(start, end, point) {
  const startCartesian = toCartesian(start);
  const endCartesian = toCartesian(end);
  const pointCartesian = toCartesian(point);

  const segmentVector = subtract(endCartesian, startCartesian);
  const pointVector = subtract(pointCartesian, startCartesian);

  const segmentLengthSquared = dot(segmentVector, segmentVector);
  const fractionAlong = segmentLengthSquared > 0 ? clamp(dot(pointVector, segmentVector) / segmentLengthSquared, 0, 1) : 0;

  const projection = {
    x: startCartesian.x + segmentVector.x * fractionAlong,
    y: startCartesian.y + segmentVector.y * fractionAlong,
  };

  const distance = euclideanDistance(pointCartesian, projection);
  const legLength = Math.sqrt(segmentLengthSquared);

  return {
    distance,
    fractionAlong,
    legLength,
  };
}

function toCartesian({ lat, lng }) {
  const R = 6371e3;
  const φ = toRad(lat);
  const λ = toRad(lng);
  return {
    x: R * λ * Math.cos(φ),
    y: R * φ,
  };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function euclideanDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
