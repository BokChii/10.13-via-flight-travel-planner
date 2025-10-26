// Google Maps API 초기화 및 POI 서비스 통합 관리
class POIServiceManager {
  constructor() {
    this.googleMaps = null;
    this.airportService = null;
    this.cityService = null;
    this.isInitialized = false;
    this.initPromise = null;
  }

  // Google Maps API 및 POI 서비스 초기화
  async initialize() {
    if (this.isInitialized) {
      return this.googleMaps;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  async _doInitialize() {
    try {
      // Google Maps API 키 가져오기
      const apiKey = this.getGoogleMapsApiKey();
      if (!apiKey) {
        throw new Error('Google Maps API 키가 설정되지 않았습니다.');
      }

      // Google Maps SDK 로드
      this.googleMaps = await this.loadGoogleMapsSdk(apiKey);
      
      // POI 서비스 초기화 (전역 인스턴스 사용)
      this.airportService = window.airportPOIService;
      this.cityService = window.cityPOIService;
      
      await Promise.all([
        this.airportService.init(this.googleMaps),
        this.cityService.init(this.googleMaps)
      ]);

      this.isInitialized = true;
      console.log('POI Service Manager 초기화 완료');
      
      return this.googleMaps;

    } catch (error) {
      console.error('POI Service Manager 초기화 실패:', error);
      this.initPromise = null;
      throw error;
    }
  }

  // Google Maps API 키 가져오기
  getGoogleMapsApiKey() {
    const metaTag = document.querySelector('meta[name="google-maps-api-key"]');
    return metaTag?.content?.trim() || '';
  }

  // Google Maps SDK 로드
  async loadGoogleMapsSdk(apiKey) {
    return new Promise((resolve, reject) => {
      // 이미 로드된 경우
      if (window.google?.maps) {
        resolve(window.google);
        return;
      }

      const script = document.createElement('script');
      const params = new URLSearchParams({
        key: apiKey,
        libraries: 'places',
        v: 'weekly',
        language: 'ko',
        region: 'KR'
      });

      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.onerror = () => reject(new Error('Google Maps SDK 로딩 실패'));
      script.onload = () => resolve(window.google);

      document.head.appendChild(script);
    });
  }

  // 공항 POI 검색
  async searchAirportPOIs(airportLocation, categories = []) {
    await this.initialize();
    return this.airportService.searchAirportPOIs(airportLocation, categories);
  }

  // 도시 POI 검색
  async searchCityPOIs(cityLocation, categories = [], radius = 5000) {
    await this.initialize();
    return this.cityService.searchCityPOIs(cityLocation, categories, radius);
  }

  // POI 상세 정보 가져오기
  async getPOIDetails(placeId, type = 'airport') {
    await this.initialize();
    const service = type === 'airport' ? this.airportService : this.cityService;
    return service.getPOIDetails(placeId);
  }

  // 공항 위치 정보 가져오기 (도시명으로)
  async getAirportLocation(cityName) {
    await this.initialize();
    
    return new Promise((resolve) => {
      const service = new this.googleMaps.maps.places.PlacesService(
        document.createElement('div')
      );

      service.textSearch({
        query: `${cityName} 공항`,
        fields: ['place_id', 'name', 'geometry', 'formatted_address']
      }, (results, status) => {
        if (status === this.googleMaps.maps.places.PlacesServiceStatus.OK && results?.[0]) {
          const place = results[0];
          resolve({
            name: place.name,
            address: place.formatted_address,
            location: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            },
            placeId: place.place_id
          });
        } else {
          // 폴백: 기본 공항 위치
          resolve({
            name: `${cityName} 공항`,
            address: `${cityName} 공항`,
            location: { lat: 37.449796, lng: 126.451244 }, // 인천공항 기본값
            placeId: null
          });
        }
      });
    });
  }

  // 도시 중심 위치 가져오기
  async getCityCenterLocation(cityName) {
    await this.initialize();
    
    return new Promise((resolve) => {
      const service = new this.googleMaps.maps.places.PlacesService(
        document.createElement('div')
      );

      service.textSearch({
        query: `${cityName} 시청`,
        fields: ['place_id', 'name', 'geometry', 'formatted_address']
      }, (results, status) => {
        if (status === this.googleMaps.maps.places.PlacesServiceStatus.OK && results?.[0]) {
          const place = results[0];
          resolve({
            name: place.name,
            address: place.formatted_address,
            location: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            },
            placeId: place.place_id
          });
        } else {
          // 폴백: 기본 도시 중심점
          resolve({
            name: `${cityName} 중심가`,
            address: `${cityName} 중심가`,
            location: { lat: 37.5665, lng: 126.978 }, // 서울 기본값
            placeId: null
          });
        }
      });
    });
  }

  // 서비스 상태 확인
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      hasGoogleMaps: !!this.googleMaps,
      hasAirportService: !!this.airportService,
      hasCityService: !!this.cityService
    };
  }
}

// 전역 인스턴스 생성
window.poiServiceManager = new POIServiceManager();

export default POIServiceManager;
