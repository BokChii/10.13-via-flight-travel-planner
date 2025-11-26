/**
 * Route Deviation Detector
 * 경로 이탈 감지 및 모니터링 시스템
 * Phase 1: 실시간 네비게이션 개선
 */

import { ROUTE_DEVIATION_CONFIG } from './config.js';

class RouteDeviationDetector {
  constructor() {
    this.deviationHistory = [];
    this.lastAlertTime = 0;
    this.isDeviated = false;
    this.deviationStartTime = null;
    this.recoveryStartTime = null; // 복귀 시작 시간 추가
  }

  /**
   * 경로 이탈 감지
   * @param {Object} progress - 진행률 정보 (progress.js에서 계산된 값)
   * @param {Object} position - 현재 GPS 위치
   * @returns {Object|null} 이탈 정보 또는 null
   */
  detectDeviation(progress, position) {
    if (!progress || !position) return null;

    const distanceToRoute = progress.distanceToLegMeters || 0;
    const threshold = ROUTE_DEVIATION_CONFIG.DEVIATION_THRESHOLD_METERS;
    const now = Date.now();

    // 이탈 감지
    if (distanceToRoute > threshold) {
      // 복귀 시도 중이었다면 리셋
      this.recoveryStartTime = null;
      
      // 이탈 시작 시간 기록
      if (!this.deviationStartTime) {
        this.deviationStartTime = now;
      }

      // 이탈 지속 시간 계산
      const deviationDuration = (now - this.deviationStartTime) / 1000; // 초

      // 지속 시간이 임계값을 넘으면 이탈로 판단
      if (deviationDuration >= ROUTE_DEVIATION_CONFIG.DEVIATION_DURATION_SECONDS) {
        if (!this.isDeviated) {
          this.isDeviated = true;
          console.log('⚠️ [경로 이탈] 이탈 감지', {
            distance: Math.round(distanceToRoute),
            duration: deviationDuration.toFixed(1),
            threshold: ROUTE_DEVIATION_CONFIG.DEVIATION_THRESHOLD_METERS
          });
          return {
            isDeviated: true,
            distance: distanceToRoute,
            duration: deviationDuration,
            shouldAlert: this.shouldShowAlert(),
            message: `경로에서 ${Math.round(distanceToRoute)}m 벗어났습니다. 원래 경로로 돌아가세요.`
          };
        }
        
        // 이미 이탈 상태면 거리 정보만 업데이트 (배너는 계속 표시)
        return {
          isDeviated: true,
          distance: distanceToRoute,
          duration: deviationDuration,
          shouldAlert: false, // 중복 알림 방지
          message: `경로에서 ${Math.round(distanceToRoute)}m 벗어났습니다.` // 거리 정보 업데이트
        };
      } else {
        // 아직 임계 시간 전이지만 이탈 정보는 반환 (거리 정보 포함)
        console.log('⏳ [경로 이탈] 임계 시간 대기 중', {
          distance: Math.round(distanceToRoute),
          duration: deviationDuration.toFixed(1),
          required: ROUTE_DEVIATION_CONFIG.DEVIATION_DURATION_SECONDS
        });
        return {
          isDeviated: false, // 아직 공식 이탈 아님
          distance: distanceToRoute,
          duration: deviationDuration,
          shouldAlert: false,
          message: `경로에서 ${Math.round(distanceToRoute)}m 벗어났습니다. (확인 중...)`
        };
      }
    } else {
      // 경로 내부에 있음
      if (this.isDeviated) {
        // 복귀 시작 시간 기록
        if (!this.recoveryStartTime) {
          this.recoveryStartTime = now;
        }
        
        // 복귀 지속 시간 계산
        const recoveryDuration = (now - this.recoveryStartTime) / 1000; // 초
        
        // 복귀 확인 시간을 넘었으면 복귀로 판단
        if (recoveryDuration >= ROUTE_DEVIATION_CONFIG.RECOVERY_DURATION_SECONDS) {
          console.log('✅ [경로 이탈] 복귀 완료', {
            recoveryDuration: recoveryDuration.toFixed(1),
            required: ROUTE_DEVIATION_CONFIG.RECOVERY_DURATION_SECONDS
          });
          this.isDeviated = false;
          this.deviationStartTime = null;
          this.recoveryStartTime = null;
          return {
            isDeviated: false,
            recovered: true,
            message: '경로로 복귀했습니다.'
          };
        } else {
          // 아직 복귀 확인 중 - 배너는 계속 표시하되 복귀 중임을 알림
          console.log('🔄 [경로 이탈] 복귀 확인 중', {
            recoveryDuration: recoveryDuration.toFixed(1),
            required: ROUTE_DEVIATION_CONFIG.RECOVERY_DURATION_SECONDS,
            distance: Math.round(distanceToRoute)
          });
          return {
            isDeviated: true, // 아직 이탈 상태로 유지
            distance: distanceToRoute,
            duration: 0,
            shouldAlert: false,
            message: `경로로 복귀 중... (${Math.round(recoveryDuration)}초)` // 복귀 진행 상황 표시
          };
        }
      }
      this.deviationStartTime = null;
      this.recoveryStartTime = null;
      return null;
    }
  }

  /**
   * 알림 표시 여부 결정 (쿨다운 적용)
   */
  shouldShowAlert() {
    const now = Date.now();
    const cooldown = ROUTE_DEVIATION_CONFIG.DEVIATION_ALERT_COOLDOWN_MS;
    
    if (now - this.lastAlertTime > cooldown) {
      this.lastAlertTime = now;
      return true;
    }
    return false;
  }

  /**
   * GPS 정확도 평가
   * @param {Object} position - GPS 위치 정보
   * @returns {Object|null} 정확도 정보 또는 null
   */
  evaluateGPSAccuracy(position) {
    if (!position || position.accuracy == null) return null;

    const accuracy = position.accuracy;
    const lowThreshold = ROUTE_DEVIATION_CONFIG.LOW_ACCURACY_THRESHOLD_METERS;
    const veryLowThreshold = ROUTE_DEVIATION_CONFIG.VERY_LOW_ACCURACY_THRESHOLD_METERS;

    if (accuracy >= veryLowThreshold) {
      return {
        level: 'very_low',
        accuracy: accuracy,
        message: '위치 정확도가 매우 낮습니다. 야외로 이동하거나 GPS 신호를 확인하세요.',
        shouldWarn: true
      };
    } else if (accuracy >= lowThreshold) {
      return {
        level: 'low',
        accuracy: accuracy,
        message: '위치 정확도가 낮습니다.',
        shouldWarn: false
      };
    }

    return {
      level: 'good',
      accuracy: accuracy,
      message: null,
      shouldWarn: false
    };
  }

  /**
   * 상태 초기화 (네비게이션 종료 시)
   */
  reset() {
    this.deviationHistory = [];
    this.lastAlertTime = 0;
    this.isDeviated = false;
    this.deviationStartTime = null;
    this.recoveryStartTime = null; // 복귀 시작 시간 리셋
  }
}

// 싱글톤 인스턴스
export const routeDeviationDetector = new RouteDeviationDetector();

