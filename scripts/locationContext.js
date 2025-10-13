/**
 * Location Context Module
 * Google Places API를 사용하여 현재 위치의 상세 정보를 가져오고 관리합니다.
 * 글로벌 호환성을 위해 하드코딩을 최소화하고 범용적인 접근 방식을 사용합니다.
 */

// 위치 정보 캐시 (5분간 유효)
const locationCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5분

/**
 * Google Places API를 사용하여 현재 위치의 상세 정보를 가져옵니다
 * @param {Object} position - {lat, lng} 형태의 위치 정보
 * @returns {Promise<Object|null>} 위치 컨텍스트 정보 또는 null
 */
export async function getCurrentLocationContext(position) {
  if (!position || !position.lat || !position.lng) {
    console.warn('유효하지 않은 위치 정보입니다.');
    return null;
  }

  // 캐시 확인
  const cacheKey = `${position.lat.toFixed(4)},${position.lng.toFixed(4)}`;
  const cached = locationCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  if (!window.google || !window.google.maps) {
    console.warn('Google Maps API가 로드되지 않았습니다.');
    return null;
  }

  const geocoder = new google.maps.Geocoder();
  
  return new Promise((resolve) => {
    geocoder.geocode({ location: position }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const result = results[0];
        const context = {
          address: result.formatted_address,
          placeId: result.place_id,
          components: result.address_components,
          city: extractCityFromComponents(result.address_components),
          country: extractCountryFromComponents(result.address_components),
          district: extractDistrictFromComponents(result.address_components),
          timestamp: Date.now()
        };
        
        // 캐시에 저장
        locationCache.set(cacheKey, {
          data: context,
          timestamp: Date.now()
        });
        
        resolve(context);
      } else {
        console.warn('위치 정보를 가져올 수 없습니다:', status);
        resolve(null);
      }
    });
  });
}

/**
 * 주소 컴포넌트에서 도시명을 추출합니다
 * @param {Array} components - Google Places API의 address_components
 * @returns {string} 도시명
 */
function extractCityFromComponents(components) {
  if (!components) return 'Unknown';
  
  // 도시명을 찾는 우선순위: locality > administrative_area_level_2 > administrative_area_level_1
  const cityTypes = ['locality', 'administrative_area_level_2', 'administrative_area_level_1'];
  
  for (const type of cityTypes) {
    const component = components.find(comp => comp.types.includes(type));
    if (component) {
      return component.long_name;
    }
  }
  
  return 'Unknown';
}

/**
 * 주소 컴포넌트에서 국가명을 추출합니다
 * @param {Array} components - Google Places API의 address_components
 * @returns {string} 국가명
 */
function extractCountryFromComponents(components) {
  if (!components) return 'Unknown';
  
  const countryComponent = components.find(comp => comp.types.includes('country'));
  return countryComponent ? countryComponent.long_name : 'Unknown';
}

/**
 * 주소 컴포넌트에서 구/지역명을 추출합니다
 * @param {Array} components - Google Places API의 address_components
 * @returns {string} 구/지역명
 */
function extractDistrictFromComponents(components) {
  if (!components) return 'Unknown';
  
  // 구/지역명을 찾는 우선순위: administrative_area_level_2 > sublocality > neighborhood
  const districtTypes = ['administrative_area_level_2', 'sublocality', 'neighborhood'];
  
  for (const type of districtTypes) {
    const component = components.find(comp => comp.types.includes(type));
    if (component) {
      return component.long_name;
    }
  }
  
  return 'Unknown';
}

/**
 * 위치 컨텍스트를 기반으로 사용자 친화적인 위치 설명을 생성합니다
 * @param {Object} context - 위치 컨텍스트 정보
 * @returns {string} 사용자 친화적인 위치 설명
 */
export function generateLocationDescription(context) {
  if (!context) return '현재 위치';
  
  const { city, district, country } = context;
  
  if (city !== 'Unknown' && district !== 'Unknown') {
    return `${city}의 ${district}`;
  } else if (city !== 'Unknown') {
    return city;
  } else if (country !== 'Unknown') {
    return country;
  }
  
  return '현재 위치';
}

/**
 * 위치 컨텍스트를 기반으로 상황별 메시지를 생성합니다
 * @param {Object} context - 위치 컨텍스트 정보
 * @param {string} activity - 현재 활동 (예: '쇼핑 중', '식사 중')
 * @returns {string} 상황별 메시지
 */
export function generateContextualMessage(context, activity = null) {
  const locationDesc = generateLocationDescription(context);
  
  if (activity && activity !== '이동 중') {
    return `현재 ${locationDesc}에서 ${activity} 중이시군요.`;
  } else {
    return `현재 ${locationDesc}에 계시군요.`;
  }
}

/**
 * 캐시를 정리합니다 (오래된 항목 제거)
 */
export function clearLocationCache() {
  const now = Date.now();
  for (const [key, value] of locationCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      locationCache.delete(key);
    }
  }
}

/**
 * 캐시 상태를 반환합니다 (디버깅용)
 * @returns {Object} 캐시 상태 정보
 */
export function getCacheStatus() {
  return {
    size: locationCache.size,
    keys: Array.from(locationCache.keys()),
    entries: Array.from(locationCache.entries()).map(([key, value]) => ({
      key,
      timestamp: value.timestamp,
      age: Date.now() - value.timestamp
    }))
  };
}
