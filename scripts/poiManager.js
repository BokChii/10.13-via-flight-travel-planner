/**
 * POI Manager Module
 * 경유지 POI 정보를 관리하고 카테고리, 영업상태, 사진 등을 제공합니다.
 * API 호출을 최소화하기 위해 캐싱 전략을 사용합니다.
 */

import { 
  getBusinessStatus, 
  getBusinessStatusIcon, 
  getBusinessStatusLabel 
} from './businessHours.js';

// POI 카테고리 매핑 (더 세분화된 매핑)
const POI_CATEGORIES = {
  // 식음료
  'restaurant': { icon: '🍽️', label: '식당', color: '#ff6b6b' },
  'cafe': { icon: '☕', label: '카페', color: '#8b4513' },
  'bar': { icon: '🍺', label: '바', color: '#8b4513' },
  'bakery': { icon: '🥖', label: '베이커리', color: '#8b4513' },
  'food': { icon: '🍕', label: '음식점', color: '#ff6b6b' },
  
  // 쇼핑
  'shopping_mall': { icon: '🛍️', label: '쇼핑몰', color: '#ff9f43' },
  'store': { icon: '🏪', label: '상점', color: '#ff9f43' },
  'clothing_store': { icon: '👕', label: '의류점', color: '#ff9f43' },
  'electronics_store': { icon: '📱', label: '전자제품', color: '#ff9f43' },
  'supermarket': { icon: '🛒', label: '마트', color: '#ff9f43' },
  
  // 관광/레저
  'tourist_attraction': { icon: '🏛️', label: '관광지', color: '#3742fa' },
  'park': { icon: '🌳', label: '공원', color: '#2ed573' },
  'beach': { icon: '🏖️', label: '해변', color: '#2ed573' },
  'amusement_park': { icon: '🎢', label: '놀이공원', color: '#ff6b6b' },
  'zoo': { icon: '🦁', label: '동물원', color: '#2ed573' },
  'aquarium': { icon: '🐠', label: '수족관', color: '#2ed573' },
  'museum': { icon: '🏛️', label: '박물관', color: '#5352ed' },
  'art_gallery': { icon: '🎨', label: '미술관', color: '#5352ed' },
  'stadium': { icon: '🏟️', label: '경기장', color: '#3742fa' },
  'gym': { icon: '💪', label: '헬스장', color: '#2ed573' },
  
  // 숙박
  'lodging': { icon: '🏨', label: '숙박', color: '#2f3542' },
  'hotel': { icon: '🏨', label: '호텔', color: '#2f3542' },
  'motel': { icon: '🏨', label: '모텔', color: '#2f3542' },
  
  // 교통
  'subway_station': { icon: '🚇', label: '지하철', color: '#3742fa' },
  'bus_station': { icon: '🚌', label: '버스정류장', color: '#ff9f43' },
  'train_station': { icon: '🚂', label: '기차역', color: '#3742fa' },
  'airport': { icon: '✈️', label: '공항', color: '#5352ed' },
  'gas_station': { icon: '⛽', label: '주유소', color: '#ffa502' },
  
  // 의료/금융
  'hospital': { icon: '🏥', label: '병원', color: '#ff3838' },
  'pharmacy': { icon: '💊', label: '약국', color: '#ff6b6b' },
  'bank': { icon: '🏦', label: '은행', color: '#2f3542' },
  'atm': { icon: '🏧', label: 'ATM', color: '#2f3542' },
  
  // 기타
  'default': { icon: '📍', label: '기타', color: '#6c757d' }
};

// 캐시 관리
const POI_CACHE = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

/**
 * POI 정보를 가져옵니다 (캐시 우선)
 * @param {string} placeId - Google Places place_id
 * @returns {Promise<Object>} POI 정보
 */
export async function getPOIInfo(placeId) {
  console.log('🔍 [DEBUG] getPOIInfo 호출됨, placeId:', placeId);
  
  if (!placeId) {
    console.log('❌ [DEBUG] placeId가 없음');
    return null;
  }

  // 캐시 확인
  const cached = getCachedPOI(placeId);
  if (cached) {
    console.log('✅ [DEBUG] 캐시에서 POI 정보 반환:', cached);
    console.log('📸 [DEBUG] 캐시된 photos:', cached.photos);
    return cached;
  }

  console.log('🔄 [DEBUG] API 호출 중...');
  
  // API 호출
  try {
    const poiInfo = await fetchPOIFromAPI(placeId);
    console.log('📋 [DEBUG] API 응답:', poiInfo);
    console.log('📸 [DEBUG] API photos:', poiInfo?.photos);
    
    if (poiInfo) {
      cachePOI(placeId, poiInfo);
      console.log('✅ [DEBUG] POI 정보 캐시에 저장됨');
    }
    return poiInfo;
  } catch (error) {
    console.warn('❌ [DEBUG] POI 정보 가져오기 실패:', error);
    return null;
  }
}

/**
 * 장소명으로 POI 정보를 검색합니다
 * @param {string} placeName - 장소명
 * @returns {Promise<Object>} POI 정보
 */
export async function searchPOIByName(placeName) {
  if (!placeName || !window.google?.maps?.places) return null;

  try {
    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
    
    return new Promise((resolve) => {
      service.textSearch({
        query: placeName,
        fields: ['place_id', 'name', 'types', 'formatted_address', 'photos']
      }, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.[0]) {
          const place = results[0];
          const poiInfo = {
            placeId: place.place_id,
            name: place.name,
            address: place.formatted_address,
            types: place.types || [],
            photos: place.photos || [],
            category: determineCategory(place.types),
            business_status: 'UNKNOWN', // 수정: businessStatus → business_status
            opening_hours: null // 추가: opening_hours 필드
          };
          resolve(poiInfo);
        } else {
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.warn('POI 검색 실패:', error);
    return null;
  }
}

/**
 * 카테고리를 결정합니다 (개선된 우선순위 로직)
 * @param {Array} types - Google Places types 배열
 * @returns {Object} 카테고리 정보
 */
export function determineCategory(types) {
  if (!types || !Array.isArray(types)) {
    return POI_CATEGORIES.default;
  }

  // 우선순위에 따라 카테고리 결정 (더 세분화된 매핑)
  const priorityTypes = [
    // 공원/해변 관련 (높은 우선순위)
    'park', 'beach', 'amusement_park', 'zoo', 'aquarium',
    
    // 식음료
    'restaurant', 'cafe', 'bar', 'bakery', 'food',
    
    // 쇼핑
    'shopping_mall', 'store', 'clothing_store', 'electronics_store', 'supermarket',
    
    // 관광/문화
    'museum', 'art_gallery', 'tourist_attraction', 'stadium', 'gym',
    
    // 숙박
    'hotel', 'motel', 'lodging',
    
    // 교통
    'airport', 'subway_station', 'bus_station', 'train_station', 'gas_station',
    
    // 의료/금융
    'hospital', 'pharmacy', 'bank', 'atm'
  ];

  for (const type of priorityTypes) {
    if (types.includes(type)) {
      return POI_CATEGORIES[type];
    }
  }

  return POI_CATEGORIES.default;
}

/**
 * POI 카테고리 정보를 가져옵니다
 * @param {string} categoryKey - 카테고리 키
 * @returns {Object} 카테고리 정보
 */
export function getCategoryInfo(categoryKey) {
  return POI_CATEGORIES[categoryKey] || POI_CATEGORIES.default;
}

/**
 * API에서 POI 정보를 가져옵니다
 * @param {string} placeId - Google Places place_id
 * @returns {Promise<Object>} POI 정보
 */
async function fetchPOIFromAPI(placeId) {
  console.log('🌐 [DEBUG] fetchPOIFromAPI 호출됨, placeId:', placeId);
  
  if (!window.google?.maps?.places) {
    console.log('❌ [DEBUG] Google Maps Places API가 로드되지 않음');
    return null;
  }

  const service = new window.google.maps.places.PlacesService(document.createElement('div'));
  
  return new Promise((resolve) => {
    console.log('🔄 [DEBUG] Places API getDetails 요청 중...');
    
    service.getDetails({
      placeId: placeId,
      fields: ['name', 'types', 'formatted_address', 'photos', 'opening_hours', 'business_status']
    }, (place, status) => {
      console.log('📋 [DEBUG] Places API 응답 상태:', status);
      console.log('📍 [DEBUG] Places API 응답 데이터:', place);
      
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
        console.log('📸 [DEBUG] 원본 photos:', place.photos);
        
        const poiInfo = {
          placeId: placeId,
          name: place.name,
          address: place.formatted_address,
          types: place.types || [],
          photos: place.photos ? [place.photos[0]] : [], // 대표 사진 1장만
          opening_hours: place.opening_hours, // 수정: openingHours → opening_hours
          business_status: place.business_status, // 수정: businessStatus → business_status
          category: determineCategory(place.types)
        };
        
        console.log('✅ [DEBUG] POI 정보 생성됨:', poiInfo);
        console.log('📸 [DEBUG] 최종 photos:', poiInfo.photos);
        
        resolve(poiInfo);
      } else {
        console.log('❌ [DEBUG] Places API 실패:', status);
        resolve(null);
      }
    });
  });
}

/**
 * 캐시에서 POI 정보를 가져옵니다
 * @param {string} placeId - Google Places place_id
 * @returns {Object|null} 캐시된 POI 정보
 */
function getCachedPOI(placeId) {
  const cached = POI_CACHE.get(placeId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

/**
 * POI 정보를 캐시에 저장합니다
 * @param {string} placeId - Google Places place_id
 * @param {Object} poiInfo - POI 정보
 */
function cachePOI(placeId, poiInfo) {
  POI_CACHE.set(placeId, {
    data: poiInfo,
    timestamp: Date.now()
  });
}

/**
 * 캐시를 정리합니다 (오래된 항목 제거)
 */
export function clearExpiredCache() {
  const now = Date.now();
  for (const [key, value] of POI_CACHE.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      POI_CACHE.delete(key);
    }
  }
}

/**
 * 여행 시간을 기반으로 POI의 영업 상태를 확인합니다
 * @param {Object} poiInfo - POI 정보
 * @param {Object} travelTime - 여행 시간 정보
 * @returns {Object} 영업 상태 정보
 */
export function checkBusinessStatus(poiInfo, travelTime = null) {
  if (!poiInfo) {
    return {
      status: 'UNKNOWN',
      icon: '⚪',
      label: '영업 상태 확인 불가'
    };
  }

  // 여행 시간이 주어진 경우 정확한 영업 상태 확인
  if (travelTime) {
    const status = getBusinessStatus(poiInfo, travelTime);
    return {
      status,
      icon: getBusinessStatusIcon(status),
      label: getBusinessStatusLabel(status)
    };
  }

  // 기본 영업 상태 (Google Places API의 business_status 기반)
  const status = poiInfo.business_status || 'UNKNOWN';
  return {
    status,
    icon: getBusinessStatusIcon(status),
    label: getBusinessStatusLabel(status)
  };
}

/**
 * 여행 시간 정보를 생성합니다
 * @param {Date} startTime - 시작 시간
 * @param {number} durationMinutes - 체류 시간 (분)
 * @param {string} timeZone - 시간대 (기본값: 'Asia/Seoul')
 * @returns {Object} 여행 시간 정보
 */
export function createTravelTimeInfo(startTime, durationMinutes = 60, timeZone = 'Asia/Seoul') {
  return {
    start: startTime,
    durationMinutes,
    timeZone
  };
}

/**
 * 현재 시간을 기반으로 여행 시간 정보를 생성합니다
 * @param {number} durationMinutes - 체류 시간 (분)
 * @param {string} timeZone - 시간대 (기본값: 'Asia/Seoul')
 * @returns {Object} 여행 시간 정보
 */
export function createCurrentTravelTimeInfo(durationMinutes = 60, timeZone = 'Asia/Seoul') {
  return createTravelTimeInfo(new Date(), durationMinutes, timeZone);
}

/**
 * 실제 여행 일정을 기반으로 경유지 방문 시간을 계산합니다
 * @param {Object} tripMeta - 여행 메타데이터
 * @param {Array} waypoints - 전체 경유지 목록
 * @param {number} waypointIndex - 현재 경유지 인덱스
 * @param {number} durationMinutes - 체류 시간 (분)
 * @returns {Object} 여행 시간 정보
 */
export function createTravelTimeFromTripMeta(tripMeta, waypoints, waypointIndex, durationMinutes = 60) {
  if (!tripMeta || !tripMeta.arrival) {
    console.log('⚠️ tripMeta 또는 arrival이 없음 - 현재 시간 사용');
    return createCurrentTravelTimeInfo(durationMinutes);
  }

  try {
    // 도착 시간 (UTC)
    const arrivalTime = new Date(tripMeta.arrival);
    
    // 경유지 방문 시간 계산
    const visitTime = calculateWaypointVisitTime(arrivalTime, waypoints, waypointIndex);
    
    // 시간대 설정 (싱가포르 기본, 또는 tripMeta에서 추출)
    const timeZone = tripMeta.timeZone || 'Asia/Singapore';
    
    return createTravelTimeInfo(visitTime, durationMinutes, timeZone);
  } catch (error) {
    console.warn('❌ 여행 시간 계산 실패:', error);
    return createCurrentTravelTimeInfo(durationMinutes);
  }
}

/**
 * 경유지별 방문 시간을 계산합니다
 * @param {Date} arrivalTime - 도착 시간
 * @param {Array} waypoints - 전체 경유지 목록
 * @param {number} waypointIndex - 현재 경유지 인덱스
 * @returns {Date} 방문 시간
 */
function calculateWaypointVisitTime(arrivalTime, waypoints, waypointIndex) {
  let visitTime = new Date(arrivalTime);
  
  // 이전 경유지들의 체류 시간과 이동 시간을 합산
  for (let i = 0; i < waypointIndex; i++) {
    const waypoint = waypoints[i];
    const stayMinutes = waypoint.stayMinutes || 60;
    
    // 체류 시간 추가
    visitTime.setMinutes(visitTime.getMinutes() + stayMinutes);
    
    // 이동 시간 추가 (기본 30분, 실제로는 라우팅 API에서 가져와야 함)
    const travelMinutes = 30; // TODO: 실제 이동 시간으로 교체
    visitTime.setMinutes(visitTime.getMinutes() + travelMinutes);
  }
  
  return visitTime;
}
