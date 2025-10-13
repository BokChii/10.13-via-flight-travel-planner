// Reads configuration values exposed through DOM metadata.
const META_GOOGLE_MAPS_KEY = "google-maps-api-key";

export function getGoogleMapsApiKey() {
  const metaTag = document.querySelector(`meta[name="${META_GOOGLE_MAPS_KEY}"]`);
  const value = metaTag?.content?.trim();
  return value || "";
}

// ===== 통합된 설정값들 =====

// 공항 및 도시 좌표
export const LOCATIONS = {
  // 기본 공항 (fallback)
  DEFAULT_AIRPORT: {
    label: '인천국제공항 제1여객터미널',
    address: '인천광역시 중구 공항로 272',
    location: { lat: 37.449796, lng: 126.451244 },
    placeId: null,
  },
  
  // 기본 도시 중심점
  DEFAULT_CITY_CENTER: { lat: 37.5665, lng: 126.978 }, // 서울
};

// 긴급 모드 및 공항 복귀 임계값 (통합)
export const EMERGENCY_THRESHOLDS = {
  // 공항 복귀 알림 레벨 (분)
  SAFE: 60,        // 60분 이상: 안전
  PREPARE: 30,     // 30분 이상: 준비 단계
  URGENT: 15,      // 15분 이상: 긴급
  EMERGENCY: 0,    // 0분 이상: 비상
  
  // 기존 emergencyMode.js와의 호환성을 위한 별칭
  CRITICAL: 10,    // 10분 이하: 매우 긴급
  DANGER: 20,      // 20분 이하: 위험
  WARNING: 45,     // 45분 이하: 주의
};

// 알림 및 UI 설정
export const NOTIFICATION_CONFIG = {
  // 알림 빈도 제어 (분)
  ALERT_COOLDOWN_MINUTES: 10,
  
  // API 호출 캐싱 (밀리초)
  API_CACHE_DURATION_MS: 5 * 60 * 1000, // 5분
  
  // Toast 알림 설정
  TOAST_COOLDOWN_MS: 15_000,
  TOAST_DISTANCE_THRESHOLD_METERS: 30,
  
  // 타이머 간격
  RETURN_DEADLINE_TIMER_INTERVAL_MS: 30_000, // 30초
};

// 플래너 설정
export const PLANNER_CONFIG = {
  MAX_CATEGORY_SELECTION: 3,
  MAX_RECOMMENDED_STOPS: 3,
  DEFAULT_CATEGORY_PRESET: ['culture', 'food', 'view'],
  MIN_STAY_MINUTES: 20,
  MAX_STAY_MINUTES: 240,
  DEFAULT_SEARCH_RADIUS_METERS: 15_000,
};

// 카테고리별 기본 체류 시간 (분)
export const CATEGORY_STAY_TIMES = {
  food: 90,
  shopping: 75,
  culture: 90,
  nature: 60,
  view: 60,
};

// 기본 버퍼 시간 (분)
export const DEFAULT_BUFFER_TIMES = {
  RETURN_BUFFER_MINUTES: 30,
  ENTRY_BUFFER_MINUTES: 30,
};

// ===== 공통 유틸리티 함수들 =====

/**
 * 공항 위치를 가져옵니다 (통합된 함수)
 * @param {Object} state - 현재 애플리케이션 상태
 * @returns {Object|null} 공항 위치 정보
 */
export function getAirportPosition(state) {
  const tripMeta = state.tripMeta;
  if (!tripMeta) {
    console.log('getAirportPosition: tripMeta가 없습니다');
    return null;
  }

  // tripMeta에서 실제 공항 정보 가져오기
  if (tripMeta.airportPosition) {
    console.log('getAirportPosition: tripMeta.airportPosition 사용:', tripMeta.airportPosition);
    return tripMeta.airportPosition;
  }
  
  // index.html에서 설정한 공항 정보 확인
  if (tripMeta.returnAirport && tripMeta.returnAirport.location) {
    console.log('getAirportPosition: tripMeta.returnAirport.location 사용:', tripMeta.returnAirport.location);
    return tripMeta.returnAirport.location;
  }
  
  // Fallback: 기본 공항
  console.log('getAirportPosition: Fallback 기본 공항 사용');
  return LOCATIONS.DEFAULT_AIRPORT.location;
}

