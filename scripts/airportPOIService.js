// Airport POI Service
// 공항별 특화 POI 데이터를 관리하는 서비스

class AirportPOIService {
  constructor() {
    this.googleMaps = null;
    this.placesService = null;
    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간
  }

  // Google Maps 초기화
  async init(googleMaps) {
    this.googleMaps = googleMaps;
    this.placesService = new googleMaps.maps.places.PlacesService(
      document.createElement('div')
    );
    console.log('Airport POI Service 초기화 완료');
  }

  // 공항별 POI 카테고리 정의
  getAirportCategories() {
    return {
      shopping: {
        types: ['shopping_mall', 'store', 'clothing_store', 'electronics_store'],
        keywords: ['면세점', 'duty free', 'shopping', 'store'],
        icon: '🛍️',
        label: '쇼핑'
      },
      food: {
        types: ['restaurant', 'cafe', 'food', 'meal_takeaway'],
        keywords: ['restaurant', 'cafe', 'food court', 'restaurant'],
        icon: '🍽️',
        label: '음식'
      },
      culture: {
        types: ['museum', 'art_gallery', 'library', 'tourist_attraction'],
        keywords: ['museum', 'gallery', 'exhibition', 'cultural'],
        icon: '🎨',
        label: '문화체험'
      },
      relax: {
        types: ['spa', 'beauty_salon', 'health', 'lodging'],
        keywords: ['spa', 'massage', 'lounge', 'relaxation'],
        icon: '💆',
        label: '휴식'
      },
      entertainment: {
        types: ['movie_theater', 'amusement_park', 'casino', 'night_club'],
        keywords: ['cinema', 'game', 'entertainment', 'arcade'],
        icon: '🎮',
        label: '엔터테인먼트'
      },
      services: {
        types: ['bank', 'atm', 'pharmacy', 'hospital', 'post_office'],
        keywords: ['bank', 'atm', 'pharmacy', 'service', 'concierge'],
        icon: '🏪',
        label: '편의시설'
      }
    };
  }

  // 공항 내부 POI 검색
  async searchAirportPOIs(airportLocation, categories = []) {
    const cacheKey = `airport_${airportLocation.lat}_${airportLocation.lng}_${categories.join(',')}`;
    
    // 캐시 확인
    if (this.isCacheValid(cacheKey)) {
      console.log('캐시에서 공항 POI 데이터 반환');
      return this.cache.get(cacheKey);
    }

    try {
      const allPOIs = [];
      const airportCategories = this.getAirportCategories();

      // 각 카테고리별로 검색
      for (const category of categories.length > 0 ? categories : Object.keys(airportCategories)) {
        const categoryInfo = airportCategories[category];
        const pois = await this.searchPOIsByCategory(airportLocation, categoryInfo);
        allPOIs.push(...pois.map(poi => ({ ...poi, category })));
      }

      // 중복 제거 및 정렬
      const uniquePOIs = this.removeDuplicatePOIs(allPOIs);
      const sortedPOIs = this.sortPOIsByRelevance(uniquePOIs);

      // 캐시 저장
      this.cache.set(cacheKey, sortedPOIs);
      this.cacheExpiry.set(cacheKey, Date.now());

      console.log(`공항 POI 검색 완료: ${sortedPOIs.length}개 발견`);
      return sortedPOIs;

    } catch (error) {
      console.error('공항 POI 검색 실패:', error);
      return this.getFallbackAirportPOIs();
    }
  }

  // 카테고리별 POI 검색
  async searchPOIsByCategory(location, categoryInfo) {
    return new Promise((resolve) => {
      const request = {
        location: new this.googleMaps.maps.LatLng(location.lat, location.lng),
        radius: 2000, // 공항 반경 2km
        type: categoryInfo.types[0], // 첫 번째 타입 사용
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
      businessStatus: place.business_status || 'OPERATIONAL'
    };
  }

  // 방문 시간 추정
  estimateVisitTime(category) {
    const timeEstimates = {
      '쇼핑': 60,
      '음식': 45,
      '문화체험': 90,
      '휴식': 120,
      '엔터테인먼트': 60,
      '편의시설': 15
    };
    return timeEstimates[category] || 30;
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
  getFallbackAirportPOIs() {
    return [
      {
        id: 'fallback_1',
        name: '면세점',
        address: '공항 내 면세점',
        location: { lat: 0, lng: 0 },
        rating: 4.0,
        userRatingsTotal: 100,
        priceLevel: 2,
        photos: [],
        types: ['shopping_mall'],
        category: '쇼핑',
        categoryIcon: '🛍️',
        estimatedTime: 60,
        businessStatus: 'OPERATIONAL'
      },
      {
        id: 'fallback_2',
        name: '공항 카페',
        address: '공항 내 카페',
        location: { lat: 0, lng: 0 },
        rating: 4.2,
        userRatingsTotal: 50,
        priceLevel: 1,
        photos: [],
        types: ['cafe'],
        category: '음식',
        categoryIcon: '🍽️',
        estimatedTime: 30,
        businessStatus: 'OPERATIONAL'
      }
    ];
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
          'formatted_phone_number', 'business_status'
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
            businessStatus: place.business_status
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
window.airportPOIService = new AirportPOIService();

export default AirportPOIService;
