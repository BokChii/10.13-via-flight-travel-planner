// City POI Service
// 도시별 관광지 및 POI 데이터를 관리하는 서비스

class CityPOIService {
  constructor() {
    this.googleMaps = null;
    this.placesService = null;
    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.CACHE_DURATION = 12 * 60 * 60 * 1000; // 12시간 (도시는 더 자주 업데이트)
  }

  // Google Maps 초기화
  async init(googleMaps) {
    this.googleMaps = googleMaps;
    this.placesService = new googleMaps.maps.places.PlacesService(
      document.createElement('div')
    );
    console.log('City POI Service 초기화 완료');
  }

  // 도시별 POI 카테고리 정의
  getCityCategories() {
    return {
      attractions: {
        types: ['tourist_attraction', 'museum', 'art_gallery', 'park'],
        keywords: ['landmark', 'monument', 'tower', 'palace', 'temple'],
        icon: '🏛️',
        label: '관광명소',
        priority: 1
      },
      shopping: {
        types: ['shopping_mall', 'store', 'market', 'department_store'],
        keywords: ['shopping', 'market', 'mall', 'boutique'],
        icon: '🛍️',
        label: '쇼핑',
        priority: 2
      },
      food: {
        types: ['restaurant', 'cafe', 'food', 'meal_takeaway'],
        keywords: ['restaurant', 'cafe', 'local food', 'street food'],
        icon: '🍽️',
        label: '음식',
        priority: 1
      },
      culture: {
        types: ['museum', 'art_gallery', 'library', 'theater'],
        keywords: ['museum', 'gallery', 'culture', 'art', 'history'],
        icon: '🎨',
        label: '문화체험',
        priority: 2
      },
      nature: {
        types: ['park', 'zoo', 'aquarium', 'natural_feature'],
        keywords: ['park', 'garden', 'nature', 'beach', 'mountain'],
        icon: '🌳',
        label: '자연',
        priority: 2
      },
      nightlife: {
        types: ['night_club', 'bar', 'casino', 'entertainment'],
        keywords: ['nightlife', 'bar', 'club', 'night view'],
        icon: '🌃',
        label: '야경/야생활',
        priority: 3
      }
    };
  }

  // 도시 POI 검색
  async searchCityPOIs(cityLocation, categories = [], radius = 5000) {
    const cacheKey = `city_${cityLocation.lat}_${cityLocation.lng}_${categories.join(',')}_${radius}`;
    
    // 캐시 확인
    if (this.isCacheValid(cacheKey)) {
      console.log('캐시에서 도시 POI 데이터 반환');
      return this.cache.get(cacheKey);
    }

    try {
      const allPOIs = [];
      const cityCategories = this.getCityCategories();

      // 각 카테고리별로 검색
      for (const category of categories.length > 0 ? categories : Object.keys(cityCategories)) {
        const categoryInfo = cityCategories[category];
        const pois = await this.searchPOIsByCategory(cityLocation, categoryInfo, radius);
        allPOIs.push(...pois.map(poi => ({ ...poi, category })));
      }

      // 중복 제거 및 정렬
      const uniquePOIs = this.removeDuplicatePOIs(allPOIs);
      const sortedPOIs = this.sortPOIsByRelevance(uniquePOIs);

      // 캐시 저장
      this.cache.set(cacheKey, sortedPOIs);
      this.cacheExpiry.set(cacheKey, Date.now());

      console.log(`도시 POI 검색 완료: ${sortedPOIs.length}개 발견`);
      return sortedPOIs;

    } catch (error) {
      console.error('도시 POI 검색 실패:', error);
      return this.getFallbackCityPOIs();
    }
  }

  // 카테고리별 POI 검색
  async searchPOIsByCategory(location, categoryInfo, radius) {
    return new Promise((resolve) => {
      const request = {
        location: new this.googleMaps.maps.LatLng(location.lat, location.lng),
        radius: radius,
        type: categoryInfo.types[0],
        keyword: categoryInfo.keywords.join(' ')
      };

      this.placesService.nearbySearch(request, (results, status) => {
        if (status === this.googleMaps.maps.places.PlacesServiceStatus.OK && results) {
          const pois = results.map(place => this.formatPOI(place, categoryInfo));
          resolve(pois);
        } else {
          console.warn(`카테고리 ${categoryInfo.label} 검색 실패:`, status);
          resolve([]);
        }
      });
    });
  }

  // POI 정보 포맷팅
  formatPOI(place, categoryInfo) {
    return {
      id: place.place_id,
      name: place.name,
      address: place.vicinity || place.formatted_address,
      location: {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng()
      },
      rating: place.rating || 0,
      userRatingsTotal: place.user_ratings_total || 0,
      priceLevel: place.price_level || 0,
      photos: place.photos ? [place.photos[0]] : [],
      types: place.types || [],
      category: categoryInfo.label,
      categoryIcon: categoryInfo.icon,
      estimatedTime: this.estimateVisitTime(categoryInfo.label),
      businessStatus: place.business_status || 'OPERATIONAL',
      priority: categoryInfo.priority
    };
  }

  // 방문 시간 추정
  estimateVisitTime(category) {
    const timeEstimates = {
      '관광명소': 120,
      '쇼핑': 90,
      '음식': 60,
      '문화체험': 90,
      '자연': 60,
      '야경/야생활': 90
    };
    return timeEstimates[category] || 60;
  }

  // 중복 POI 제거
  removeDuplicatePOIs(pois) {
    const seen = new Set();
    return pois.filter(poi => {
      const key = `${poi.name}_${poi.location.lat}_${poi.location.lng}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // 관련성에 따른 POI 정렬
  sortPOIsByRelevance(pois) {
    return pois.sort((a, b) => {
      // 우선순위가 높은 순
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // 평점이 높은 순
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      // 리뷰 수가 많은 순
      if (b.userRatingsTotal !== a.userRatingsTotal) {
        return b.userRatingsTotal - a.userRatingsTotal;
      }
      // 이름 순
      return a.name.localeCompare(b.name);
    });
  }

  // 캐시 유효성 확인
  isCacheValid(key) {
    const expiry = this.cacheExpiry.get(key);
    return expiry && (Date.now() - expiry) < this.CACHE_DURATION;
  }

  // 폴백 데이터 (API 실패 시)
  getFallbackCityPOIs() {
    return [
      {
        id: 'fallback_city_1',
        name: '도시 랜드마크',
        address: '도시 중심가',
        location: { lat: 0, lng: 0 },
        rating: 4.5,
        userRatingsTotal: 200,
        priceLevel: 0,
        photos: [],
        types: ['tourist_attraction'],
        category: '관광명소',
        categoryIcon: '🏛️',
        estimatedTime: 120,
        businessStatus: 'OPERATIONAL',
        priority: 1
      },
      {
        id: 'fallback_city_2',
        name: '로컬 맛집',
        address: '도시 내 맛집',
        location: { lat: 0, lng: 0 },
        rating: 4.3,
        userRatingsTotal: 150,
        priceLevel: 1,
        photos: [],
        types: ['restaurant'],
        category: '음식',
        categoryIcon: '🍽️',
        estimatedTime: 60,
        businessStatus: 'OPERATIONAL',
        priority: 1
      }
    ];
  }

  // 인기 관광지 검색 (텍스트 검색)
  async searchPopularAttractions(cityName, limit = 10) {
    const cacheKey = `popular_${cityName}_${limit}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    return new Promise((resolve) => {
      this.placesService.textSearch({
        query: `${cityName} 관광지`,
        fields: ['place_id', 'name', 'types', 'formatted_address', 'photos', 'rating']
      }, (results, status) => {
        if (status === this.googleMaps.maps.places.PlacesServiceStatus.OK && results) {
          const attractions = results.slice(0, limit).map(place => ({
            id: place.place_id,
            name: place.name,
            address: place.formatted_address,
            types: place.types || [],
            photos: place.photos ? [place.photos[0]] : [],
            rating: place.rating || 0,
            category: '관광명소',
            categoryIcon: '🏛️',
            estimatedTime: 120
          }));
          
          this.cache.set(cacheKey, attractions);
          this.cacheExpiry.set(cacheKey, Date.now());
          resolve(attractions);
        } else {
          resolve([]);
        }
      });
    });
  }

  // POI 상세 정보 가져오기
  async getPOIDetails(placeId) {
    const cacheKey = `details_${placeId}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    return new Promise((resolve) => {
      this.placesService.getDetails({
        placeId: placeId,
        fields: [
          'name', 'formatted_address', 'opening_hours', 'photos',
          'rating', 'user_ratings_total', 'reviews', 'website',
          'formatted_phone_number', 'business_status', 'price_level'
        ]
      }, (place, status) => {
        if (status === this.googleMaps.maps.places.PlacesServiceStatus.OK && place) {
          const details = {
            name: place.name,
            address: place.formatted_address,
            openingHours: place.opening_hours,
            photos: place.photos || [],
            rating: place.rating || 0,
            userRatingsTotal: place.user_ratings_total || 0,
            reviews: place.reviews || [],
            website: place.website,
            phone: place.formatted_phone_number,
            businessStatus: place.business_status,
            priceLevel: place.price_level
          };
          
          this.cache.set(cacheKey, details);
          this.cacheExpiry.set(cacheKey, Date.now());
          resolve(details);
        } else {
          resolve(null);
        }
      });
    });
  }
}

// 전역 인스턴스 생성
window.cityPOIService = new CityPOIService();

export default CityPOIService;
