/**
 * AI Tips Service
 * OpenAI API를 활용한 맞춤 여행 팁 생성 서비스
 */

class AITipsService {
  constructor() {
    this.apiKey = null;
    this.apiEndpoint = 'https://api.openai.com/v1/chat/completions';
    this.cache = new Map();
    this.cacheDuration = 60 * 60 * 1000; // 1시간 캐싱
  }

  /**
   * API 키 설정
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * 공항 내부 일정에 대한 맞춤 팁 생성 (전체 일정)
   */
  async generateAirportScheduleTips(selectedPOIs, transferInfo, allPOIsMap) {
    const cacheKey = this.getScheduleCacheKey(selectedPOIs, transferInfo);
    
    // 캐시 확인
    const cached = this.getCachedTip(cacheKey);
    if (cached) {
      console.log('✅ AI 팁 캐시에서 반환');
      return cached;
    }

    if (!this.apiKey) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    // POI 정보 수집
    const poiDetails = selectedPOIs.map(poiId => {
      const poi = allPOIsMap.get(poiId);
      if (!poi) return null;
      
      return {
        name: poi.name,
        category: poi.category,
        location: poi.location,
        businessHours: poi.businessHours,
        estimatedTime: poi.estimatedTime
      };
    }).filter(p => p !== null);

    // 프롬프트 생성
    const prompt = this.buildSchedulePrompt(poiDetails, transferInfo);

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '당신은 전문 여행 가이드입니다. 환승 여행자를 위해 공항 내부에서 시간을 효율적으로 보낼 수 있는 실용적이고 구체적인 팁을 제공합니다.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API 오류: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
      }

      const data = await response.json();
      const tipsText = data.choices[0].message.content;
      
      // 팁 파싱
      const tips = this.parseScheduleTips(tipsText);

      // 캐시 저장
      this.cacheTip(cacheKey, tips);

      return tips;

    } catch (error) {
      console.error('AI 팁 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 개별 POI에 대한 맞춤 팁 생성
   */
  async generatePOITip(poi, transferInfo, visitTime) {
    const cacheKey = this.getPOICacheKey(poi.id, visitTime);
    
    // 캐시 확인
    const cached = this.getCachedTip(cacheKey);
    if (cached) {
      console.log('✅ POI AI 팁 캐시에서 반환');
      return cached;
    }

    if (!this.apiKey) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    // 프롬프트 생성
    const prompt = this.buildPOIPrompt(poi, transferInfo, visitTime);

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '당신은 싱가포르 공항 내부에 대한 전문 여행 가이드입니다. 모든 응답은 반드시 유효한 JSON 형식으로만 제공해야 합니다. JSON 외의 다른 텍스트, 설명, 마크다운 코드 블록은 포함하지 마세요. 오직 순수 JSON만 응답하세요.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 500 // 토큰 수 증가 (더 상세한 팁을 위해)
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API 오류: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
      }

      const data = await response.json();
      const tipText = data.choices[0].message.content;
      
      // 팁 파싱
      const tip = this.parsePOITip(tipText, poi.name);

      // 캐시 저장
      this.cacheTip(cacheKey, tip);

      return tip;

    } catch (error) {
      console.error('POI AI 팁 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 전체 일정 프롬프트 생성
   */
  buildSchedulePrompt(poiDetails, transferInfo) {
    const poiList = poiDetails.map(poi => 
      `- ${poi.name} (${poi.category}): ${poi.location || '위치 정보 없음'}, 예상 소요시간: ${poi.estimatedTime}분, 영업시간: ${poi.businessHours || '정보 없음'}`
    ).join('\n');

    const durationHours = Math.floor(transferInfo.duration / (1000 * 60 * 60));
    const durationMinutes = Math.floor((transferInfo.duration % (1000 * 60 * 60)) / (1000 * 60));
    const arrivalDate = new Date(transferInfo.arrival);
    const departureDate = new Date(transferInfo.departure);

    return `
당신은 전문 여행 가이드입니다. 환승 여행자를 위해 다음 정보를 바탕으로 실용적인 팁을 제공해주세요.

**환승 정보:**
- 경유 도시: ${transferInfo.city}
- 환승 시간: ${durationHours}시간 ${durationMinutes}분
- 도착 시간: ${arrivalDate.toLocaleString('ko-KR')}
- 출발 시간: ${departureDate.toLocaleString('ko-KR')}

**선택한 장소:**
${poiList}

다음 형식으로 JSON 배열로 응답해주세요:
[
  {
    "icon": "이모지",
    "title": "팁 제목",
    "description": "구체적이고 실용적인 팁 설명"
  }
]

팁은 다음을 포함해야 합니다:
1. 선택한 장소들을 방문하는 최적 순서나 조합 팁
2. 환승 시간을 고려한 시간 관리 팁
3. 각 장소별 특별 주의사항이나 이용 팁
4. 도시별 특별 정보 (필요시)

총 3-4개의 팁을 제공해주세요. 각 팁은 1-2문장으로 간결하게 작성해주세요.
`;
  }

  /**
   * POI 프롬프트 생성
   */
  buildPOIPrompt(poi, transferInfo, visitTime) {
    const visitDate = new Date(visitTime);
    const hour = visitDate.getHours();
    const timeOfDay = hour >= 6 && hour < 12 ? '아침' : 
                      hour >= 12 && hour < 18 ? '오후' : 
                      hour >= 18 && hour < 22 ? '저녁' : '심야';
    
    return `당신은 싱가포르 공항 내부에 대한 전문 여행 가이드입니다. 실제 블로그 리뷰, 여행 포럼, 실제 방문 경험을 바탕으로 구체적이고 실용적인 팁을 제공해주세요.

**장소 정보:**
- 이름: ${poi.name}
- 카테고리: ${poi.category || '음식점/카페'}
- 위치: ${poi.location || '정보 없음'}
- 영업시간: ${poi.businessHours || '정보 없음'}
- 예상 체류시간: ${poi.estimatedTime}분
- 방문 시간: ${visitDate.toLocaleString('ko-KR')} (${timeOfDay} 시간대)

**환승 정보:**
- 경유 도시: ${transferInfo.city}
- 방문 시각: ${visitDate.toLocaleString('ko-KR')}

**응답 형식:**
반드시 다음 JSON 형식으로만 응답하세요. 다른 설명이나 텍스트는 포함하지 마세요.

**Few-shot 예시 1 (음식점) - 출처 포함:**
{
  "title": "4 Fingers Crispy Chicken 방문 팁",
  "tips": [
    "인기 메뉴는 양념치킨(Wings Set, 약 S$8-12)과 허니치킨입니다. 환승 여행자에게는 콤보 세트(Wings + Waffle Fries + 콜라)가 가성비 좋습니다. 오후 시간대(13:00-15:00)에는 대기 시간이 15-20분 소요될 수 있으니 시간 여유가 있을 때 방문하거나 모바일 앱으로 미리 주문하는 것을 권장합니다.",
    "공항 내 터미널별로 위치가 다르므로 게이트 확인이 필요합니다. 터미널 1, 2, 3에 위치하며, 각 터미널 간 이동은 SkyTrain으로 5-10분이 소요됩니다. 짐이 많다면 현재 터미널의 매장을 우선 이용하는 것이 편리합니다.",
    "싱가포르 공항 특화 메뉴로 마라 양념치킨이 있으며, 한국인 입맛에 잘 맞는다는 후기가 많습니다. 환승 시간이 짧다면(1시간 이하) 테이크아웃을 선택하는 것이 더 빠르고, 2시간 이상 여유가 있다면 매장에서 여유롭게 식사할 수 있습니다."
  ],
  "sources": [
    {
      "type": "official",
      "url": "https://www.4fingers.com/",
      "label": "4 Fingers 공식 웹사이트"
    },
    {
      "type": "blog",
      "url": "https://www.changiairport.com/en/airport-guide/dining.html",
      "label": "창이 공항 공식 가이드"
    }
  ]
}

**Few-shot 예시 2 (카페/디저트) - 출처 없음:**
{
  "title": "Birds of Paradise Gelato Boutique 방문 팁",
  "tips": [
    "싱가포르 현지에서 인기 있는 아이스크림 전문점으로, 시그니처 맛은 화이트 찰리(White Chrysanthemum, 약 S$5.90)와 스트로베리 베이스(Strawberry Basil)입니다. 작은 사이즈(Single Scoop) 한 개로도 충분히 만족스러우며, 환승 여행자에게 가볍게 즐기기 좋습니다.",
    "매장은 보통 오후 시간대(14:00-17:00)에 혼잡하며, 주말에는 대기 시간이 더 길 수 있습니다. 평일 오전이나 저녁 시간대가 상대적으로 한산합니다. 가벼운 간식으로 선택하기 좋으며, 10-15분 정도면 충분히 즐길 수 있습니다.",
    "공항 내 터미널 1과 3에 위치하며, 특별한 시즌 메뉴가 있을 수 있어 매장 앞 메뉴판을 확인하는 것을 권장합니다. 쇼핑 후 마지막으로 방문하거나, 게이트 근처라면 출발 전에 방문하여 싱가포르의 특별한 맛을 경험할 수 있습니다."
  ],
  "sources": null,
  "sourceNote": "※ 위 정보는 일반적인 공항 이용 경험과 일반적인 정보를 바탕으로 작성되었습니다."
}

**Few-shot 예시 3 (쇼핑/면세점) - 출처 포함:**
{
  "title": "Lotte Duty Free 방문 팁",
  "tips": [
    "한국 브랜드 제품(화장품, 향수 등)의 경우 한국보다 저렴하게 구매할 수 있으며, 특히 세트 상품이나 프로모션 진행 시 가격 할인이 큽니다. 환승 여행자는 체크인 짐 한도 제한을 고려하여 작은 용량의 향수나 스킨케어 세트를 구매하는 것이 좋습니다.",
    "공항 면세점은 출발 게이트 근처에 위치한 경우가 많아, 체크인 후 보안 검색대를 통과한 뒤 방문하는 것이 편리합니다. 대형 화장품 브랜드(라네즈, 설화수, 후 등)는 직원이 한국어를 구사할 수 있어 상품 문의가 수월합니다.",
    "면세점 쇼핑은 출발 2시간 전부터 혼잡해지므로, 환승 시간이 충분하다면 오전이나 오후 시간대에 먼저 방문하여 여유롭게 쇼핑하는 것을 권장합니다. 구매 후에는 바로 짐에 넣어 출발 게이트로 이동하면 됩니다."
  ],
  "sources": [
    {
      "type": "official",
      "url": "https://www.lottedfs.com/kr",
      "label": "롯데면세점 공식 웹사이트"
    }
  ]
}

**작성 지침:**
위 예시와 같은 수준의 구체적이고 실용적인 팁을 제공해주세요:
- 실제 메뉴명, 가격 범위, 추천 상품명 포함
- 혼잡 시간대, 대기 시간 등 구체적인 정보
- 환승 여행자에게 특히 유용한 실용적 팁
- 위치, 접근성, 이용 방법 등 구체적 가이드

**출처 정보:**
- 실제 공식 웹사이트나 신뢰할 수 있는 블로그/리뷰 사이트가 있다면 sources 배열에 포함하세요.
- sources는 null이거나 빈 배열일 수 있습니다. 이 경우 sourceNote를 명시해주세요.
- 출처가 확실하지 않거나 검증되지 않은 정보라면 sources를 null로 설정하고 sourceNote에 "일반적인 정보 기반"이라고 명시하세요.
- 절대 거짓 링크나 존재하지 않는 URL을 생성하지 마세요. 확실한 URL만 포함하세요.

**중요:** 반드시 JSON 형식으로만 응답하세요. 다른 설명이나 텍스트 없이 오직 JSON만 응답하세요.`;
  }

  /**
   * 전체 일정 팁 파싱
   */
  parseScheduleTips(text) {
    try {
      // JSON 추출 시도
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      
      // JSON이 아니면 기본 형식으로 파싱
      return this.parseTextTips(text);
    } catch (error) {
      console.error('팁 파싱 실패:', error);
      return this.parseTextTips(text);
    }
  }

  /**
   * POI 팁 파싱
   */
  parsePOITip(text, poiName) {
    try {
      // 1. 코드 블록에서 JSON 추출 시도
      const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          const parsed = JSON.parse(codeBlockMatch[1]);
          if (parsed.title && parsed.tips && Array.isArray(parsed.tips)) {
            return parsed;
          }
        } catch (e) {
          // 코드 블록 파싱 실패
        }
      }
      
      // 2. 중첩된 JSON 객체 처리 - 가장 바깥쪽 객체만 추출
      const jsonMatches = text.match(/\{[\s\S]*?\}/g);
      if (jsonMatches && jsonMatches.length > 0) {
        // 가장 긴 JSON 객체를 찾아서 파싱 (중첩된 객체보다 바깥쪽 객체가 더 길 것)
        let bestMatch = null;
        let maxLength = 0;
        
        for (const match of jsonMatches) {
          try {
            const parsed = JSON.parse(match);
            if (parsed.title && parsed.tips && Array.isArray(parsed.tips) && parsed.tips.length > 0) {
              // tips 배열의 모든 요소가 문자열인지 확인
              const allStrings = parsed.tips.every(tip => typeof tip === 'string' && tip.length > 10);
              if (allStrings && match.length > maxLength) {
                maxLength = match.length;
                bestMatch = parsed;
              }
            }
          } catch (e) {
            continue;
          }
        }
        
        if (bestMatch) {
          // sources 필드 처리
          if (!bestMatch.sources) {
            bestMatch.sources = null;
          }
          if (!bestMatch.sourceNote && !bestMatch.sources) {
            bestMatch.sourceNote = "※ 위 정보는 일반적인 정보와 일반적인 경험을 바탕으로 작성되었습니다.";
          }
          return bestMatch;
        }
      }
      
      // 3. 직접 JSON 파싱 시도 (전체 텍스트가 JSON인 경우)
      try {
        const parsed = JSON.parse(text.trim());
        if (parsed.title && parsed.tips && Array.isArray(parsed.tips)) {
          // sources 필드 처리
          if (!parsed.sources) {
            parsed.sources = null;
          }
          if (!parsed.sourceNote && !parsed.sources) {
            parsed.sourceNote = "※ 위 정보는 일반적인 정보와 일반적인 경험을 바탕으로 작성되었습니다.";
          }
          return parsed;
        }
      } catch (e) {
        // JSON이 아니면 다음 단계로
      }
      
      // 4. JSON이 아니면 텍스트에서 팁 추출
      const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => !line.match(/^[{"\[\]]/) && !line.match(/^[}\]\],]/)); // JSON 구문 제거
      
      // "tips" 배열을 찾아서 추출
      const tipsStart = text.indexOf('"tips"');
      if (tipsStart !== -1) {
        const tipsSection = text.substring(tipsStart);
        const tipsMatches = tipsSection.match(/"([^"]{20,})"/g); // 최소 20자 이상인 문자열만
        if (tipsMatches && tipsMatches.length > 0) {
          const tips = tipsMatches
            .map(m => m.replace(/^"/, '').replace(/"$/, ''))
            .filter(t => t.length > 10 && !t.match(/^(title|tips)$/i) && !t.match(/^[\[\]{},]/));
          
          if (tips.length > 0) {
            return {
              title: `${poiName} 방문 팁`,
              tips: tips.slice(0, 3)
            };
          }
        }
      }
      
      // 5. 기본 텍스트 파싱
      const validLines = lines.filter(line => 
        line.length > 20 && 
        !line.match(/^(title|tips|장소|정보|환승|예시|Few-shot)/i) &&
        !line.match(/^[{}\[\]",]/) &&
        !line.match(/^```/)
      );
      
      if (validLines.length > 0) {
        return {
          title: `${poiName} 방문 팁`,
          tips: validLines.slice(0, 3).map(line => 
            line.replace(/^[-•*]\s*/, '')
                .replace(/^\d+[.)]\s*/, '')
                .trim()
          ).filter(tip => tip.length > 15)
        };
      }
      
      // 6. 마지막 fallback
      console.warn('POI 팁 파싱 실패 - fallback 사용:', text.substring(0, 100));
      return {
        title: `${poiName} 방문 팁`,
        tips: ['이용 팁을 불러오는데 문제가 발생했습니다. 잠시 후 다시 시도해주세요.']
      };
      
    } catch (error) {
      console.error('POI 팁 파싱 실패:', error);
      console.error('원본 텍스트:', text.substring(0, 200));
      return {
        title: `${poiName} 방문 팁`,
        tips: ['팁을 파싱하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.']
      };
    }
  }

  /**
   * 텍스트 형식 팁 파싱
   */
  parseTextTips(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const tips = [];
    
    let currentTip = null;
    lines.forEach(line => {
      const iconMatch = line.match(/^([🎒📶🛂⏰🍽️🛍️🎨💆🚇📱💳🌐🎫🔌💰🎁🏥🚰📞🔋✨🎯🏃💨🎪🎭🎨📚🛎️💼👜👟🧳🎒🍕🍔🍜🍰☕🍹🧊🎂🍪🍩🍯🥐🥗🍖🍗🥘🥙🌮🌯🥟🥠🥡🍱🍘🍙🍚🍛🍜🍝🍞🍟🍠🍡🍢🍣🍤🍥🍦🍧🍨🍩🍪🍫🍬🍭🍮🍯🍰🍱🍲🍳🍴🍵🍶🍷🍸🍹🍺🍻🍼🍽️🎂🎃🎄🎅🎆🎇🎈🎉🎊🎋🎌🎍🎎🎏🎐🎑🎒🎓🎖️🎗️🎙️🎚️🎛️🎜🎝🎞️🎟️🎠🎡🎢🎣🎤🎥🎦🎧🎨🎩🎪🎫🎬🎭🎮🎯🎰🎱🎲🎳🎴🎵🎶🎷🎸🎹🎺🎻🎼🎽🎾🎿🏀🏁🏂🏃🏄🏅🏆🏇🏈🏉🏊🏋️🏌️🏍️🏎️🏏🏐🏑🏒🏓🏔️🏕️🏖️🏗️🏘️🏙️🏚️🏛️🏜️🏝️🏞️🏟️🏠🏡🏢🏣🏤🏥🏦🏧🏨🏩🏪🏫🏬🏭🏮🏯🏰🏱🏲🏳️🏴🏵️🏶🏷️🏸🏹🏺🏻🏼🏽🏾🏿])\s*/);
      
      if (iconMatch) {
        if (currentTip) tips.push(currentTip);
        currentTip = {
          icon: iconMatch[1],
          title: line.replace(iconMatch[0], '').trim(),
          description: ''
        };
      } else if (currentTip && line.trim()) {
        currentTip.description += (currentTip.description ? ' ' : '') + line.trim();
      }
    });
    
    if (currentTip) tips.push(currentTip);
    
    return tips.length > 0 ? tips : [
      {
        icon: '💡',
        title: '일정 팁',
        description: text.substring(0, 100) + '...'
      }
    ];
  }

  /**
   * 캐시 키 생성 (전체 일정)
   */
  getScheduleCacheKey(selectedPOIs, transferInfo) {
    const poiIds = selectedPOIs.sort().join(',');
    const city = transferInfo.city;
    const duration = Math.floor(transferInfo.duration / (1000 * 60));
    return `schedule_tips_${city}_${duration}_${poiIds}`;
  }

  /**
   * 캐시 키 생성 (POI)
   */
  getPOICacheKey(poiId, visitTime) {
    const timeKey = new Date(visitTime).toISOString().split('T')[0];
    return `poi_tip_${poiId}_${timeKey}`;
  }

  /**
   * 캐시된 팁 가져오기
   */
  getCachedTip(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheDuration) {
      return cached.tips;
    }
    return null;
  }

  /**
   * 팁 캐시 저장
   */
  cacheTip(key, tips) {
    this.cache.set(key, {
      tips,
      timestamp: Date.now()
    });
  }
}

// 전역 인스턴스 생성
window.aiTipsService = new AITipsService();
