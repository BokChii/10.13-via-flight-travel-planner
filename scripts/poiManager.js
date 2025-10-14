/**
 * POI Manager Module
 * 경유지 POI 정보를 관리하고 카테고리, 영업상태, 사진 등을 제공합니다.
 * API 호출을 최소화하기 위해 캐싱 전략을 사용합니다.
 */

// POI 카테고리 매핑
const POI_CATEGORIES = {
  'restaurant': { icon: '🍽️', label: '식당', color: '#ff6b6b' },
  'cafe': { icon: '☕', label: '카페', color: '#8b4513' },
  'shopping_mall': { icon: '🛍️', label: '쇼핑', color: '#ff9f43' },
  'tourist_attraction': { icon: '🏛️', label: '관광지', color: '#3742fa' },
  'lodging': { icon: '🏨', label: '숙박', color: '#2f3542' },
  'park': { icon: '🌳', label: '공원', color: '#2ed573' },
  'museum': { icon: '🏛️', label: '박물관', color: '#5352ed' },
  'gas_station': { icon: '⛽', label: '주유소', color: '#ffa502' },
  'hospital': { icon: '🏥', label: '병원', color: '#ff3838' },
  'bank': { icon: '🏦', label: '은행', color: '#2f3542' },
  'pharmacy': { icon: '💊', label: '약국', color: '#ff6b6b' },
  'atm': { icon: '🏧', label: 'ATM', color: '#2f3542' },
  'subway_station': { icon: '🚇', label: '지하철', color: '#3742fa' },
  'bus_station': { icon: '🚌', label: '버스정류장', color: '#ff9f43' },
  'airport': { icon: '✈️', label: '공항', color: '#5352ed' },
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
  if (!placeId) return null;

  // 캐시 확인
  const cached = getCachedPOI(placeId);
  if (cached) {
    return cached;
  }

  // API 호출
  try {
    const poiInfo = await fetchPOIFromAPI(placeId);
    if (poiInfo) {
      cachePOI(placeId, poiInfo);
    }
    return poiInfo;
  } catch (error) {
    console.warn('POI 정보 가져오기 실패:', error);
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
            businessStatus: 'UNKNOWN' // 기본값
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
 * 카테고리를 결정합니다
 * @param {Array} types - Google Places types 배열
 * @returns {Object} 카테고리 정보
 */
export function determineCategory(types) {
  if (!types || !Array.isArray(types)) {
    return POI_CATEGORIES.default;
  }

  // 우선순위에 따라 카테고리 결정
  const priorityTypes = [
    'restaurant', 'cafe', 'shopping_mall', 'tourist_attraction',
    'lodging', 'park', 'museum', 'gas_station', 'hospital',
    'bank', 'pharmacy', 'atm', 'subway_station', 'bus_station', 'airport'
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
  if (!window.google?.maps?.places) return null;

  const service = new window.google.maps.places.PlacesService(document.createElement('div'));
  
  return new Promise((resolve) => {
    service.getDetails({
      placeId: placeId,
      fields: ['name', 'types', 'formatted_address', 'photos', 'opening_hours', 'business_status']
    }, (place, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
        const poiInfo = {
          placeId: placeId,
          name: place.name,
          address: place.formatted_address,
          types: place.types || [],
          photos: place.photos || [],
          openingHours: place.opening_hours,
          businessStatus: place.business_status || 'UNKNOWN',
          category: determineCategory(place.types)
        };
        resolve(poiInfo);
      } else {
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
