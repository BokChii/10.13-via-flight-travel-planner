/**
 * 통합된 실시간 공항 복귀 시스템
 * 기존 calculateReturnTimeInfo()와 detectEmergencySituation()을 대체
 * 기존 코드와의 호환성을 유지하면서 점진적으로 개선
 */

import { EMERGENCY_THRESHOLDS, NOTIFICATION_CONFIG, DEFAULT_BUFFER_TIMES, getAirportPosition } from './config.js';

let lastAlertTime = {};
let apiCache = {};

/**
 * 실시간 공항 복귀 정보를 계산합니다
 * @param {Object} state - 현재 애플리케이션 상태
 * @param {Object} progress - 네비게이션 진행률
 * @returns {Promise<Object|null>} 공항 복귀 정보
 */
export async function calculateRealTimeReturnInfo(state, progress) {
  // 네비게이션이 활성화되지 않았으면 null 반환
  if (!state.navigation.active || !state.navigation.currentPosition || !progress) {
    return null;
  }

  const tripMeta = state.tripMeta;
  if (!tripMeta) return null;

  // 원본 출발 시간 우선 사용
  const departureTimeStr = tripMeta.originalDeparture || tripMeta.departure;
  if (!departureTimeStr) return null;

  const departureTime = new Date(departureTimeStr);
  const currentTime = new Date();
  const remainingMinutes = (departureTime - currentTime) / (1000 * 60);

  // 실시간 공항까지 소요시간 계산
  const airportTravelTime = await calculateRealTimeToAirport(state, progress);
  
  // 출국 버퍼 시간을 0분으로 하드코딩
  const returnBufferMinutes = 0;
  
  // 실제 여유 시간 계산
  const actualSlackMinutes = remainingMinutes - airportTravelTime - returnBufferMinutes;

  // 알림 레벨 결정
  const alertLevel = determineAlertLevel(actualSlackMinutes);
  
  // 알림 표시 여부 결정
  const shouldShowAlert = shouldShowAlertForLevel(alertLevel);

  return {
    alertLevel,
    remainingMinutes: Math.round(remainingMinutes),
    airportTravelTime: Math.round(airportTravelTime),
    actualSlackMinutes: Math.round(actualSlackMinutes),
    returnBufferMinutes,
    shouldShowAlert,
    shouldActivateEmergencyMode: alertLevel === 'EMERGENCY'
  };
}

/**
 * 실시간 공항까지 소요시간을 계산합니다 (Google Directions API 사용)
 * @param {Object} state - 현재 애플리케이션 상태
 * @param {Object} progress - 네비게이션 진행률
 * @returns {Promise<number>} 소요시간 (분)
 */
async function calculateRealTimeToAirport(state, progress) {
  const currentPosition = state.navigation.currentPosition;
  const airportPosition = getAirportPosition(state);
  
  if (!currentPosition || !airportPosition) {
    return 30; // 기본값
  }

  // 캐시 확인
  const cacheKey = `${currentPosition.lat},${currentPosition.lng}`;
  const cached = apiCache[cacheKey];
  if (cached && (Date.now() - cached.timestamp) < NOTIFICATION_CONFIG.API_CACHE_DURATION_MS) {
    console.log('캐시된 공항 소요시간 사용:', cached.duration);
    return cached.duration;
  }

  try {
    // Google Directions API로 대중교통 최적 경로 계산
    const transitRoute = await getTransitRouteToAirport(currentPosition, airportPosition);
    const duration = Math.round(transitRoute.duration.value / 60);
    
    // 캐시 저장
    apiCache[cacheKey] = {
      duration,
      timestamp: Date.now()
    };
    
    console.log('실시간 공항 소요시간 계산:', duration, '분');
    return duration;
  } catch (error) {
    console.warn('실시간 경로 계산 실패, 추정값 사용:', error);
    // Fallback: 거리 기반 추정
    const distance = calculateDistance(currentPosition, airportPosition);
    return Math.max(15, Math.round((distance / 1000) * 2.5));
  }
}

/**
 * Google Directions API로 대중교통 경로를 가져옵니다
 * @param {Object} origin - 출발지
 * @param {Object} destination - 목적지
 * @returns {Promise<Object>} 경로 정보
 */
async function getTransitRouteToAirport(origin, destination) {
  if (!window.google || !window.google.maps) {
    throw new Error('Google Maps API가 로드되지 않았습니다.');
  }

  const directionsService = new google.maps.DirectionsService();
  
  return new Promise((resolve, reject) => {
    directionsService.route({
      origin: origin,
      destination: destination,
      travelMode: google.maps.TravelMode.TRANSIT,
      transitOptions: {
        modes: [google.maps.TransitMode.SUBWAY, google.maps.TransitMode.BUS],
        routingPreference: google.maps.TransitRoutePreference.FEWER_TRANSFERS
      }
    }, (result, status) => {
      if (status === 'OK' && result.routes[0]) {
        resolve(result.routes[0].legs[0]);
      } else {
        reject(new Error(`경로 계산 실패: ${status}`));
      }
    });
  });
}

/**
 * 알림 레벨을 결정합니다
 * @param {number} actualSlackMinutes - 실제 여유 시간
 * @returns {string} 알림 레벨
 */
function determineAlertLevel(actualSlackMinutes) {
  if (actualSlackMinutes <= EMERGENCY_THRESHOLDS.EMERGENCY) {
    return 'EMERGENCY';
  } else if (actualSlackMinutes <= EMERGENCY_THRESHOLDS.URGENT) {
    return 'URGENT';
  } else if (actualSlackMinutes <= EMERGENCY_THRESHOLDS.PREPARE) {
    return 'PREPARE';
  } else {
    return 'SAFE';
  }
}

/**
 * 해당 레벨의 알림을 표시해야 하는지 결정합니다
 * @param {string} alertLevel - 알림 레벨
 * @returns {boolean} 알림 표시 여부
 */
function shouldShowAlertForLevel(alertLevel) {
  const now = Date.now();
  const lastTime = lastAlertTime[alertLevel] || 0;
  const cooldownMs = NOTIFICATION_CONFIG.ALERT_COOLDOWN_MINUTES * 60 * 1000;
  
  if (now - lastTime > cooldownMs) {
    lastAlertTime[alertLevel] = now;
    return true;
  }
  
  return false;
}

/**
 * 사용자 친화적인 알림 메시지를 생성합니다
 * @param {Object} returnInfo - 공항 복귀 정보
 * @returns {Object} 알림 메시지 정보
 */
export function generateAirportReturnMessage(returnInfo) {
  if (!returnInfo) return null;

  const { alertLevel, actualSlackMinutes, remainingMinutes, airportTravelTime } = returnInfo;
  const levelConfig = ALERT_LEVELS[alertLevel];
  
  let timeText = '';
  if (actualSlackMinutes >= 60) {
    const hours = Math.floor(actualSlackMinutes / 60);
    const minutes = actualSlackMinutes % 60;
    timeText = hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
  } else {
    timeText = `${actualSlackMinutes}분`;
  }

  const message = levelConfig.message.replace('{time}', timeText);
  
  return {
    level: alertLevel,
    message,
    icon: levelConfig.icon,
    urgency: alertLevel === 'EMERGENCY' ? 'critical' : 
             alertLevel === 'URGENT' ? 'high' : 
             alertLevel === 'PREPARE' ? 'medium' : 'low',
    shouldActivateEmergencyMode: alertLevel === 'EMERGENCY'
  };
}

/**
 * 기존 calculateReturnTimeInfo와 호환되는 형태로 변환합니다
 * @param {Object} returnInfo - 공항 복귀 정보
 * @returns {Object|null} 기존 형태의 반환 시간 정보
 */
export function convertToLegacyFormat(returnInfo) {
  if (!returnInfo) return null;

  const { alertLevel, actualSlackMinutes, remainingMinutes, airportTravelTime } = returnInfo;
  
  let status, icon, title, subtitle;
  
  if (alertLevel === 'EMERGENCY') {
    status = "danger";
    icon = "🚨";
    title = "긴급!";
    subtitle = `출발까지 ${Math.abs(actualSlackMinutes)}분 부족합니다`;
  } else if (alertLevel === 'URGENT') {
    status = "warning";
    icon = "⚠️";
    title = "주의";
    subtitle = `출발까지 ${actualSlackMinutes}분 여유가 있습니다`;
  } else if (alertLevel === 'PREPARE') {
    status = "warning";
    icon = "⏰";
    title = "준비";
    subtitle = `출발까지 ${actualSlackMinutes}분 여유가 있습니다`;
  } else {
    status = "safe";
    icon = "✅";
    title = "여유롭게";
    subtitle = `출발까지 ${actualSlackMinutes}분 여유가 있습니다`;
  }
  
  return {
    status,
    icon,
    title,
    subtitle,
    slackMinutes: actualSlackMinutes,
    timeToDeparture: remainingMinutes,
    shouldShowAlert: returnInfo.shouldShowAlert,
    shouldActivateEmergencyMode: returnInfo.shouldActivateEmergencyMode
  };
}

// 기존 함수들 (emergencyMode.js에서 가져옴)

function calculateDistance(pos1, pos2) {
  const R = 6371000; // 지구 반지름 (미터)
  const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
