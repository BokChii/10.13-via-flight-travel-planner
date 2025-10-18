﻿// Lightweight wrapper placeholders for Google Maps related API calls.
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

/**
 * 두 지점 간의 실제 이동 시간을 계산합니다
 * @param {Object} google - Google Maps SDK
 * @param {string|Object} origin - 출발지
 * @param {string|Object} destination - 도착지
 * @param {string} travelMode - 이동 수단 (기본값: TRANSIT)
 * @returns {Promise<number>} 이동 시간 (분 단위)
 */
export async function calculateTravelTime(google, origin, destination, travelMode = google.maps.TravelMode.TRANSIT) {
  if (!google) {
    throw new Error("Google Maps SDK가 초기화되지 않았습니다.");
  }

  try {
    const result = await requestDirections({
      google,
      origin,
      destination,
      travelMode
    });

    // 첫 번째 경로의 첫 번째 구간의 소요 시간을 분 단위로 반환
    const durationInSeconds = result.routes[0].legs[0].duration.value;
    const durationInMinutes = Math.ceil(durationInSeconds / 60);
    
    return durationInMinutes;
  } catch (error) {
    console.warn('이동 시간 계산 실패, 기본값 사용:', error.message);
    // API 호출 실패 시 기본값 반환 (30분)
    return 30;
  }
}
