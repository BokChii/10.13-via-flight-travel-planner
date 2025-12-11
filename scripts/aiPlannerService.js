/**
 * AI Planner Service
 * OpenAI API를 활용한 대화형 여행 일정 자동 생성 서비스
 */

class AIPlannerService {
  constructor() {
    this.apiKey = null;
    this.apiEndpoint = 'https://api.openai.com/v1/chat/completions';
    this.conversationHistory = [];
  }

  /**
   * API 키 설정
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * 대화에서 일정 생성
   * @param {string} userMessage - 사용자 메시지
   * @param {Object} transferInfo - 환승 정보
   * @returns {Promise<Object>} - 생성된 일정 데이터
   */
  async generatePlanFromChat(userMessage, transferInfo) {
    if (!this.apiKey) {
      // API 키 가져오기 (config.js의 getOpenAIApiKey 우선 사용)
      if (window.getOpenAIApiKey) {
        this.apiKey = window.getOpenAIApiKey();
      } else {
        // 폴백: meta 태그에서 직접 읽기
        const metaKey = document.querySelector('meta[name="openai-api-key"]');
        if (metaKey && metaKey.content && metaKey.content !== 'YOUR_OPENAI_API_KEY') {
          this.apiKey = metaKey.content;
        }
      }
      
      if (!this.apiKey || this.apiKey === 'YOUR_OPENAI_API_KEY') {
        throw new Error('OpenAI API 키가 설정되지 않았습니다.');
      }
    }

    // 대화 히스토리에 추가
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    try {
      // 1단계: 사용자 의도 분석
      const intent = await this.analyzeUserIntent(userMessage, transferInfo);
      
      // 2단계: 카테고리 및 POI 추천
      const recommendations = await this.generateRecommendations(intent, transferInfo);
      
      // 3단계: 일정 생성
      const planData = await this.createPlanFromRecommendations(recommendations, transferInfo, intent);
      
      // AI 응답 메시지 생성
      const responseMessage = this.buildResponseMessage(intent, recommendations, planData);
      
      // 대화 히스토리에 AI 응답 추가
      this.conversationHistory.push({
        role: 'assistant',
        content: responseMessage
      });

      return {
        message: responseMessage,
        recommendations: recommendations.summary || [],
        planGenerated: true,
        planData: planData
      };

    } catch (error) {
      console.error('AI 일정 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 사용자 의도 분석
   */
  async analyzeUserIntent(userMessage, transferInfo) {
    const prompt = this.buildIntentAnalysisPrompt(userMessage, transferInfo);

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '당신은 전문 여행 플래너입니다. 사용자의 메시지를 분석하여 여행 선호도를 파악하고, 구조화된 JSON 형식으로 응답합니다.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API 오류: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
    }

    const data = await response.json();
    const intentText = data.choices[0].message.content;
    
    try {
      const intent = JSON.parse(intentText);
      return intent;
    } catch (e) {
      console.warn('의도 분석 파싱 실패, 기본값 사용:', e);
      return this.getDefaultIntent(userMessage);
    }
  }

  /**
   * 의도 분석 프롬프트 생성
   */
  buildIntentAnalysisPrompt(userMessage, transferInfo) {
    const durationHours = Math.floor(transferInfo.duration / (1000 * 60 * 60));
    const durationMinutes = Math.floor((transferInfo.duration % (1000 * 60 * 60)) / (1000 * 60));
    const totalMinutes = durationHours * 60 + durationMinutes;
    const arrivalDate = new Date(transferInfo.arrival);
    const departureDate = new Date(transferInfo.departure);
    
    // 시간대 정보 추가
    const arrivalHour = arrivalDate.getHours();
    const isMorning = arrivalHour >= 6 && arrivalHour < 12;
    const isAfternoon = arrivalHour >= 12 && arrivalHour < 18;
    const isEvening = arrivalHour >= 18 || arrivalHour < 6;
    const timeOfDay = isMorning ? '오전' : isAfternoon ? '오후' : '저녁/밤';

    return `사용자의 여행 요청을 분석하여 다음 JSON 형식으로 응답해주세요:

**환승 정보 (중요 - 이 정보를 반드시 고려하세요):**
- 경유 도시: ${transferInfo.city}
- 환승 시간: ${durationHours}시간 ${durationMinutes}분 (총 ${totalMinutes}분)
- 도착 시간: ${arrivalDate.toLocaleString('ko-KR')} (${timeOfDay})
- 출발 시간: ${departureDate.toLocaleString('ko-KR')}
- 시간대: ${timeOfDay} 도착

**시간 제약 고려사항:**
- 총 환승 시간이 ${durationHours}시간 ${durationMinutes}분이므로, 각 장소 방문 시간과 이동 시간을 고려하여 현실적인 일정을 추천해야 합니다.
- ${durationHours < 4 ? '짧은 환승 시간이므로 공항 내부 활동 위주로 추천하세요.' : durationHours < 8 ? '중간 환승 시간이므로 공항 내부와 가까운 도시 장소를 추천하세요.' : '충분한 환승 시간이므로 다양한 활동을 추천할 수 있습니다.'}
- 도착 시간이 ${isMorning ? '오전이므로 아침 식사나 조식 장소를 우선 고려하세요.' : isAfternoon ? '오후이므로 점심 식사나 오후 활동을 우선 고려하세요.' : '저녁/밤이므로 저녁 식사나 야경 장소를 우선 고려하세요.'}
- estimatedStayTime은 총 환승 시간의 60-70%를 넘지 않도록 설정하세요 (이동 시간과 여유 시간 고려).

**사용자 메시지:**
"${userMessage}"

**응답 형식 (JSON):**
{
  "tripType": "airport-only" 또는 "airport-external",
  "preferences": {
    "airport": ["shopping", "food", "culture", "relax"] 중 선택 (배열),
    "city": ["food", "shopping", "culture", "nature", "view"] 중 선택 (배열, tripType이 airport-external인 경우만)
  },
  "keywords": ["사용자 메시지에서 추출한 키워드 배열"],
  "estimatedStayTime": 숫자 (분 단위, 환승 시간을 고려하여 현실적인 값으로 설정, 최대 ${Math.floor(totalMinutes * 0.7)}분),
  "priority": "shopping" 또는 "food" 또는 "culture" 등 (가장 우선순위가 높은 카테고리)
}

**분석 가이드:**
- 환승 시간이 4시간 미만이면 tripType을 "airport-only"로 권장
- 환승 시간이 4시간 이상이면 tripType을 "airport-external"로 권장 가능
- "공항에만", "공항 내부" 등의 키워드가 있으면 tripType: "airport-only"
- "도시", "나가서", "관광" 등의 키워드가 있으면 tripType: "airport-external"
- 카테고리 매핑:
  * 쇼핑/면세점 관련 → "shopping"
  * 음식/맛집/식사 관련 → "food"
  * 문화/체험/박물관 관련 → "culture"
  * 휴식/라운지/스파 관련 → "relax"
  * 자연/공원 관련 → "nature"
  * 전망/야경 관련 → "view"
`;
  }

  /**
   * 기본 의도 반환 (파싱 실패 시)
   */
  getDefaultIntent(userMessage) {
    const message = userMessage.toLowerCase();
    let tripType = 'airport-only';
    const preferences = {
      airport: [],
      city: []
    };

    // tripType 판단
    if (message.includes('도시') || message.includes('나가') || message.includes('관광')) {
      tripType = 'airport-external';
    }

    // 카테고리 추출
    if (message.includes('쇼핑') || message.includes('면세')) {
      preferences.airport.push('shopping');
      if (tripType === 'airport-external') preferences.city.push('shopping');
    }
    if (message.includes('음식') || message.includes('맛집') || message.includes('식사') || message.includes('먹')) {
      preferences.airport.push('food');
      if (tripType === 'airport-external') preferences.city.push('food');
    }
    if (message.includes('문화') || message.includes('체험') || message.includes('박물관')) {
      preferences.airport.push('culture');
      if (tripType === 'airport-external') preferences.city.push('culture');
    }
    if (message.includes('휴식') || message.includes('라운지') || message.includes('스파')) {
      preferences.airport.push('relax');
    }

    // 기본값 (아무것도 없으면)
    if (preferences.airport.length === 0) {
      preferences.airport = ['shopping', 'food'];
      if (tripType === 'airport-external') preferences.city = ['food', 'shopping'];
    }

    return {
      tripType: tripType,
      preferences: preferences,
      keywords: [],
      estimatedStayTime: 60,
      priority: preferences.airport[0] || 'shopping'
    };
  }

  /**
   * 추천 생성
   */
  async generateRecommendations(intent, transferInfo) {
    // 실제로는 AI가 더 구체적인 추천을 할 수 있지만,
    // 여기서는 의도 분석 결과를 바탕으로 추천을 생성
    const recommendations = {
      airportCategories: intent.preferences.airport || [],
      cityCategories: intent.preferences.city || [],
      estimatedStayTime: intent.estimatedStayTime || 60,
      priority: intent.priority || 'shopping'
    };

    // 추천 요약 생성
    const summary = [];
    if (recommendations.airportCategories.length > 0) {
      const airportLabels = {
        shopping: '면세점 쇼핑',
        food: '공항 맛집',
        culture: '문화체험',
        relax: '휴식 & 라운지'
      };
      summary.push(`공항 내부: ${recommendations.airportCategories.map(c => airportLabels[c] || c).join(', ')}`);
    }
    if (recommendations.cityCategories.length > 0) {
      const cityLabels = {
        food: '로컬 맛집',
        shopping: '쇼핑',
        culture: '문화 & 역사',
        nature: '자연 & 정원',
        view: '전망 & 야경'
      };
      summary.push(`도시 탐방: ${recommendations.cityCategories.map(c => cityLabels[c] || c).join(', ')}`);
    }

    recommendations.summary = summary;

    return recommendations;
  }

  /**
   * 추천을 바탕으로 일정 생성
   */
  async createPlanFromRecommendations(recommendations, transferInfo, intent) {
    // 실제 POI 데이터 가져오기
    const planData = {
      type: intent.tripType,
      airportPOIs: [],
      cityPOIs: [],
      selectedCategories: {
        airport: recommendations.airportCategories,
        city: recommendations.cityCategories
      },
      estimatedStayTime: recommendations.estimatedStayTime
    };

    // 공항 내부 POI 가져오기
    if (recommendations.airportCategories.length > 0) {
      planData.airportPOIs = await this.fetchAirportPOIs(
        recommendations.airportCategories,
        transferInfo
      );
    }

    // 도시 POI 가져오기 (airport-external인 경우)
    if (intent.tripType === 'airport-external' && recommendations.cityCategories.length > 0) {
      planData.cityPOIs = await this.fetchCityPOIs(
        recommendations.cityCategories,
        transferInfo,
        recommendations.estimatedStayTime
      );
    }

    return planData;
  }

  /**
   * 공항 내부 POI 가져오기
   */
  async fetchAirportPOIs(categories, transferInfo) {
    // sqliteClient를 사용하여 POI 가져오기
    if (!window.sqliteClient) {
      console.warn('sqliteClient가 없습니다.');
      return [];
    }

    const allPOIs = [];
    
    // 카테고리별 테이블 매핑
    const categoryTableMap = {
      shopping: 'shopping_options_db_frame',
      food: 'meal_options_db_frame',
      culture: 'airport_events_db_frame',
      relax: 'rests_db_frame'
    };

    try {
      await window.sqliteClient.initialize();
      
      for (const category of categories) {
        const tableName = categoryTableMap[category];
        if (!tableName) continue;

        try {
          const pois = await window.sqliteClient.getTablePOIs(tableName);
          
          // 운영 시간 필터링
          const availablePOIs = pois.filter(poi => {
            if (!poi.businessHours) return true;
            return this.isPOIAvailable(poi, transferInfo);
          });

          // 각 카테고리에서 최대 2개씩 선택 (총 3~5개 목표)
          allPOIs.push(...availablePOIs.slice(0, 2));
        } catch (error) {
          console.warn(`카테고리 ${category} POI 가져오기 실패:`, error);
        }
      }
      
      // 이름 기준으로 중복 제거 (동일 브랜드 여러 위치 제거)
      const uniquePOIs = this.removeDuplicatePOIsByName(allPOIs);
      
      // 최대 5개로 제한
      return uniquePOIs.slice(0, 5);
    } catch (error) {
      console.error('SQLite 초기화 실패:', error);
      return [];
    }
  }

  /**
   * 이름 기준으로 중복 POI 제거 (동일 브랜드 여러 위치 제거)
   */
  removeDuplicatePOIsByName(pois) {
    const seen = new Map();
    const uniquePOIs = [];
    
    for (const poi of pois) {
      // 이름을 정규화 (공백 제거, 소문자 변환)
      const normalizedName = poi.name.trim().toLowerCase();
      
      // 같은 이름이 아직 없으면 추가
      if (!seen.has(normalizedName)) {
        seen.set(normalizedName, true);
        uniquePOIs.push(poi);
      }
    }
    
    return uniquePOIs;
  }

  /**
   * 도시 POI 가져오기
   */
  async fetchCityPOIs(categories, transferInfo, estimatedStayTime) {
    // cityPOIService를 사용하여 POI 가져오기
    if (!window.cityPOIService) {
      console.warn('cityPOIService가 없습니다. Google Maps API 초기화가 필요합니다.');
      return [];
    }

    const allPOIs = [];
    
    // Google Maps API 초기화 확인
    if (!window.cityPOIService.googleMaps) {
      try {
        // POI Service Manager를 통해 초기화
        if (window.poiServiceManager) {
          await window.poiServiceManager.initialize();
        } else {
          console.warn('poiServiceManager가 없습니다.');
          return [];
        }
      } catch (error) {
        console.error('Google Maps API 초기화 실패:', error);
        return [];
      }
    }
    
    // 카테고리별 Google Places API type 매핑
    const categoryTypeMap = {
      food: 'restaurant',
      shopping: 'shopping_mall',
      culture: 'tourist_attraction',
      nature: 'park',
      view: 'tourist_attraction'
    };

    // 도시 위치 가져오기 (간단한 방법: 도시 이름으로 검색)
    let cityLocation = null;
    try {
      // 기본 위치 (싱가포르)
      cityLocation = { lat: 1.3521, lng: 103.8198 };
      
      // Google Maps Geocoding으로 도시 위치 가져오기 (선택적)
      if (window.google && window.google.maps) {
        const geocoder = new window.google.maps.Geocoder();
        const result = await new Promise((resolve) => {
          geocoder.geocode({ address: transferInfo.city }, (results, status) => {
            if (status === 'OK' && results[0]) {
              resolve(results[0].geometry.location);
            } else {
              resolve(null);
            }
          });
        });
        if (result) {
          cityLocation = { lat: result.lat(), lng: result.lng() };
        }
      }
    } catch (error) {
      console.warn('도시 위치 가져오기 실패, 기본값 사용:', error);
    }

    for (const category of categories) {
      const placeType = categoryTypeMap[category];
      if (!placeType) continue;

      try {
        // cityPOIService의 searchCityPOIs 사용
        const pois = await window.cityPOIService.searchCityPOIs(
          cityLocation,
          [category],
          5000 // 5km 반경
        );

        // 각 카테고리에서 최대 2개씩 선택
        allPOIs.push(...pois.slice(0, 2));
      } catch (error) {
        console.warn(`도시 카테고리 ${category} POI 가져오기 실패:`, error);
      }
    }

    return allPOIs;
  }

  /**
   * 카테고리 라벨 가져오기
   */
  getCategoryLabel(category) {
    const labels = {
      food: '맛집',
      shopping: '쇼핑',
      culture: '문화',
      nature: '공원',
      view: '전망대'
    };
    return labels[category] || category;
  }

  /**
   * POI 운영 시간 확인
   */
  isPOIAvailable(poi, transferInfo) {
    if (!poi.businessHours) return true;
    
    // 간단한 운영 시간 체크 (실제로는 businessHours.js의 로직 사용)
    const arrival = new Date(transferInfo.arrival);
    const departure = new Date(transferInfo.departure);
    
    // 기본적으로 운영 중으로 가정 (실제 구현 시 businessHours.js 활용)
    return true;
  }

  /**
   * 응답 메시지 생성
   */
  buildResponseMessage(intent, recommendations, planData) {
    let message = '완벽해요! 요청하신 내용을 바탕으로 일정을 생성했습니다. 🎉\n\n';
    
    if (planData.airportPOIs.length > 0) {
      message += `**공항 내부:** ${planData.airportPOIs.length}개 장소 추천\n`;
      // 전체 장소 이름 표시 (일부만 잘라서 보여주지 않음)
      const airportNames = planData.airportPOIs.map(poi => poi.name).join(', ');
      if (airportNames) {
        message += `- ${airportNames}\n`;
      }
    }
    
    if (planData.cityPOIs.length > 0) {
      message += `\n**도시 탐방:** ${planData.cityPOIs.length}개 장소 추천\n`;
      // 전체 장소 이름 표시 (일부만 잘라서 보여주지 않음)
      const cityNames = planData.cityPOIs.map(poi => poi.name).join(', ');
      if (cityNames) {
        message += `- ${cityNames}\n`;
      }
    }
    
    message += '\n아래 버튼을 클릭하여 일정 페이지로 이동하세요.';
    
    return message;
  }
}

// 전역 인스턴스 생성
window.aiPlannerService = new AIPlannerService();

