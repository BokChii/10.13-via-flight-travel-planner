/**
 * Emergency Mode Module
 * 긴급 상황 감지 및 공항 복귀 모드를 관리합니다.
 * 사용자의 여행 진행률, 위치, 남은 일정을 기반으로 긴급 상황을 판단하고 대응합니다.
 */

import { getCurrentLocationContext, generateLocationDescription } from './locationContext.js';
import { getCurrentWaypointContext } from './navigationUi.js';
import { EMERGENCY_THRESHOLDS, DEFAULT_BUFFER_TIMES, getAirportPosition } from './config.js';

/**
 * 긴급 상황을 감지합니다
 * @param {Object} state - 현재 애플리케이션 상태
 * @param {Object} progress - 네비게이션 진행률
 * @returns {Object|null} 긴급 상황 정보 또는 null
 */
export function detectEmergencySituation(state, progress) {
  const tripMeta = state.tripMeta;
  if (!tripMeta) return null;

  // 네비게이션이 활성화되지 않았으면 긴급 모드 비활성화
  if (!state.navigation.active) {
    console.log('긴급 모드 체크: 네비게이션이 비활성화 상태');
    return null;
  }
  
  // 사용자 위치가 없으면 긴급 모드 비활성화
  if (!state.navigation.currentPosition) {
    console.log('긴급 모드 체크: 사용자 위치 정보 없음');
    return null;
  }
  
  // 진행률 정보가 없으면 긴급 모드 비활성화
  if (!progress) {
    console.log('긴급 모드 체크: 진행률 정보 없음');
    return null;
  }

  // 원본 출발 시간 우선 사용
  const departureTimeStr = tripMeta.originalDeparture || tripMeta.departure;
  if (!departureTimeStr) return null;
  
  const departureTime = new Date(departureTimeStr);
  const currentTime = new Date();
  const remainingMinutes = (departureTime - currentTime) / (1000 * 60);

  // 공항까지의 예상 이동 시간 계산
  const estimatedTravelTime = estimateTravelTimeToAirport(state, progress);
  
  // 복귀 버퍼 시간을 0분으로 하드코딩
  const returnBufferMinutes = 0;
  
  // 실제 여유 시간 계산
  const actualSlackMinutes = remainingMinutes - estimatedTravelTime - returnBufferMinutes;

  // 긴급 상황 레벨 결정
  let emergencyLevel = 'SAFE';
  if (actualSlackMinutes <= EMERGENCY_THRESHOLDS.CRITICAL) {
    emergencyLevel = 'CRITICAL';
  } else if (actualSlackMinutes <= EMERGENCY_THRESHOLDS.DANGER) {
    emergencyLevel = 'DANGER';
  } else if (actualSlackMinutes <= EMERGENCY_THRESHOLDS.WARNING) {
    emergencyLevel = 'WARNING';
  }

  return {
    emergencyLevel,
    remainingMinutes: Math.round(remainingMinutes),
    estimatedTravelTime: Math.round(estimatedTravelTime),
    actualSlackMinutes: Math.round(actualSlackMinutes),
    returnBufferMinutes,
    shouldActivateEmergencyMode: emergencyLevel === 'CRITICAL' || emergencyLevel === 'DANGER'
  };
}

/**
 * 공항까지의 예상 이동 시간을 계산합니다
 * @param {Object} state - 현재 애플리케이션 상태
 * @param {Object} progress - 네비게이션 진행률
 * @returns {number} 예상 이동 시간 (분)
 */
function estimateTravelTimeToAirport(state, progress) {
  const currentPosition = state.navigation.currentPosition;
  if (!currentPosition) return 30; // 기본값을 30분으로 줄임

  const airportPosition = getAirportPosition(state);
  if (!airportPosition) return 30;

  const distance = calculateDistance(currentPosition, airportPosition);
  const distanceKm = distance / 1000;
  
  // 더 현실적인 시간 계산
  // 도심: 1km당 3분, 고속도로: 1km당 1.5분
  // 평균적으로 km당 2.5분으로 계산하되, 최소 15분, 최대 120분으로 제한
  const estimatedTime = Math.max(15, Math.min(120, distanceKm * 2.5));
  
  // 교통 상황 고려 (현재 시간대)
  const trafficFactor = getTrafficFactor();
  const finalTime = Math.round(estimatedTime * trafficFactor);
  
  console.log(`공항까지 예상 이동 시간 계산: ${distanceKm.toFixed(1)}km → ${finalTime}분 (교통상황: ${trafficFactor}x)`);
  return finalTime;
}

/**
 * 두 지점 간의 거리를 계산합니다 (Haversine 공식)
 * @param {Object} pos1 - 첫 번째 위치
 * @param {Object} pos2 - 두 번째 위치
 * @returns {number} 거리 (미터)
 */
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

/**
 * 현재 시간대의 교통 상황을 고려한 팩터를 반환합니다
 * @returns {number} 교통 팩터 (1.0 = 정상, 1.5 = 혼잡)
 */
function getTrafficFactor() {
  const hour = new Date().getHours();
  
  // 출퇴근 시간대 교통 혼잡
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
    return 1.5;
  }
  
  // 점심 시간대 약간의 혼잡
  if (hour >= 12 && hour <= 14) {
    return 1.2;
  }
  
  return 1.0;
}

/**
 * 긴급 모드를 활성화합니다
 * @param {Object} emergencyData - 긴급 상황 데이터
 * @param {Object} state - 현재 애플리케이션 상태
 */
export async function activateEmergencyMode(emergencyData, state) {
  emergencyModeActive = true;
  emergencyModeData = {
    ...emergencyData,
    activatedAt: Date.now(),
    originalState: state
  };

  // 긴급 모드 UI 활성화
  document.body.classList.add('emergency-mode');
  
  // 긴급 알림 표시
  showEmergencyNotification(emergencyData);
  
  // 공항 복귀 경로 계산 및 모달 표시
  try {
    const routeData = await calculateAirportReturnRoute(state);
    showAirportReturnModal(routeData, state);
  } catch (error) {
    console.error('공항 복귀 경로 계산 실패:', error);
    // 경로 계산 실패 시에도 모달 표시 (경로 정보 없이)
    showAirportReturnModal(null, state);
  }
  
  console.log('긴급 모드 활성화:', emergencyData);
}

/**
 * 긴급 모드를 비활성화합니다
 */
export function deactivateEmergencyMode() {
  emergencyModeActive = false;
  emergencyModeData = null;
  
  // 긴급 모드 UI 비활성화
  document.body.classList.remove('emergency-mode');
  
  console.log('긴급 모드 비활성화');
}

/**
 * 긴급 모드 상태를 반환합니다
 * @returns {Object} 긴급 모드 상태
 */
export function getEmergencyModeStatus() {
  return {
    active: emergencyModeActive,
    data: emergencyModeData
  };
}

/**
 * 긴급 알림을 표시합니다
 * @param {Object} emergencyData - 긴급 상황 데이터
 */
function showEmergencyNotification(emergencyData) {
  const { emergencyLevel, actualSlackMinutes, estimatedTravelTime } = emergencyData;
  
  let message = '';
  let type = 'warning';
  
  switch (emergencyLevel) {
    case 'CRITICAL':
      message = `🚨 긴급! 출발까지 ${Math.abs(actualSlackMinutes)}분 부족합니다! 지금 즉시 공항으로 가세요!`;
      type = 'error';
      break;
    case 'DANGER':
      message = `⚠️ 위험! 공항까지 ${estimatedTravelTime}분 소요 예상. 지금 공항으로 향하세요!`;
      type = 'error';
      break;
    case 'WARNING':
      message = `⏰ 주의! 시간이 촉박합니다. 공항 복귀를 준비하세요.`;
      type = 'warning';
      break;
  }
  
  // 토스트 알림 표시 (기존 toast 모듈 사용)
  if (window.showToast) {
    window.showToast({ message, type });
  }
}

/**
 * 긴급 상황에 대한 구체적인 행동 지침을 생성합니다
 * @param {Object} emergencyData - 긴급 상황 데이터
 * @param {Object} state - 현재 애플리케이션 상태
 * @returns {Object} 행동 지침 정보
 */
export function generateEmergencyGuidance(emergencyData, state) {
  const { emergencyLevel, actualSlackMinutes, estimatedTravelTime } = emergencyData;
  
  const guidance = {
    level: emergencyLevel,
    primaryAction: '',
    secondaryActions: [],
    transportRecommendation: '',
    urgencyMessage: ''
  };
  
  switch (emergencyLevel) {
    case 'CRITICAL':
      guidance.primaryAction = '즉시 택시를 타고 공항으로 가세요!';
      guidance.transportRecommendation = '택시 (가장 빠름)';
      guidance.urgencyMessage = '시간이 부족합니다!';
      guidance.secondaryActions = [
        '공항에 연락하여 상황 설명',
        '체크인 시간 확인',
        '짐 정리 및 이동 준비'
      ];
      break;
      
    case 'DANGER':
      guidance.primaryAction = '지금 공항으로 향하세요!';
      guidance.transportRecommendation = '택시 또는 지하철 (빠른 경로)';
      guidance.urgencyMessage = '서둘러 이동하세요!';
      guidance.secondaryActions = [
        '현재 위치에서 가장 빠른 교통수단 선택',
        '공항 도착 예상 시간 확인',
        '체크인 마감 시간 확인'
      ];
      break;
      
    case 'WARNING':
      guidance.primaryAction = '공항 복귀를 준비하세요';
      guidance.transportRecommendation = '지하철 또는 버스 (경제적)';
      guidance.urgencyMessage = '시간을 체크하세요';
      guidance.secondaryActions = [
        '현재 활동 마무리',
        '공항까지의 경로 확인',
        '체크인 시간 확인'
      ];
      break;
      
    default:
      guidance.primaryAction = '여유롭게 즐기세요';
      guidance.transportRecommendation = '대중교통 이용 가능';
      guidance.urgencyMessage = '충분한 시간이 있습니다';
  }
  
  return guidance;
}

/**
 * 실시간 공항 복귀 경로를 계산합니다
 * @param {Object} state - 현재 애플리케이션 상태
 * @returns {Promise<Object>} 공항 복귀 경로 정보
 */
export async function calculateAirportReturnRoute(state) {
  const currentPosition = state.navigation.currentPosition;
  const tripMeta = state.tripMeta;
  
  if (!currentPosition || !tripMeta) {
    throw new Error('현재 위치 또는 여행 정보를 찾을 수 없습니다.');
  }

  const airportPosition = getAirportPosition(state);
  const currentTime = new Date();
  const departureTime = new Date(tripMeta.departure);
  const remainingMinutes = (departureTime - currentTime) / (1000 * 60);

  try {
    // Google Directions API를 사용하여 경로 계산
    const routes = await Promise.all([
      getRouteByTransport(currentPosition, airportPosition, 'driving'), // 택시
      getRouteByTransport(currentPosition, airportPosition, 'transit'),  // 대중교통
    ]);

    const routeData = {
      currentLocation: currentPosition,
      airportPosition: airportPosition,
      departureTime: departureTime,
      remainingMinutes: Math.round(remainingMinutes),
      routes: {
        taxi: processRouteData(routes[0], 'taxi'),
        transit: processRouteData(routes[1], 'transit')
      },
      recommendations: generateTransportRecommendations(routes, remainingMinutes)
    };

    return routeData;
  } catch (error) {
    console.error('공항 복귀 경로 계산 실패:', error);
    // Fallback: 기본 추정값 사용
    return generateFallbackRouteData(currentPosition, airportPosition, remainingMinutes);
  }
}

/**
 * 교통수단별 경로를 가져옵니다
 * @param {Object} origin - 출발지
 * @param {Object} destination - 목적지
 * @param {string} mode - 교통수단 ('driving', 'transit')
 * @returns {Promise<Object>} 경로 정보
 */
async function getRouteByTransport(origin, destination, mode) {
  if (!window.google || !window.google.maps) {
    throw new Error('Google Maps API가 로드되지 않았습니다.');
  }

  const directionsService = new google.maps.DirectionsService();
  
  return new Promise((resolve, reject) => {
    directionsService.route({
      origin: origin,
      destination: destination,
      travelMode: mode === 'driving' ? google.maps.TravelMode.DRIVING : google.maps.TravelMode.TRANSIT,
      transitOptions: mode === 'transit' ? {
        modes: [google.maps.TransitMode.SUBWAY, google.maps.TransitMode.BUS],
        routingPreference: google.maps.TransitRoutePreference.FEWER_TRANSFERS
      } : undefined
    }, (result, status) => {
      if (status === 'OK') {
        resolve(result);
      } else {
        reject(new Error(`경로 계산 실패: ${status}`));
      }
    });
  });
}

/**
 * 경로 데이터를 처리합니다
 * @param {Object} route - Google Directions API 결과
 * @param {string} transportType - 교통수단 타입
 * @returns {Object} 처리된 경로 데이터
 */
function processRouteData(route, transportType) {
  if (!route || !route.routes[0]) {
    return null;
  }

  const routeInfo = route.routes[0];
  const leg = routeInfo.legs[0];
  
  return {
    duration: Math.round(leg.duration.value / 60), // 분 단위
    distance: leg.distance.value, // 미터 단위
    distanceText: leg.distance.text,
    durationText: leg.duration.text,
    steps: routeInfo.legs[0].steps || [],
    cost: estimateCost(transportType, leg.distance.value),
    transportType: transportType
  };
}

/**
 * 교통수단별 비용을 추정합니다
 * @param {string} transportType - 교통수단 타입
 * @param {number} distanceMeters - 거리 (미터)
 * @returns {Object} 비용 정보
 */
function estimateCost(transportType, distanceMeters) {
  const distanceKm = distanceMeters / 1000;
  
  switch (transportType) {
    case 'taxi':
      const baseFare = 3800; // 기본 요금
      const perKm = 100; // km당 요금
      const totalCost = baseFare + (distanceKm * perKm);
      return {
        amount: Math.round(totalCost),
        currency: 'KRW',
        text: `₩${Math.round(totalCost).toLocaleString()}`
      };
      
    case 'transit':
      return {
        amount: 4000,
        currency: 'KRW', 
        text: '₩4,000'
      };
      
    default:
      return {
        amount: 0,
        currency: 'KRW',
        text: '비용 정보 없음'
      };
  }
}

/**
 * 교통수단별 추천을 생성합니다
 * @param {Array} routes - 경로 정보 배열
 * @param {number} remainingMinutes - 남은 시간 (분)
 * @returns {Object} 추천 정보
 */
function generateTransportRecommendations(routes, remainingMinutes) {
  const taxiRoute = routes[0];
  const transitRoute = routes[1];
  
  let recommended = 'transit';
  let reason = '경제적이고 충분한 시간이 있습니다';
  
  // 긴급 상황일 때는 택시 추천
  if (remainingMinutes < 60) {
    recommended = 'taxi';
    reason = '시간이 촉박하여 가장 빠른 방법입니다';
  } else if (remainingMinutes < 90) {
    // 시간이 부족할 때는 택시 고려
    if (taxiRoute && transitRoute && taxiRoute.duration < transitRoute.duration + 20) {
      recommended = 'taxi';
      reason = '시간 절약을 위해 택시를 고려하세요';
    }
  }
  
  return {
    recommended: recommended,
    reason: reason,
    urgency: remainingMinutes < 30 ? 'high' : remainingMinutes < 60 ? 'medium' : 'low'
  };
}

/**
 * Fallback 경로 데이터를 생성합니다 (API 실패 시)
 * @param {Object} currentPosition - 현재 위치
 * @param {Object} airportPosition - 공항 위치
 * @param {number} remainingMinutes - 남은 시간
 * @returns {Object} Fallback 경로 데이터
 */
function generateFallbackRouteData(currentPosition, airportPosition, remainingMinutes) {
  const distance = calculateDistance(currentPosition, airportPosition);
  const estimatedTaxiTime = Math.round((distance / 1000) * 2); // km당 2분
  const estimatedTransitTime = Math.round(estimatedTaxiTime * 1.5);
  
  return {
    currentLocation: currentPosition,
    airportPosition: airportPosition,
    remainingMinutes: Math.round(remainingMinutes),
    routes: {
      taxi: {
        duration: estimatedTaxiTime,
        distance: distance,
        distanceText: `${Math.round(distance/1000)}km`,
        durationText: `${estimatedTaxiTime}분`,
        cost: estimateCost('taxi', distance),
        transportType: 'taxi'
      },
      transit: {
        duration: estimatedTransitTime,
        distance: distance,
        distanceText: `${Math.round(distance/1000)}km`,
        durationText: `${estimatedTransitTime}분`,
        cost: estimateCost('transit', distance),
        transportType: 'transit'
      }
    },
    recommendations: generateTransportRecommendations([
      { duration: estimatedTaxiTime },
      { duration: estimatedTransitTime }
    ], remainingMinutes)
  };
}

/**
 * 공항 복귀 모달을 표시합니다
 * @param {Object} routeData - 경로 데이터
 * @param {Object} state - 현재 상태
 */
export function showAirportReturnModal(routeData, state) {
  // 기존 모달이 있으면 제거
  const existingModal = document.getElementById('emergency-return-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'emergency-return-modal';
  modal.className = 'emergency-return-modal';
  
  const currentLocation = routeData?.currentLocation || state?.navigation?.currentPosition;
  const routes = routeData?.routes;
  const recommendations = routeData?.recommendations;
  const remainingMinutes = routeData?.remainingMinutes;
  
  // 현재 위치 정보 가져오기
  if (currentLocation) {
    getCurrentLocationContext(currentLocation).then(locationContext => {
      const locationDesc = locationContext ? 
        generateLocationDescription(locationContext) : 
        '현재 위치';
      
      modal.innerHTML = `
        <div class="emergency-return-content">
          <div class="emergency-return-header">
            <h2>🚨 긴급 복귀 모드</h2>
            <p>공항 복귀까지 시간이 부족합니다. 남은 일정을 취소하고 공항으로 복귀하시겠습니까?</p>
          </div>
          
          <div class="current-info">
            <p><strong>📍 현재 위치:</strong> ${locationDesc}</p>
            ${routeData?.departureTime ? `<p><strong>✈️ 출발 시간:</strong> ${routeData.departureTime.toLocaleString()}</p>` : ''}
            ${remainingMinutes ? `<p><strong>⏰ 남은 시간:</strong> ${remainingMinutes}분</p>` : ''}
          </div>
          
          ${routes ? `
            <div class="transport-options" id="return-options">
              ${generateTransportOptionsHTML(routes, recommendations)}
            </div>
          ` : '<p style="text-align: center; color: #666; margin: 16px 0;">경로 정보를 불러오는 중...</p>'}
          
          <div class="emergency-actions">
            <button class="btn-emergency btn-cancel" onclick="closeAirportReturnModal()">취소</button>
            <button class="btn-emergency btn-confirm" onclick="startEmergencyNavigation('transit')">
              확인 - 공항으로 복귀
            </button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
    });
  } else {
    // 위치 정보가 없을 때
    modal.innerHTML = `
      <div class="emergency-return-content">
        <div class="emergency-return-header">
          <h2>🚨 긴급 복귀 모드</h2>
          <p>공항 복귀까지 시간이 부족합니다. 남은 일정을 취소하고 공항으로 복귀하시겠습니까?</p>
        </div>
        
        <div class="current-info">
          <p><strong>⚠️ 현재 위치를 확인할 수 없습니다.</strong></p>
        </div>
        
        <div class="emergency-actions">
          <button class="btn-emergency btn-cancel" onclick="closeAirportReturnModal()">취소</button>
          <button class="btn-emergency btn-confirm" onclick="startEmergencyNavigation('transit')">
            확인 - 공항으로 복귀
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
}

/**
 * 교통수단 옵션 HTML을 생성합니다
 * @param {Object} routes - 경로 정보
 * @param {Object} recommendations - 추천 정보
 * @returns {string} HTML 문자열
 */
function generateTransportOptionsHTML(routes, recommendations) {
  let html = '';
  
  // 택시 옵션
  if (routes.taxi) {
    const isRecommended = recommendations.recommended === 'taxi';
    html += `
      <div class="return-option ${isRecommended ? 'recommended' : ''}">
        <div class="transport-icon">🚕</div>
        <div class="transport-info">
          <h3>택시 ${isRecommended ? '(추천)' : ''}</h3>
          <p>⏰ ${routes.taxi.durationText}</p>
          <p>💰 ${routes.taxi.cost.text}</p>
          <p>📍 ${routes.taxi.distanceText}</p>
        </div>
        <button class="btn-action" onclick="selectTransport('taxi')">선택</button>
      </div>
    `;
  }
  
  // 대중교통 옵션
  if (routes.transit) {
    const isRecommended = recommendations.recommended === 'transit';
    html += `
      <div class="return-option ${isRecommended ? 'recommended' : ''}">
        <div class="transport-icon">🚇</div>
        <div class="transport-info">
          <h3>대중교통 ${isRecommended ? '(추천)' : ''}</h3>
          <p>⏰ ${routes.transit.durationText}</p>
          <p>💰 ${routes.transit.cost.text}</p>
          <p>📍 ${routes.transit.distanceText}</p>
        </div>
        <button class="btn-action" onclick="selectTransport('transit')">선택</button>
      </div>
    `;
  }
  
  return html;
}

// 전역 함수들 (window 객체에 추가)
window.closeAirportReturnModal = function() {
  const modal = document.getElementById('emergency-return-modal');
  if (modal) {
    modal.remove();
  }
};

window.startEmergencyNavigation = async function(transportType = 'transit') {
  console.log(`긴급 네비게이션 시작: ${transportType}`);
  
  // 모달 닫기
  window.closeAirportReturnModal();
  
  // main.js의 전역 변수/함수 접근을 위한 체크
  if (typeof window.getState === 'undefined' || typeof window.updateState === 'undefined') {
    console.error('필요한 함수를 찾을 수 없습니다.');
    if (window.showToast) {
      window.showToast({
        message: '시스템 오류가 발생했습니다.',
        type: 'error'
      });
    }
    return;
  }
  
  const state = window.getState();
  if (!state) {
    console.error('상태를 가져올 수 없습니다.');
    return;
  }
  
  const currentPosition = state.navigation?.currentPosition;
  const airportPosition = getAirportPosition(state);
  
  if (!currentPosition || !airportPosition) {
    console.error('현재 위치 또는 공항 위치를 찾을 수 없습니다.');
    if (window.showToast) {
      window.showToast({
        message: '현재 위치 또는 공항 위치를 확인할 수 없습니다.',
        type: 'error'
      });
    }
    return;
  }
  
  try {
    // 1. 일정 취소: waypoints와 routePlan 초기화
    window.updateState((draft) => {
      draft.waypoints = [];
      draft.routePlan = null;
    });
    
    // 2. 기존 경로 제거
    if (typeof window.clearRoute !== 'undefined') {
      window.clearRoute();
    }
    
    // 3. 공항 복귀 경로 계산 (가장 빠른 대중교통)
    if (!window.google || !window.google.maps) {
      throw new Error('Google Maps API가 로드되지 않았습니다.');
    }
    
    const directionsService = new window.google.maps.DirectionsService();
    
    const directionsResult = await new Promise((resolve, reject) => {
      directionsService.route({
        origin: currentPosition,
        destination: airportPosition,
        travelMode: window.google.maps.TravelMode.TRANSIT,
        transitOptions: {
          modes: [window.google.maps.TransitMode.SUBWAY, window.google.maps.TransitMode.BUS],
          routingPreference: window.google.maps.TransitRoutePreference.FEWER_TRANSFERS
        }
      }, (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          resolve(result);
        } else {
          reject(new Error(`경로 계산 실패: ${status}`));
        }
      });
    });
    
    // 4. 경로를 지도에 표시
    const stops = [
      { ...currentPosition, label: '현재 위치', markerLabel: 'A' },
      { ...airportPosition, label: '공항', markerLabel: 'B' }
    ];
    const colors = ['#FF0000']; // 긴급 경로는 빨간색
    
    if (typeof window.renderRoute !== 'undefined' && window.googleMaps) {
      window.renderRoute(window.googleMaps, {
        segments: [directionsResult],
        stops: stops,
        colors: colors
      });
      
      // 5. 경로 계획 저장
      if (typeof window.buildRoutePlan !== 'undefined') {
        window.updateState((draft) => {
          draft.routePlan = window.buildRoutePlan({
            segments: [directionsResult],
            stops: stops,
            colors: colors
          });
        });
      }
      
      // 6. 네비게이션 모드로 전환 (이미 네비게이션 모드일 수 있음)
      if (typeof window.setViewMode !== 'undefined') {
        window.setViewMode('navigation');
      }
      
      if (typeof window.showToast !== 'undefined') {
        window.showToast({
          message: '긴급 복귀 경로가 지도에 표시되었습니다.',
          type: 'success'
        });
      }
      
      console.log('✅ 긴급 복귀 경로 표시 완료');
    } else {
      throw new Error('경로 렌더링 함수를 찾을 수 없습니다.');
    }
  } catch (error) {
    console.error('공항 복귀 경로 표시 실패:', error);
    if (typeof window.showToast !== 'undefined') {
      window.showToast({
        message: '공항 복귀 경로를 표시할 수 없습니다. 다시 시도해주세요.',
        type: 'error'
      });
    }
  }
};

window.selectTransport = function(transportType) {
  console.log(`교통수단 선택: ${transportType}`);
  // 선택된 교통수단으로 경로 안내 시작
  window.startEmergencyNavigation(transportType);
};
