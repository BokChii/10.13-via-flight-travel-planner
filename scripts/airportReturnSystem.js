/**
 * 통합된 실시간 공항 복귀 시스템
 * 기존 calculateReturnTimeInfo()와 detectEmergencySituation()을 대체
 * 기존 코드와의 호환성을 유지하면서 점진적으로 개선
 */

import { 
  EMERGENCY_THRESHOLDS, 
  NOTIFICATION_CONFIG, 
  DEFAULT_BUFFER_TIMES, 
  RETURN_ALERT_LEVELS,
  RETURN_ALERT_MESSAGES,
  RETURN_CALCULATION_CONFIG,
  getAirportPosition 
} from './config.js';

let lastAlertTime = {};
let apiCache = {};
let lastCalculationTime = 0;  // 마지막 계산 시간
let lastCalculationPosition = null;  // 마지막 계산 위치

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
  
  // Phase 2: 재경로로 인한 추가 소요 시간 반영
  const rerouteAdditionalMinutes = state.navigation?.rerouteAdditionalMinutes || 0;
  const adjustedAirportTravelTime = airportTravelTime + rerouteAdditionalMinutes;
  
  if (rerouteAdditionalMinutes > 0) {
    console.log('⏱️ [Critical Warning] 재경로 추가 시간 반영', {
      originalTime: airportTravelTime,
      additionalMinutes: rerouteAdditionalMinutes,
      adjustedTime: adjustedAirportTravelTime
    });
  }
  
  // 출국 버퍼 시간과 여유 시간 사용
  const returnBufferMinutes = DEFAULT_BUFFER_TIMES.RETURN_BUFFER_MINUTES; // 45분
  const slackMinutes = DEFAULT_BUFFER_TIMES.RETURN_SLACK_MINUTES; // 20분
  
  // 실제 여유 시간 계산 (버퍼 + 공항 복귀 시간 + 여유 시간)
  const actualSlackMinutes = remainingMinutes - (returnBufferMinutes + adjustedAirportTravelTime + slackMinutes);

  // 알림 레벨 결정
  const alertLevel = determineAlertLevel(actualSlackMinutes);
  
  // 알림 표시 여부 결정
  const shouldShowAlert = shouldShowAlertForLevel(alertLevel);

  return {
    alertLevel,
    remainingMinutes: Math.round(remainingMinutes),
    airportTravelTime: Math.round(airportTravelTime),
    adjustedAirportTravelTime: Math.round(adjustedAirportTravelTime), // 재경로 반영된 시간
    rerouteAdditionalMinutes: rerouteAdditionalMinutes, // 추가 소요 시간
    actualSlackMinutes: Math.round(actualSlackMinutes),
    returnBufferMinutes,
    slackMinutes, // 여유 시간 추가
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

  const now = Date.now();
  const timeSinceLastCalculation = now - lastCalculationTime;
  
  // 위치 변경 거리 계산
  let shouldRecalculate = false;
  if (lastCalculationPosition) {
    const distanceChange = calculateDistance(currentPosition, lastCalculationPosition);
    // 500m 이상 이동했으면 즉시 재계산
    if (distanceChange >= RETURN_CALCULATION_CONFIG.SIGNIFICANT_POSITION_CHANGE_METERS) {
      console.log(`📍 위치 변경 감지 (${Math.round(distanceChange)}m), 즉시 재계산`);
      shouldRecalculate = true;
    }
  } else {
    // 첫 계산이면 재계산 필요
    shouldRecalculate = true;
  }
  
  // 최소 5분마다 재계산 (위치가 변하지 않아도)
  if (timeSinceLastCalculation >= RETURN_CALCULATION_CONFIG.MIN_RECALCULATION_INTERVAL_MS) {
    console.log(`⏰ 최소 재계산 간격 도달 (${Math.round(timeSinceLastCalculation / 1000 / 60)}분), 재계산`);
    shouldRecalculate = true;
  }
  
  // 재계산이 필요하지 않으면 캐시 확인
  if (!shouldRecalculate) {
    const cacheKey = `${currentPosition.lat},${currentPosition.lng}`;
    const cached = apiCache[cacheKey];
    if (cached && (now - cached.timestamp) < NOTIFICATION_CONFIG.API_CACHE_DURATION_MS) {
      console.log('캐시된 공항 소요시간 사용:', cached.duration);
      return cached.duration;
    }
  }

  try {
    // Google Directions API로 대중교통 최적 경로 계산
    const transitRoute = await getTransitRouteToAirport(currentPosition, airportPosition);
    const duration = Math.round(transitRoute.duration.value / 60);
    
    // 캐시 저장 및 계산 시간/위치 업데이트
    const cacheKey = `${currentPosition.lat},${currentPosition.lng}`;
    apiCache[cacheKey] = {
      duration,
      timestamp: now
    };
    
    lastCalculationTime = now;
    lastCalculationPosition = { ...currentPosition };
    
    console.log('✅ 실시간 공항 소요시간 계산:', duration, '분', {
      timeSinceLastCalculation: Math.round(timeSinceLastCalculation / 1000 / 60) + '분',
      shouldRecalculate
    });
    
    return duration;
  } catch (error) {
    console.warn('실시간 경로 계산 실패, 추정값 사용:', error);
    // Fallback: 거리 기반 추정
    const distance = calculateDistance(currentPosition, airportPosition);
    const estimatedDuration = Math.max(15, Math.round((distance / 1000) * 2.5));
    
    // 추정값도 계산 시간/위치 업데이트
    lastCalculationTime = now;
    lastCalculationPosition = { ...currentPosition };
    
    return estimatedDuration;
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
 * 알림 레벨을 결정합니다 (새로운 레벨 기준 사용)
 * @param {number} actualSlackMinutes - 실제 여유 시간
 * @returns {string} 알림 레벨
 */
function determineAlertLevel(actualSlackMinutes) {
  if (actualSlackMinutes <= RETURN_ALERT_LEVELS.EMERGENCY) {
    return 'EMERGENCY';
  } else if (actualSlackMinutes <= RETURN_ALERT_LEVELS.URGENT) {
    return 'URGENT';
  } else if (actualSlackMinutes <= RETURN_ALERT_LEVELS.WARNING) {
    return 'WARNING';
  } else if (actualSlackMinutes <= RETURN_ALERT_LEVELS.PREPARE) {
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
 * @returns {Object|null} 알림 메시지 정보
 */
export function generateAirportReturnMessage(returnInfo) {
  if (!returnInfo) return null;

  const { alertLevel, actualSlackMinutes } = returnInfo;
  
  // SAFE 레벨은 알림 없음
  if (alertLevel === 'SAFE') {
    return null;
  }
  
  // 알림 메시지 가져오기
  const levelConfig = RETURN_ALERT_MESSAGES[alertLevel];
  if (!levelConfig) {
    // 기존 레벨과의 호환성을 위한 fallback
    console.warn(`알림 레벨 ${alertLevel}에 대한 메시지가 정의되지 않았습니다.`);
    return null;
  }
  
  // 시간 정보 추가 (메시지에 이미 포함되어 있지만, 필요시 동적으로 업데이트)
  let message = levelConfig.message;
  
  // 실제 여유 시간이 음수인 경우 (이미 늦은 경우)
  if (actualSlackMinutes < 0) {
    const absMinutes = Math.abs(Math.round(actualSlackMinutes));
    if (alertLevel === 'EMERGENCY') {
      message = `🚨 긴급! 공항 복귀까지 ${absMinutes}분 부족합니다. 즉시 공항으로 가세요!`;
    }
  }
  
  return {
    level: alertLevel,
    message,
    icon: levelConfig.icon,
    urgency: levelConfig.urgency,
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
