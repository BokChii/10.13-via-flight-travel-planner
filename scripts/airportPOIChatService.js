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

    // POI 데이터를 요약하여 프롬프트에 포함 (최대 100개)
    const poiSummary = this.summarizePOIs(poiArray.slice(0, 100));

    const prompt = `당신은 ${airportName} 내부 장소 추천 전문가입니다.

사용자가 "${userQuery}"라고 검색했습니다.

다음은 ${airportName} 내부에 있는 장소 목록입니다:
${poiSummary}

사용자의 검색어를 분석하여 가장 적합한 장소를 최대 5개까지 추천해주세요.
각 장소는 다음 JSON 형식으로 응답해주세요:
{
  "recommendations": [
    {
      "poiId": "장소의 고유 ID (정확히 일치해야 함)",
      "reason": "추천 이유 (한국어로 간단히 설명)"
    }
  ]
}

만약 적합한 장소를 찾을 수 없다면 빈 배열을 반환하세요.
반드시 유효한 JSON 형식으로만 응답하세요.`;

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
              content: '당신은 공항 내부 장소 추천 전문가입니다. 사용자의 자연어 검색을 분석하여 적합한 장소를 추천합니다. 항상 유효한 JSON 형식으로만 응답하세요. 다른 설명 없이 JSON만 반환하세요.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
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

    return pois.map((poi, index) => {
      const name = poi.name || '이름 없음';
      const category = poi.category || '기타';
      const location = poi.location || '위치 정보 없음';
      const description = poi.description ? ` (${poi.description.substring(0, 50)}...)` : '';
      
      return `${index + 1}. ID: "${poi.id}", 이름: "${name}", 카테고리: "${category}", 위치: "${location}"${description}`;
    }).join('\n');
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

