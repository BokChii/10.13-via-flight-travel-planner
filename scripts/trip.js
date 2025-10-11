function cloneTripMeta(meta) {
  if (!meta) return null;
  return {
    ...meta,
    exploreWindow: meta.exploreWindow ? { ...meta.exploreWindow } : null,
    categoriesUsed: Array.isArray(meta.categoriesUsed) ? [...meta.categoriesUsed] : [],
  };
}

export function buildTripSnapshot(state) {
  if (!state.origin || !state.destination || !state.routePlan) return null;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    origin: pickPlace(state.origin),
    destination: pickPlace(state.destination),
    waypoints: state.waypoints.map(pickPlace),
    routePlan: state.routePlan,
    tripMeta: cloneTripMeta(state.tripMeta),
  };
}

export function buildShareText(snapshot) {
  if (!snapshot) return "";
  const segments = snapshot.routePlan?.segments ?? [];
  const lines = [];
  lines.push(`여행 경로 요약 (${formatKoreanDate(snapshot.generatedAt)})`);
  lines.push(`출발: ${snapshot.origin.address ?? snapshot.origin.label ?? '-'}`);
  snapshot.waypoints.forEach((wp, index) => {
    const stay = wp?.stayMinutes ? ` (체류 ${wp.stayMinutes}분)` : "";
    lines.push(`경유 ${index + 1}: ${wp.address ?? wp.label ?? '-'}${stay}`);
  });
  lines.push(`도착: ${snapshot.destination.address ?? snapshot.destination.label ?? '-'}`);
  lines.push("---");
  lines.push(`총 소요: ${snapshot.routePlan?.totalDurationText ?? '-'} · 총 거리: ${snapshot.routePlan?.totalDistanceText ?? '-'}`);
  segments.forEach((segment, index) => {
    lines.push(`구간 ${index + 1}: ${segment.fromLabel} → ${segment.toLabel}`);
    lines.push(`  · ${segment.durationText} / ${segment.distanceText}`);
    if (segment.legs?.length) {
      const leg = segment.legs[0];
      lines.push(`  · 주요 수단: ${leg.modeLabel}`);
    }
  });
  return lines.join("\n");
}

export function parseTripSnapshot(raw) {
  if (!raw) return null;
  try {
    const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!snapshot.origin || !snapshot.destination) return null;
    return {
      version: snapshot.version ?? 1,
      generatedAt: snapshot.generatedAt ?? new Date().toISOString(),
      origin: pickPlace(snapshot.origin),
      destination: pickPlace(snapshot.destination),
      waypoints: Array.isArray(snapshot.waypoints)
        ? snapshot.waypoints.map(pickPlace)
        : [],
      tripMeta: cloneTripMeta(snapshot.tripMeta ?? null),
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

function pickPlace(place) {
  if (!place) return null;
  return {
    label: place.label ?? place.address ?? place.name ?? "",
    address: place.address ?? place.label ?? "",
    location: place.location ?? null,
    placeId: place.placeId ?? null,
    stayMinutes: place.stayMinutes ?? null,
    website: place.website ?? null,
    phoneNumber: place.phoneNumber ?? null,
    rating: place.rating ?? null,
    userRatingsTotal: place.userRatingsTotal ?? null,
    openingHours: place.openingHours ?? null,
  };
}

function formatKoreanDate(dateInput) {
  if (!dateInput) return "";
  try {
    const date = new Date(dateInput);
    return new Intl.DateTimeFormat("ko", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch (error) {
    return "";
  }
}