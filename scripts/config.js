// Reads configuration values exposed through DOM metadata.
const META_GOOGLE_MAPS_KEY = "google-maps-api-key";
const META_OPENAI_KEY = "openai-api-key";

export function getGoogleMapsApiKey() {
  const metaTag = document.querySelector(`meta[name="${META_GOOGLE_MAPS_KEY}"]`);
  const value = metaTag?.content?.trim();
  return value || "";
}

/**
 * OpenAI API 키 가져오기
 */
export function getOpenAIApiKey() {
  const metaTag = document.querySelector(`meta[name="${META_OPENAI_KEY}"]`);
  const value = metaTag?.content?.trim();
  // 플레이스홀더 값이면 빈 문자열 반환
  if (value === 'YOUR_OPENAI_API_KEY' || !value) {
    return "";
  }
  return value;
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
  RETURN_BUFFER_MINUTES: 45,  // 공항 입국 버퍼 (45분)
  RETURN_SLACK_MINUTES: 20,    // 여유 시간 (20분)
  ENTRY_BUFFER_MINUTES: 30,
};

// 공항 복귀 알림 레벨 (분) - 사용자 요구사항 반영
export const RETURN_ALERT_LEVELS = {
  SAFE: 20,      // 20분 이상: 안전 (알림 없음)
  PREPARE: 15,   // 15분 전: 간단한 알림
  WARNING: 10,   // 10분 전: 강조 알림
  URGENT: 5,     // 5분 전: 더 강조
  EMERGENCY: 0   // 0분 이하: 비상
};

// 공항 복귀 알림 메시지 템플릿
export const RETURN_ALERT_MESSAGES = {
  PREPARE: {
    icon: '⏰',
    message: '공항 복귀까지 약 20분 남았습니다',
    urgency: 'low'
  },
  WARNING: {
    icon: '⚠️',
    message: '공항 복귀까지 15분 남았습니다. 이동 준비를 시작하세요',
    urgency: 'medium'
  },
  URGENT: {
    icon: '🚨',
    message: '공항 복귀까지 10분 남았습니다. 지금 공항으로 향하세요',
    urgency: 'high'
  },
  EMERGENCY: {
    icon: '🚨',
    message: '긴급! 공항 복귀까지 5분 남았습니다. 즉시 공항으로 가세요',
    urgency: 'critical'
  }
};

// 공항 복귀 계산 설정
export const RETURN_CALCULATION_CONFIG = {
  // 최소 재계산 간격 (밀리초) - 5분
  MIN_RECALCULATION_INTERVAL_MS: 5 * 60 * 1000,
  
  // 의미 있는 위치 변경 거리 (미터) - 500m 이상 이동 시 즉시 재계산
  SIGNIFICANT_POSITION_CHANGE_METERS: 500,
};

// 경로 이탈 감지 설정 (Phase 1)
export const ROUTE_DEVIATION_CONFIG = {
  // 이탈 임계값 (미터)
  DEVIATION_THRESHOLD_METERS: 200,
  
  // 이탈 지속 시간 (초) - 이 시간 이상 지속되면 이탈로 판단
  DEVIATION_DURATION_SECONDS: 5,
  
  // 복귀 확인 시간 (초) - 이 시간 동안 경로 내에 있어야 복귀로 판단
  RECOVERY_DURATION_SECONDS: 3,
  
  // GPS 정확도 임계값 (미터)
  LOW_ACCURACY_THRESHOLD_METERS: 50,
  VERY_LOW_ACCURACY_THRESHOLD_METERS: 100,
  
  // 알림 쿨다운 (밀리초)
  DEVIATION_ALERT_COOLDOWN_MS: 30_000, // 30초
};

// 자동 재경로 계산 설정 (Phase 2)
export const REROUTE_CONFIG = {
  // 재경로 제안 조건: 이탈 지속 시간 (초)
  REROUTE_SUGGESTION_DURATION_SECONDS: 10, // 10초 이상 이탈 시 재경로 제안
  
  // 재경로 계산 재시도 제한
  MAX_REROUTE_ATTEMPTS: 3,
  
  // 재경로 계산 쿨다운 (밀리초) - 같은 위치에서 반복 계산 방지
  REROUTE_COOLDOWN_MS: 60_000, // 60초
};

// 경유지 도착 감지 설정
export const WAYPOINT_ARRIVAL_CONFIG = {
  // 경유지 도착 감지 거리 임계값 (미터) - 이 거리 이내에 있으면 도착으로 판단
  ARRIVAL_DISTANCE_THRESHOLD_METERS: 50,
  
  // 경유지 도착 알림 쿨다운 (밀리초) - 같은 경유지에 대한 중복 알림 방지
  ARRIVAL_ALERT_COOLDOWN_MS: 60_000, // 60초
};

// 네비게이션 상태 타입 (Phase 1)
export const NAVIGATION_STATUS = {
  NORMAL: 'normal',
  DEVIATED: 'deviated',
  REROUTING: 'rerouting',
  LOW_ACCURACY: 'low_accuracy',
  ERROR: 'error'
};

// ===== 공통 유틸리티 함수들 =====

/**
 * 공항 위치를 가져옵니다 (통합된 함수)
 * @param {Object} state - 현재 애플리케이션 상태
 * @returns {Object|null} 공항 위치 정보
 */
export function getAirportPosition(state) {
  // tripMeta에서 공항 정보 확인
  const tripMeta = state.tripMeta;
  if (tripMeta) {
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
  }
  
  // tripMeta가 없을 때 state.destination 확인 (네비게이션 모드에서 사용)
  if (state.destination && state.destination.location) {
    console.log('getAirportPosition: state.destination.location 사용:', state.destination.location);
    return state.destination.location;
  }
  
  // Fallback: 기본 공항
  console.log('getAirportPosition: Fallback 기본 공항 사용');
  return LOCATIONS.DEFAULT_AIRPORT.location;
}

