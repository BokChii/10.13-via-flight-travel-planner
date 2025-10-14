import { routeColorAt } from "./palette.js";

// Converts Directions API responses into normalized route plan data.
export function buildRoutePlan({ segments = [], stops = [], colors = [] } = {}) {
  const routes = normalizeRoutes(segments);
  if (!routes.length) return null;

  const allLegs = routes.flatMap((route) => route.legs || []);
  if (!allLegs.length) return null;

  const totalDurationSeconds = allLegs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
  const totalDistanceMeters = allLegs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);

  const segmentSummaries = routes.map((route, index) => {
    const legs = route.legs || [];
    const fromStop = stops[index];
    const toStop = stops[index + 1];
    const color = colors[index] ?? routeColorAt(index);

    const distanceMeters = legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
    const durationSeconds = legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);

    return {
      color,
      fromLabel: labelForStop(fromStop, index === 0 ? "출발지" : `경유 ${index}`),
      toLabel: labelForStop(toStop, index === stops.length - 2 ? "도착지" : `경유 ${index + 1}`),
      durationText: combineLegText(legs, "duration"),
      distanceText: combineLegText(legs, "distance"),
      distanceMeters,
      durationSeconds,
      legs: legs.map((leg) => normalizeLeg(leg)),
    };
  });

  return {
    totalDurationSeconds,
    totalDistanceMeters,
    totalDurationText: formatTotalDuration(totalDurationSeconds),
    totalDistanceText: formatTotalDistance(totalDistanceMeters),
    arrivalTimeText: routes[routes.length - 1]?.arrival_time?.text ?? null,
    segments: segmentSummaries,
    legs: allLegs.map((leg) => normalizeLeg(leg)),
  };
}

function normalizeRoutes(directionResults) {
  if (!directionResults) return [];
  const resultsArray = Array.isArray(directionResults) ? directionResults : [directionResults];
  return resultsArray
    .map((result) => result?.routes?.[0])
    .filter(Boolean);
}

function combineLegText(legs, key) {
  const parts = legs
    .map((leg) => leg[key]?.text)
    .filter(Boolean);
  if (!parts.length) return "--";
  if (parts.length === 1) return parts[0];
  return parts.join(" + ");
}

function formatTotalDuration(totalSeconds) {
  if (!totalSeconds) return "--";
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  } else {
    return `${minutes}분`;
  }
}

function formatTotalDistance(totalMeters) {
  if (!totalMeters) return "--";
  
  const kilometers = totalMeters / 1000;
  return `${kilometers.toFixed(1)} km`;
}

function normalizeLeg(leg) {
  const steps = leg.steps || [];
  const primaryStep = steps.find((step) => step.travel_mode !== "WALKING") || steps[0];

  return {
    origin: leg.start_address,
    destination: leg.end_address,
    originLocation: leg.start_location?.toJSON?.() ?? leg.start_location ?? null,
    destinationLocation: leg.end_location?.toJSON?.() ?? leg.end_location ?? null,
    durationText: leg.duration?.text ?? "--",
    durationValue: leg.duration?.value ?? 0,
    distanceText: leg.distance?.text ?? "--",
    distanceValue: leg.distance?.value ?? 0,
    modeLabel: describeStep(primaryStep),
    details: summarizeTransitDetails(primaryStep),
  };
}

function describeStep(step) {
  if (!step) return "정보 없음";
  if (step.travel_mode === "WALKING") return "도보";
  if (step.transit?.line) {
    const { short_name: shortName, name } = step.transit.line;
    return shortName ? `${shortName} (${name})` : name;
  }
  return step.travel_mode ?? "이동";
}

function summarizeTransitDetails(step) {
  if (!step || step.travel_mode === "WALKING") {
    return step?.instructions ?? null;
  }

  if (step.transit) {
    const { departure_stop, arrival_stop, num_stops, departure_time, arrival_time } = step.transit;
    return [
      departure_stop?.name && arrival_stop?.name
        ? `${departure_stop.name} → ${arrival_stop.name}`
        : null,
      typeof num_stops === "number" ? `${num_stops} 정거장` : null,
      departure_time?.text && arrival_time?.text
        ? `${departure_time.text} 출발 · ${arrival_time.text} 도착`
        : null,
    ]
      .filter(Boolean)
      .join(" / ");
  }

  return step.instructions ?? null;
}

function labelForStop(stop, fallback) {
  if (!stop) return fallback;
  return stop.label ?? stop.address ?? fallback;
}
