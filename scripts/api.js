// Lightweight wrapper placeholders for Google Maps related API calls.
let mapsSdkPromise;

export function loadGoogleMapsSdk({ apiKey, libraries = [] }) {
  if (mapsSdkPromise) return mapsSdkPromise;
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API 키가 필요합니다."));
  }

  mapsSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      libraries: libraries.join(","),
      v: "weekly",
      language: "ko",
      region: "KR",
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => reject(new Error("Google Maps SDK 로딩 실패"));
    script.onload = () => resolve(window.google);

    document.head.append(script);
  });

  return mapsSdkPromise;
}

export async function requestDirections({
  google,
  origin,
  destination,
  waypoints,
  travelMode = google.maps.TravelMode.TRANSIT,
}) {
  if (!google) {
    throw new Error("Google Maps SDK가 초기화되지 않았습니다.");
  }

  const service = new google.maps.DirectionsService();
  const request = {
    origin,
    destination,
    travelMode,
  };

  if (Array.isArray(waypoints) && waypoints.length) {
    request.waypoints = waypoints.map((location) => ({ location, stopover: true }));
  }

  if (travelMode === google.maps.TravelMode.TRANSIT) {
    request.transitOptions = {
      modes: [google.maps.TransitMode.BUS, google.maps.TransitMode.SUBWAY],
    };
  }

  return new Promise((resolve, reject) => {
    service.route(request, (result, status) => {
      if (status === google.maps.DirectionsStatus.OK) {
        resolve(result);
      } else {
        reject(new Error(`경로 요청 실패: ${status}`));
      }
    });
  });
}
