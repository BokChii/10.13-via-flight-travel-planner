let watchId = null;

export function beginNavigationTracking({ onPosition, onError }) {
  if (!('geolocation' in navigator)) {
    onError?.(new Error('이 브라우저는 위치 정보를 지원하지 않습니다.'));
    return () => {};
  }

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onPosition?.({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: pos.timestamp,
      });
    },
    (error) => {
      onError?.(error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 20_000,
    }
  );

  return () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  };
}
