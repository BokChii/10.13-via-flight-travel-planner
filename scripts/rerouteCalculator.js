/**
 * Reroute Calculator
 * 자동 재경로 계산 시스템
 * Phase 2: 실시간 네비게이션 개선
 */

import { REROUTE_CONFIG } from './config.js';
import { requestDirections } from './api.js';
import { buildRoutePlan } from './routing.js';
import { getRouteColors } from './palette.js';

class RerouteCalculator {
  constructor() {
    this.rerouteAttempts = 0;
    this.lastRerouteTime = 0;
    this.lastReroutePosition = null;
    this.isCalculating = false;
    this.pendingReroute = null;
  }

  /**
   * 재경로 제안이 필요한지 확인
   * @param {Object} deviation - 경로 이탈 정보
   * @param {Object} currentPosition - 현재 GPS 위치
   * @returns {boolean} 재경로 제안 필요 여부
   */
  shouldSuggestReroute(deviation, currentPosition) {
    console.log('🔄 [재경로] 제안 조건 확인 시작', {
      deviation: deviation ? {
        isDeviated: deviation.isDeviated,
        distance: deviation.distance,
        duration: deviation.duration
      } : null,
      currentPosition,
      rerouteAttempts: this.rerouteAttempts,
      maxAttempts: REROUTE_CONFIG.MAX_REROUTE_ATTEMPTS
    });

    if (!deviation || !deviation.isDeviated || !currentPosition) {
      console.log('❌ [재경로] 제안 조건 불만족: 이탈 정보 또는 위치 정보 없음');
      return false;
    }

    // 이탈 지속 시간 확인
    const deviationDuration = deviation.duration || 0;
    if (deviationDuration < REROUTE_CONFIG.REROUTE_SUGGESTION_DURATION_SECONDS) {
      console.log(`⏳ [재경로] 제안 조건 불만족: 이탈 지속 시간 부족 (${deviationDuration.toFixed(1)}초 < ${REROUTE_CONFIG.REROUTE_SUGGESTION_DURATION_SECONDS}초)`);
      return false;
    }

    // 재시도 제한 확인
    if (this.rerouteAttempts >= REROUTE_CONFIG.MAX_REROUTE_ATTEMPTS) {
      console.log(`🚫 [재경로] 제안 조건 불만족: 재시도 제한 도달 (${this.rerouteAttempts}/${REROUTE_CONFIG.MAX_REROUTE_ATTEMPTS})`);
      return false;
    }

    // 쿨다운 확인 (같은 위치에서 반복 계산 방지)
    const now = Date.now();
    if (this.lastReroutePosition) {
      const distance = this.calculateDistance(currentPosition, this.lastReroutePosition);
      const timeSinceLastReroute = now - this.lastRerouteTime;
      
      // 같은 위치에서 60초 이내에 재경로 계산했으면 제안 안 함
      if (distance < 100 && timeSinceLastReroute < REROUTE_CONFIG.REROUTE_COOLDOWN_MS) {
        console.log(`⏸️ [재경로] 제안 조건 불만족: 쿨다운 중 (거리: ${distance.toFixed(0)}m, 경과: ${Math.round(timeSinceLastReroute/1000)}초)`);
        return false;
      }
    }

    console.log('✅ [재경로] 제안 조건 만족! 재경로 제안 가능');
    return true;
  }

  /**
   * 현재 위치에서 다음 목적지까지의 재경로 계산
   * @param {Object} google - Google Maps SDK
   * @param {Object} currentPosition - 현재 GPS 위치
   * @param {Object} routePlan - 현재 경로 계획
   * @param {Object} progress - 진행률 정보 (progress.js에서 계산된 값)
   * @param {Object} state - 현재 애플리케이션 상태
   * @returns {Promise<Object|null>} 재경로 정보 또는 null
   */
  async calculateReroute(google, currentPosition, routePlan, progress, state) {
    if (!google || !currentPosition || !routePlan || !state) {
      throw new Error('재경로 계산에 필요한 정보가 부족합니다.');
    }

    if (this.isCalculating) {
      console.log('⚠️ [재경로] 계산이 이미 진행 중입니다.');
      return null;
    }

    // 재시도 제한 확인
    if (this.rerouteAttempts >= REROUTE_CONFIG.MAX_REROUTE_ATTEMPTS) {
      console.error(`🚫 [재경로] 재시도 제한 도달 (${this.rerouteAttempts}/${REROUTE_CONFIG.MAX_REROUTE_ATTEMPTS})`);
      throw new Error(`재경로 계산은 최대 ${REROUTE_CONFIG.MAX_REROUTE_ATTEMPTS}회까지 가능합니다.`);
    }

    console.log('🔄 [재경로] 계산 시작', {
      attempt: this.rerouteAttempts + 1,
      currentPosition,
      hasRoutePlan: !!routePlan,
      hasProgress: !!progress
    });

    this.isCalculating = true;
    this.rerouteAttempts++;

    try {
      // 현재 진행 중인 세그먼트 찾기
      const currentProgress = this.getCurrentProgressFromProgress(progress);
      if (!currentProgress) {
        console.error('❌ [재경로] 현재 진행 상황을 파악할 수 없습니다.');
        throw new Error('현재 진행 상황을 파악할 수 없습니다.');
      }

      console.log('📍 [재경로] 현재 진행 상황', currentProgress);

      // 다음 목적지 결정
      const nextDestination = this.getNextDestination(routePlan, currentProgress, state);
      if (!nextDestination) {
        console.error('❌ [재경로] 다음 목적지를 찾을 수 없습니다.');
        throw new Error('다음 목적지를 찾을 수 없습니다.');
      }

      console.log('🎯 [재경로] 다음 목적지 결정', {
        destination: nextDestination.label || nextDestination.address || '알 수 없음',
        location: nextDestination.location
      });

      // 재경로 계산
      console.log('⏳ [재경로] Google Directions API 호출 중...');
      const rerouteResult = await requestDirections({
        google: google,
        origin: currentPosition,
        destination: nextDestination.location || nextDestination.address || nextDestination.label,
        travelMode: google.maps.TravelMode.TRANSIT
      });

      console.log('✅ [재경로] 계산 완료', {
        hasRoute: !!rerouteResult?.routes?.[0],
        legs: rerouteResult?.routes?.[0]?.legs?.length || 0
      });

      // 재경로 정보 구성
      const rerouteInfo = {
        originalRoutePlan: routePlan,
        newRoute: rerouteResult,
        currentPosition: currentPosition,
        nextDestination: nextDestination,
        progress: currentProgress,
        calculatedAt: new Date().toISOString(),
        attemptNumber: this.rerouteAttempts
      };

      // 마지막 재경로 정보 업데이트
      this.lastRerouteTime = Date.now();
      this.lastReroutePosition = { ...currentPosition };

      console.log('💾 [재경로] 재경로 정보 저장 완료', {
        attemptNumber: this.rerouteAttempts,
        calculatedAt: rerouteInfo.calculatedAt
      });

      return rerouteInfo;

    } catch (error) {
      console.error('❌ [재경로] 계산 실패:', error);
      throw error;
    } finally {
      this.isCalculating = false;
      console.log('🏁 [재경로] 계산 프로세스 종료');
    }
  }

  /**
   * 재경로를 적용하여 새로운 경로 계획 생성
   * @param {Object} rerouteInfo - 재경로 정보
   * @param {Object} state - 현재 애플리케이션 상태
   * @param {Object} google - Google Maps SDK (선택)
   * @returns {Object} 새로운 경로 계획
   */
  applyReroute(rerouteInfo, state, google = null) {
    console.log('🔧 [재경로] 적용 시작', {
      hasRerouteInfo: !!rerouteInfo,
      hasState: !!state,
      attemptNumber: rerouteInfo?.attemptNumber
    });

    if (!rerouteInfo || !state) {
      console.error('❌ [재경로] 재경로 정보가 없습니다.');
      throw new Error('재경로 정보가 없습니다.');
    }

    const { originalRoutePlan, newRoute, nextDestination, progress } = rerouteInfo;
    console.log('📋 [재경로] 재경로 정보', {
      hasOriginalRoutePlan: !!originalRoutePlan,
      hasNewRoute: !!newRoute,
      nextDestination: nextDestination?.label || nextDestination?.address || '알 수 없음',
      progress: progress
    });
    
    // 새 경로의 첫 번째 세그먼트
    const newSegment = newRoute;
    
    // 기존 경로의 남은 세그먼트 가져오기
    const segmentIndex = progress?.segmentIndex || 0;
    const remainingSegments = [];
    const remainingStops = [];
    
    // 현재 세그먼트 이후의 세그먼트들 가져오기
    if (originalRoutePlan.segments && segmentIndex + 1 < originalRoutePlan.segments.length) {
      // 다음 세그먼트부터 끝까지
      for (let i = segmentIndex + 1; i < originalRoutePlan.segments.length; i++) {
        // 원래 경로의 세그먼트 정보를 재사용하기 위해 Directions API를 다시 호출해야 함
        // 여기서는 간단하게 새 세그먼트만 사용
      }
    }
    
    // stops 구성: 현재 위치 → 다음 목적지 → (나머지 경유지) → 최종 목적지
    const stops = [];
    stops.push({
      label: '현재 위치',
      address: '현재 위치',
      location: rerouteInfo.currentPosition
    });
    
    if (nextDestination) {
      stops.push(nextDestination);
    }
    
    // 나머지 waypoints 추가 (다음 목적지 이후)
    if (state.waypoints && progress) {
      const waypointStartIndex = progress.segmentIndex + 1;
      for (let i = waypointStartIndex; i < state.waypoints.length; i++) {
        stops.push(state.waypoints[i]);
      }
    }
    
    // 최종 목적지
    if (state.destination && nextDestination !== state.destination) {
      stops.push(state.destination);
    }
    
    // 새 경로 계획 구성 (간단하게 새 세그먼트만 사용)
    const colors = getRouteColors(1);
    const labeledStops = stops.map((stop, index) => ({
      ...stop,
      markerLabel: index === 0 ? '출발' : index === stops.length - 1 ? '도착' : `경유 ${index}`
    }));
    
    const newRoutePlan = buildRoutePlan({
      segments: [newSegment],
      stops: labeledStops,
      colors: colors
    });

    console.log('✅ [재경로] 새 경로 계획 생성 완료', {
      segments: newRoutePlan?.segments?.length || 0,
      totalDuration: newRoutePlan?.totalDurationText,
      totalDistance: newRoutePlan?.totalDistanceText
    });

    return newRoutePlan;
  }

  /**
   * 현재 진행 상황 파악 (progress 객체 사용)
   * @param {Object} progress - progress.js에서 계산된 진행률 정보
   * @returns {Object|null} 진행 상황 정보
   */
  getCurrentProgressFromProgress(progress) {
    if (!progress) return null;
    
    return {
      segmentIndex: progress.closestSegmentIndex || 0,
      legIndex: progress.closestLegIndex || 0,
      progressRatio: progress.progressRatio || 0,
      remainingMeters: progress.remainingMeters || 0
    };
  }

  /**
   * 다음 목적지 결정
   */
  getNextDestination(routePlan, progress, state) {
    if (!routePlan || !routePlan.segments) {
      return state.destination;
    }

    const segmentIndex = progress?.segmentIndex || 0;
    
    // 현재 세그먼트의 목적지 찾기
    if (segmentIndex < routePlan.segments.length) {
      const currentSegment = routePlan.segments[segmentIndex];
      
      // 세그먼트의 목적지 위치 정보 찾기
      const destinationLocation = currentSegment.legs?.[currentSegment.legs.length - 1]?.destinationLocation;
      
      if (destinationLocation) {
        // waypoints에서 해당 위치 찾기
        if (state.waypoints && segmentIndex < state.waypoints.length) {
          return state.waypoints[segmentIndex];
        }
      }
      
      // 마지막 세그먼트면 최종 목적지
      if (segmentIndex >= routePlan.segments.length - 1) {
        return state.destination;
      }
      
      // 다음 세그먼트의 출발지가 다음 목적지
      if (segmentIndex + 1 < routePlan.segments.length) {
        const nextSegment = routePlan.segments[segmentIndex + 1];
        const nextOriginLocation = nextSegment.legs?.[0]?.originLocation;
        
        if (nextOriginLocation && state.waypoints && segmentIndex < state.waypoints.length) {
          return state.waypoints[segmentIndex];
        }
      }
    }

    // Fallback: 최종 목적지
    return state.destination;
  }


  /**
   * 두 지점 간 거리 계산 (Haversine)
   */
  calculateDistance(pos1, pos2) {
    const R = 6371000; // 지구 반지름 (미터)
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * 재경로 계산 시간 지연 반영 (Critical Warning용)
   * @param {Object} originalRoutePlan - 원래 경로 계획
   * @param {Object} rerouteInfo - 재경로 정보
   * @returns {number} 추가 소요 시간 (분)
   */
  calculateAdditionalTime(originalRoutePlan, rerouteInfo) {
    console.log('⏱️ [재경로] 추가 소요 시간 계산 시작');

    if (!originalRoutePlan || !rerouteInfo || !rerouteInfo.newRoute) {
      console.log('⚠️ [재경로] 추가 소요 시간 계산 불가: 정보 부족');
      return 0;
    }

    // 새 경로의 소요 시간
    const newRouteDuration = rerouteInfo.newRoute.routes[0]?.legs[0]?.duration?.value || 0;
    const newRouteMinutes = Math.round(newRouteDuration / 60);

    // 원래 경로의 남은 시간 추정 (progress 기반)
    const originalRemainingMinutes = this.estimateRemainingTime(
      originalRoutePlan, 
      rerouteInfo.progress  // progress 전달
    );

    // 추가 소요 시간 계산
    const additionalMinutes = Math.max(0, newRouteMinutes - originalRemainingMinutes);

    console.log('⏱️ [재경로] 추가 소요 시간 계산 결과', {
      newRouteMinutes,
      originalRemainingMinutes,
      additionalMinutes,
      hasProgress: !!rerouteInfo.progress,
      progressRatio: rerouteInfo.progress?.progressRatio
    });

    return additionalMinutes;
  }

  /**
   * 원래 경로의 남은 시간 추정 (progress 기반으로 개선)
   * @param {Object} routePlan - 경로 계획
   * @param {Object} progress - 진행률 정보 (선택)
   * @returns {number} 남은 시간 (분)
   */
  estimateRemainingTime(routePlan, progress) {
    if (!routePlan || !routePlan.totalDurationSeconds) {
      return 30; // 기본값
    }

    // progress 기반으로 남은 시간 계산
    if (progress && progress.progressRatio != null) {
      const remainingRatio = Math.max(0, 1 - progress.progressRatio);
      const remainingMinutes = Math.round(routePlan.totalDurationSeconds / 60 * remainingRatio);
      const result = Math.max(remainingMinutes, 1); // 최소 1분
      
      console.log('📊 [재경로] progress 기반 남은 시간 계산', {
        totalDurationSeconds: routePlan.totalDurationSeconds,
        progressRatio: progress.progressRatio,
        remainingRatio: remainingRatio,
        remainingMinutes: result
      });
      
      return result;
    }

    // progress가 없으면 전체 시간의 절반으로 추정
    const estimatedMinutes = Math.round(routePlan.totalDurationSeconds / 60 / 2);
    console.log('📊 [재경로] progress 없음, 기본 추정 사용', {
      totalDurationSeconds: routePlan.totalDurationSeconds,
      estimatedMinutes
    });
    
    return estimatedMinutes;
  }

  /**
   * 상태 초기화
   */
  reset() {
    console.log('🔄 [재경로] 상태 초기화', {
      previousAttempts: this.rerouteAttempts,
      previousLastRerouteTime: this.lastRerouteTime
    });
    this.rerouteAttempts = 0;
    this.lastRerouteTime = 0;
    this.lastReroutePosition = null;
    this.isCalculating = false;
    this.pendingReroute = null;
    console.log('✅ [재경로] 상태 초기화 완료');
  }
}

// 싱글톤 인스턴스
export const rerouteCalculator = new RerouteCalculator();

