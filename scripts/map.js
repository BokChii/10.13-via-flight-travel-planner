// Map rendering module: creates the map instance and draws markers/routes.
import { routeColorAt } from "./palette.js";

let map;
let googleRef;
let directionsRenderers = [];
let markers = [];
let userMarker;
let previewMarker;

export function initMap(google, { center, zoom = 13 }) {
  googleRef = google;
  map = new google.maps.Map(document.getElementById("map"), {
    center,
    zoom,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  clearRoute();
  return map;
}

export function renderRoute(google, { segments, stops, colors }) {
  if (!map) return;
  clearPreviewMarker();
  clearRoute();

  if (!Array.isArray(segments) || !segments.length) return;

  segments.forEach((segment, index) => {
    const strokeColor = colors?.[index] ?? routeColorAt(index);
    const renderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: index !== 0,
      polylineOptions: {
        strokeColor,
        strokeOpacity: 0.85,
        strokeWeight: 6,
      },
    });
    renderer.setDirections(segment);
    directionsRenderers.push(renderer);
  });

  updateMarkers(google, segments, stops);
  fitMapToSegments(segments);
}

export function highlightSegment(segmentIndex, { focus = true } = {}) {
  if (!map || !googleRef) return;
  directionsRenderers.forEach((renderer, index) => {
    const isTarget = index === segmentIndex;
    const options = renderer.getOptions?.() ?? {};
    const polylineOptions = options.polylineOptions ?? {};
    renderer.setOptions({
      ...options,
      polylineOptions: {
        ...polylineOptions,
        strokeOpacity: isTarget ? 1 : 0.35,
        strokeWeight: isTarget ? 8 : 5,
        zIndex: isTarget ? 10 : 1,
      },
    });
  });

  if (focus) {
    const targetRoute = directionsRenderers[segmentIndex]?.getDirections()?.routes?.[0];
    if (targetRoute?.bounds) {
      map.fitBounds(targetRoute.bounds, 32);
    }
  }
}

export function updateUserLocation(position, { centerMap = false } = {}) {
  if (!map || !googleRef) return;

  if (!position) {
    if (userMarker) {
      userMarker.setMap(null);
      userMarker = null;
    }
    return;
  }

  const latLng = new googleRef.maps.LatLng(position.lat, position.lng);

  if (!userMarker) {
    userMarker = new googleRef.maps.Marker({
      map,
      position: latLng,
      icon: {
        path: googleRef.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#ff7043",
        fillOpacity: 1,
        strokeColor: "white",
        strokeWeight: 2,
      },
      zIndex: 20,
      title: "현재 위치",
    });
  } else {
    userMarker.setPosition(latLng);
  }

  if (centerMap) {
    map.panTo(latLng);
  }
}

export function showPreviewMarker({ position, label }) {
  if (!map || !googleRef || !position) return;
  clearPreviewMarker();
  const latLng = new googleRef.maps.LatLng(position.lat, position.lng);
  previewMarker = new googleRef.maps.Marker({
    map,
    position: latLng,
    icon: {
      path: googleRef.maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: "#1a73e8",
      fillOpacity: 1,
      strokeColor: "white",
      strokeWeight: 2,
    },
    zIndex: 15,
    title: label ?? "미리보기",
  });
  map.panTo(latLng);
}

export function clearPreviewMarker() {
  if (previewMarker) {
    previewMarker.setMap(null);
    previewMarker = null;
  }
}

export function clearRoute() {
  clearPreviewMarker();
  directionsRenderers.forEach((renderer) => renderer.setMap(null));
  directionsRenderers = [];
  clearMarkers();
}

function updateMarkers(google, segments, stops = []) {
  clearMarkers();

  const markerPositions = deriveMarkerPositions(segments, stops.length);

  stops.forEach((stop, index) => {
    const position = markerPositions[index] || stop.location;
    if (!position) return;

    const marker = new google.maps.Marker({
      position,
      map,
      label: {
        text: stop.markerLabel ?? stop.label ?? String(index + 1),
        color: "#0f1c2e",
        fontWeight: "bold",
      },
      title: stop.address ?? stop.label ?? stop.markerLabel ?? "경로 지점",
    });
    markers.push(marker);
  });
}

function deriveMarkerPositions(segments, stopCount) {
  if (!segments.length) return [];

  const positions = new Array(stopCount);
  const firstRoute = segments[0]?.routes?.[0];
  const firstLeg = firstRoute?.legs?.[0];
  if (firstLeg?.start_location) {
    positions[0] = firstLeg.start_location;
  }

  segments.forEach((segment, index) => {
    const route = segment.routes?.[0];
    if (!route) return;
    const legs = route.legs || [];
    const lastLeg = legs[legs.length - 1];
    if (lastLeg?.end_location) {
      positions[index + 1] = lastLeg.end_location;
    }
  });

  return positions;
}

function fitMapToSegments(segments) {
  if (!googleRef || !segments.length) return;
  const bounds = new googleRef.maps.LatLngBounds();

  segments.forEach((segment) => {
    const route = segment.routes?.[0];
    if (route?.bounds) {
      bounds.union(route.bounds);
    }
  });

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, 48);
  }
}

function clearMarkers() {
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
}
