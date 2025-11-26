/**
 * Airport POI AI Chat Service
 * 공항 내부 POI를 AI로 검색하는 서비스
 * 기존 aiPlannerService와 호환되도록 설계
 */

import { getOpenAIApiKey } from './config.js';

class AirportPOIChatService {
  constructor() {
    this.apiKey = null;
    this.apiEndpoint = 'https://api.openai.com/v1/chat/completions';
  }

  /**
   * API 키 설정
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * 자연어로 POI 검색
   * @param {string} userQuery - 사용자 검색어
   * @param {Map|Array} allPOIs - 모든 POI 데이터 (Map 또는 Array)
   * @param {string} airportName - 공항 이름 (선택)
   * @returns {Promise<Array>} 추천된 POI 배열 (aiReason 포함)
   */
  async searchPOIsByNaturalLanguage(userQuery, allPOIs, airportName = '공항') {
    // API 키 확인
    if (!this.apiKey) {
      this.apiKey = getOpenAIApiKey();
      if (!this.apiKey || this.apiKey === 'YOUR_OPENAI_API_KEY') {
        throw new Error('OpenAI API 키가 설정되지 않았습니다.');
      }
    }

    // allPOIs를 배열로 변환 (Map인 경우)
    const poiArray = allPOIs instanceof Map 
      ? Array.from(allPOIs.values())
      : Array.isArray(allPOIs) 
        ? allPOIs 
        : [];

    if (poiArray.length === 0) {
      console.warn('검색할 POI 데이터가 없습니다.');
      return [];
    }

    // POI 데이터를 요약하여 프롬프트에 포함 (최대 200개로 증가)
    const poiSummary = this.summarizePOIs(poiArray.slice(0, 200));

    const prompt = `당신은 ${airportName} 내부 장소 추천 전문가입니다. 사용자의 자연어 질의를 정확히 이해하고 가장 적합한 장소를 추천하는 것이 당신의 역할입니다.

**사용자 질의:** "${userQuery}"

**${airportName} 내부 장소 목록:**
${poiSummary}

**추천 가이드라인:**
1. 사용자의 질의 의도를 정확히 파악하세요:
   - "면세점", "면세점 추천", "면세점 어디있어?" → Duty_free 카테고리 장소 추천
   - "식당", "먹을 곳", "밥 먹을 곳" → Meal, Cafe, Snack 카테고리 장소 추천
   - "쉴 수 있는 곳", "휴식", "라운지" → Rest, Lounge 카테고리 장소 추천
   - "쇼핑", "쇼핑몰", "브랜드샵" → Fashion, Beauty, Shopping 카테고리 장소 추천
   - "카페", "커피" → Cafe 카테고리 장소 추천
   - "디저트", "간식" → Dessert, Snack 카테고리 장소 추천

2. 유사한 의미의 키워드도 고려하세요:
   - "면세점" = "duty free", "면세", "세금 없는"
   - "식당" = "레스토랑", "음식점", "맛집"
   - "카페" = "커피숍", "커피", "음료"

3. 카테고리와 이름, 설명을 종합적으로 고려하여 가장 관련성이 높은 장소를 추천하세요.

4. 최대 5개까지 추천하되, 관련성이 높은 순서대로 정렬하세요.

**응답 형식 (반드시 JSON만 반환):**
{
  "recommendations": [
    {
      "poiId": "장소의 정확한 ID (위 목록에 있는 ID와 정확히 일치해야 함)",
      "reason": "추천 이유를 한국어로 간단명료하게 설명 (예: '면세점 카테고리로 사용자 질의와 정확히 일치합니다')"
    }
  ]
}

**중요:**
- poiId는 반드시 위 목록에 있는 ID와 정확히 일치해야 합니다.
- 적합한 장소가 없으면 빈 배열 []을 반환하세요.
- JSON 형식만 반환하고 다른 설명은 추가하지 마세요.`;

    try {
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
              content: '당신은 공항 내부 장소 추천 전문가입니다. 사용자의 자연어 질의를 정확히 이해하고, 제공된 장소 목록에서 가장 적합한 장소를 찾아 추천합니다. 카테고리, 이름, 설명을 종합적으로 고려하여 관련성이 높은 장소를 우선적으로 추천하세요. 반드시 유효한 JSON 형식으로만 응답하고, 다른 설명 없이 JSON만 반환하세요.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3, // 더 일관된 결과를 위해 낮춤
          max_tokens: 1500 // 더 많은 추천을 위해 증가
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 요청 실패: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        return [];
      }

      // JSON 파싱
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        // JSON 파싱 실패 시 텍스트에서 JSON 추출 시도
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          console.error('JSON 파싱 실패:', content);
          return [];
        }
      }

      const recommendations = parsed.recommendations || [];

      // POI ID로 실제 POI 객체 찾기
      const recommendedPOIs = recommendations
        .map(rec => {
          const poi = poiArray.find(p => p.id === rec.poiId);
          if (poi) {
            return {
              ...poi,
              aiReason: rec.reason || 'AI 추천 장소'
            };
          }
          return null;
        })
        .filter(Boolean);

      console.log('✅ [AI 채팅] POI 검색 완료', {
        query: userQuery,
        foundCount: recommendedPOIs.length,
        totalPOIs: poiArray.length
      });

      return recommendedPOIs;

    } catch (error) {
      console.error('❌ [AI 채팅] POI 검색 실패:', error);
      throw error;
    }
  }

  /**
   * POI 데이터를 요약하여 프롬프트에 포함
   * @param {Array} pois - POI 배열
   * @returns {string} 요약된 POI 목록 문자열
   */
  summarizePOIs(pois) {
    if (!pois || pois.length === 0) {
      return '장소 정보가 없습니다.';
    }

    // 카테고리별로 그룹화하여 더 구조화된 정보 제공
    const categoryGroups = {};
    pois.forEach(poi => {
      const category = poi.category || '기타';
      if (!categoryGroups[category]) {
        categoryGroups[category] = [];
      }
      categoryGroups[category].push(poi);
    });

    let summary = '';
    Object.keys(categoryGroups).forEach(category => {
      summary += `\n[${category} 카테고리]\n`;
      categoryGroups[category].forEach((poi, index) => {
        const name = poi.name || '이름 없음';
        const location = poi.location || '위치 정보 없음';
        const description = poi.description ? ` - ${poi.description.substring(0, 80)}` : '';
        
        summary += `  ${index + 1}. ID: "${poi.id}", 이름: "${name}", 위치: "${location}"${description}\n`;
      });
    });

    return summary;
  }

  /**
   * 대화 히스토리 초기화 (필요시 사용)
   */
  resetConversation() {
    // 현재는 상태를 유지하지 않지만, 필요시 확장 가능
  }
}

// 싱글톤 인스턴스
export const airportPOIChatService = new AirportPOIChatService();

