/**
 * Airport API Service
 * 공항 데이터베이스와 연동하여 공항 정보를 제공하는 API 서비스
 */

import { airportDB } from './airportDatabase.js';

class AirportAPIService {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * 서비스 초기화
   */
  async init() {
    if (this.isInitialized) return;
    
    try {
      await airportDB.init();
      this.isInitialized = true;
      console.log('✅ Airport API Service initialized');
    } catch (error) {
      console.error('❌ Airport API Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * 공항 시설 카테고리 목록 조회
   */
  async getFacilityCategories(airportId = 'SIN') {
    await this.init();
    
    const categories = [
      { id: 'Lounge', name: '라운지', icon: '🏛️', description: '프리미엄 라운지 및 휴게실' },
      { id: 'Rest', name: '휴게실', icon: '😴', description: '무료 휴게실 및 낮잠 공간' },
      { id: 'Hotel', name: '호텔', icon: '🏨', description: '공항 내 호텔 및 숙박 시설' },
      { id: 'Attraction', name: '관광지', icon: '🎪', description: '공항 내 어트랙션 및 관광지' },
      { id: 'Meal', name: '식당', icon: '🍽️', description: '다양한 음식점 및 레스토랑' },
      { id: 'Cafe', name: '카페', icon: '☕', description: '카페 및 음료 전문점' },
      { id: 'Dessert', name: '디저트', icon: '🍰', description: '디저트 및 간식 전문점' },
      { id: 'Fashion', name: '패션', icon: '👗', description: '의류 및 패션 브랜드' },
      { id: 'Beauty', name: '뷰티', icon: '💄', description: '화장품 및 뷰티 제품' },
      { id: 'Beverage', name: '주류', icon: '🍷', description: '와인 및 주류 전문점' },
      { id: 'Snack', name: '간식', icon: '🍫', description: '간식 및 선물용 제품' },
      { id: 'Duty_free', name: '면세점', icon: '🛍️', description: '면세점 및 편의점' },
      { id: 'Entertainment', name: '엔터테인먼트', icon: '🎮', description: '엔터테인먼트 및 기념품' },
      { id: 'FoodSpot', name: '외부 맛집', icon: '🍜', description: '공항 외부 인기 음식점' },
      { id: 'paid_tour', name: '유료 투어', icon: '🎯', description: '유료 관광 및 체험 활동' },
      { id: 'free_tour', name: '무료 투어', icon: '🚶', description: '무료 관광 투어' }
    ];

    // 각 카테고리별 시설 수 조회
    for (const category of categories) {
      try {
        const facilities = await airportDB.getFacilitiesByCategory(airportId, category.id);
        category.count = facilities.length;
        category.hasFacilities = facilities.length > 0;
      } catch (error) {
        console.warn(`Failed to get count for category ${category.id}:`, error);
        category.count = 0;
        category.hasFacilities = false;
      }
    }

    return categories.filter(cat => cat.hasFacilities);
  }

  /**
   * 카테고리별 시설 목록 조회
   */
  async getFacilitiesByCategory(airportId, category, options = {}) {
    await this.init();

    const {
      includeClosed = false,
      searchTerm = null,
      limit = null,
      sortBy = 'name'
    } = options;

    let facilities = await airportDB.getFacilitiesByCategory(airportId, category);

    // 검색어 필터링
    if (searchTerm) {
      facilities = facilities.filter(facility => {
        const nameField = this.getNameField(facility.table_name);
        return facility[nameField]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
               facility.information?.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    // 운영 중인 시설만 필터링
    if (!includeClosed) {
      facilities = facilities.filter(facility => 
        airportDB.isFacilityOperating(facility)
      );
    }

    // 정렬
    facilities = this.sortFacilities(facilities, sortBy);

    // 제한
    if (limit) {
      facilities = facilities.slice(0, limit);
    }

    return facilities;
  }

  /**
   * 시설 상세 정보 조회
   */
  async getFacilityDetails(facilityId, tableName) {
    await this.init();

    const result = airportDB.db.exec(
      `SELECT * FROM ${tableName} WHERE id = ?`,
      [facilityId]
    );

    if (result.length > 0) {
      const columns = result[0].columns;
      const values = result[0].values[0];
      
      const facility = {};
      columns.forEach((col, index) => {
        facility[col] = values[index];
      });
      
      return facility;
    }

    return null;
  }

  /**
   * 공항 기본 정보 조회
   */
  async getAirportInfo(airportId = 'SIN') {
    await this.init();
    return await airportDB.getAirportInfo(airportId);
  }

  /**
   * 시설 검색
   */
  async searchFacilities(airportId, searchTerm, options = {}) {
    await this.init();

    const {
      categories = null,
      includeClosed = false,
      limit = 20
    } = options;

    let facilities = await airportDB.searchFacilities(airportId, searchTerm);

    // 카테고리 필터링
    if (categories && categories.length > 0) {
      facilities = facilities.filter(facility => 
        categories.includes(facility.type)
      );
    }

    // 운영 중인 시설만 필터링
    if (!includeClosed) {
      facilities = facilities.filter(facility => 
        airportDB.isFacilityOperating(facility)
      );
    }

    // 제한
    return facilities.slice(0, limit);
  }

  /**
   * 추천 시설 조회 (인기 있는 시설들)
   */
  async getRecommendedFacilities(airportId, limit = 10) {
    await this.init();

    const recommendations = [];
    
    // 각 카테고리에서 대표 시설 선택
    const categories = ['Lounge', 'Meal', 'Cafe', 'Attraction', 'Shopping'];
    
    for (const category of categories) {
      const facilities = await this.getFacilitiesByCategory(airportId, category, {
        includeClosed: false,
        limit: 2
      });
      
      recommendations.push(...facilities);
    }

    return recommendations.slice(0, limit);
  }

  /**
   * 운영 시간 기반 시설 조회
   */
  async getFacilitiesByOperatingHours(airportId, timeRange) {
    await this.init();

    const allFacilities = await airportDB.getAirportFacilities(airportId);
    const filteredFacilities = [];

    for (const facility of allFacilities) {
      if (this.isFacilityOperatingInRange(facility, timeRange)) {
        filteredFacilities.push(facility);
      }
    }

    return filteredFacilities;
  }

  /**
   * 시설 운영 시간 범위 확인
   */
  isFacilityOperatingInRange(facility, timeRange) {
    const { startTime, endTime } = timeRange;
    const facilityOpenTime = parseFloat(facility.open_time) * 60;
    const facilityCloseTime = parseFloat(facility.close_time) * 60;

    // 24시간 운영
    if (facility.open_time === '0' && facility.close_time === '24') {
      return true;
    }

    // 시간 범위가 겹치는지 확인
    const rangeStart = startTime * 60;
    const rangeEnd = endTime * 60;

    if (facilityCloseTime < facilityOpenTime) {
      // 자정을 넘어가는 경우
      return rangeStart < facilityCloseTime || rangeEnd > facilityOpenTime;
    } else {
      // 일반적인 경우
      return rangeStart < facilityCloseTime && rangeEnd > facilityOpenTime;
    }
  }

  /**
   * 시설 이름 필드 반환
   */
  getNameField(tableName) {
    const nameFields = {
      'rests_db_frame': 'rest_name',
      'airport_events_db_frame': 'event_name',
      'meal_options_db_frame': 'meal_name',
      'shopping_options_db_frame': 'shopping_options_name',
      'food_spot_db_frame': 'food_spot_name',
      'paid_activity_db_frame': 'paid_activity_name',
      'free_tour_db_frame': 'free_tour_name'
    };
    
    return nameFields[tableName] || 'name';
  }

  /**
   * 시설 정렬
   */
  sortFacilities(facilities, sortBy) {
    return facilities.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          const nameFieldA = this.getNameField(a.table_name);
          const nameFieldB = this.getNameField(b.table_name);
          return (a[nameFieldA] || '').localeCompare(b[nameFieldB] || '');
        
        case 'type':
          return (a.type || '').localeCompare(b.type || '');
        
        case 'location':
          return (a.location || '').localeCompare(b.location || '');
        
        default:
          return 0;
      }
    });
  }

  /**
   * 시설 운영 상태 정보 반환
   */
  getFacilityOperatingStatus(facility) {
    const isOperating = airportDB.isFacilityOperating(facility);
    const openTime = facility.open_time;
    const closeTime = facility.close_time;
    const businessHours = facility.business_hours;

    return {
      isOperating,
      openTime,
      closeTime,
      businessHours,
      statusText: isOperating ? '영업 중' : '영업 종료',
      statusClass: isOperating ? 'operating' : 'closed'
    };
  }
}

// 전역 인스턴스 생성
window.airportAPI = new AirportAPIService();

export default AirportAPIService;
