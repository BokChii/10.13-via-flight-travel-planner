// Lightweight wrapper placeholders for Google Maps related API calls.
import { handleError, ErrorCodes, getDirectionsErrorMessage, createError } from './errorHandler.js';
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
    script.onerror = () => {
      const error = createError(
        ErrorCodes.MAP_LOAD_FAILED,
        "Google Maps SDK를 불러오지 못했습니다. 네트워크 연결을 확인해주세요."
      );
      reject(error);
    };
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
        // 사용자 친화적 에러 메시지로 변환
        const userMessage = getDirectionsErrorMessage(status, google);
        const error = createError(ErrorCodes.DIRECTIONS_FAILED, userMessage);
        error.directionsStatus = status;
        reject(error);
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
    // 조용히 처리 (경고 로그만, 사용자 알림 없음)
    handleError(error, {
      context: 'calculateTravelTime',
      silent: true,
      showToast: false,
      logToConsole: true,
    });
    // API 호출 실패 시 기본값 반환 (30분)
    return 30;
  }
}

/**
 * 출발지에서 여러 목적지까지의 이동 시간을 한 번에 계산합니다 (Distance Matrix API)
 * @param {Object} google - Google Maps SDK
 * @param {Object|string} originLL - 출발지 위치
 * @param {Array<Object|string>} destLLs - 목적지 위치 배열
 * @param {string} travelMode - 이동 수단 (기본값: TRANSIT)
 * @returns {Promise<Array<number>>} 각 목적지까지의 이동 시간 배열 (초 단위, 실패 시 무한대)
 */
export function matrixDurations(google, originLL, destLLs, travelMode = null) {
  if (!google) {
    return Promise.resolve(destLLs.map(() => Number.POSITIVE_INFINITY));
  }

  const mode = travelMode || google.maps.TravelMode.TRANSIT;

  return new Promise((resolve) => {
    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix({
      origins: [originLL],
      destinations: destLLs,
      travelMode: mode,
      unitSystem: google.maps.UnitSystem.METRIC,
      transitOptions: mode === google.maps.TravelMode.TRANSIT ? {
        modes: [google.maps.TransitMode.SUBWAY, google.maps.TransitMode.BUS],
        routingPreference: google.maps.TransitRoutePreference.FEWER_TRANSFERS
      } : undefined
    }, (result, status) => {
      if (status !== google.maps.DistanceMatrixStatus.OK) {
        // 실패 시 무한대 반환하여 Greedy 알고리즘이 해당 경유지를 건너뛰도록 함
        console.warn('Distance Matrix API 호출 실패:', status);
        resolve(destLLs.map(() => Number.POSITIVE_INFINITY));
        return;
      }

      const row = result.rows?.[0]?.elements || [];
      resolve(row.map(element => {
        if (element.status === google.maps.DistanceMatrixElementStatus.OK && element.duration) {
          return element.duration.value; // 초 단위
        }
        return Number.POSITIVE_INFINITY;
      }));
    });
  });
}
