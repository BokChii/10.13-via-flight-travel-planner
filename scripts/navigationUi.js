/**
 * 네비게이션 진행률을 기반으로 현재 경유지 정보를 파악합니다
 * @param {Object} progress - 네비게이션 진행률 정보
 * @param {Object} routePlan - 경로 계획 정보
 * @returns {Object|null} 현재 경유지 컨텍스트 정보
 */
export function getCurrentWaypointContext(progress, routePlan) {
  if (!progress || !routePlan.segments) return null;
  
  const segmentIndex = progress.closestSegmentIndex;
  const currentSegment = routePlan.segments[segmentIndex];
  
  if (!currentSegment) return null;
  
  return {
    destinationName: currentSegment.destinationName,
    destinationType: currentSegment.destinationType,
    progressRatio: progress.progressRatio,
    isAtDestination: progress.progressRatio > 0.8,
    isMoving: progress.progressRatio > 0.1 && progress.progressRatio < 0.8,
    segmentIndex: segmentIndex,
    distanceToDestination: progress.remainingMeters || 0
  };
}

// 새로운 실시간 공항 복귀 시스템 import
import { calculateRealTimeReturnInfo, convertToLegacyFormat } from './airportReturnSystem.js';
import { NAVIGATION_STATUS } from './config.js';




export async function renderNavigationStatus(container, navigation, routePlan, progress, tripMeta = null) {
  // 모바일 종료 버튼(#exit-navigation)이 container 안에 있을 수 있으므로 보존 후 재부착
  const exitButtonEl = document.getElementById("exit-navigation");
  const shouldReattachExit = !!exitButtonEl && container.contains(exitButtonEl);
  container.innerHTML = "";

  if (!routePlan) {
    container.append(createPlaceholder("내비게이션을 시작하면 현재 위치와 진행 상황이 표시됩니다."));
    if (shouldReattachExit && exitButtonEl) container.append(exitButtonEl);
    return;
  }

  if (!navigation?.active) {
    container.append(createPlaceholder("계산된 경로로 내비게이션을 시작할 수 있습니다."));
    if (shouldReattachExit && exitButtonEl) container.append(exitButtonEl);
    return;
  }

  // Phase 1: 네비게이션 상태 표시 추가 (중복 제거)
  if (navigation?.status && navigation.status !== NAVIGATION_STATUS.NORMAL) {
    const statusIndicator = createRouteStatusIndicator(navigation);
    if (statusIndicator) {
      container.append(statusIndicator);
      // 배너 표시 확인 (디버깅용)
      if (navigation.status === NAVIGATION_STATUS.DEVIATED) {
        console.log('✅ [배너] 경로 이탈 배너 표시 완료', {
          status: navigation.status,
          message: navigation.routeDeviation?.message
        });
      }
    } else {
      console.warn('⚠️ [배너] 배너 생성 실패', {
        status: navigation.status,
        hasRouteDeviation: !!navigation.routeDeviation
      });
    }
  }

  // 새로운 실시간 복귀 시간 정보 추가 (기존 시스템과 호환)
  const returnTimeInfo = await calculateEnhancedReturnTimeInfo(routePlan, navigation, progress, tripMeta);
  if (returnTimeInfo) {
    const returnBanner = createReturnTimeBanner(returnTimeInfo);
    container.append(returnBanner);
  }

  const header = document.createElement("h3");
  header.className = "navigation-status__title";
  header.textContent = "내비게이션 진행 중";

  const startTime = navigation.startedAt ? new Date(navigation.startedAt) : null;
  const startedText = startTime ? startTime.toLocaleTimeString() : "방금";

  const info = document.createElement("p");
  info.textContent = `시작 시각: ${startedText}`;

  const status = document.createElement("p");
  status.className = "navigation-status__position";

  if (navigation.error) {
    status.textContent = `위치 정보를 가져올 수 없습니다: ${navigation.error}`;
  } else if (navigation.currentPosition) {
    const position = navigation.currentPosition;
    const lastUpdated = navigation.lastUpdatedAt ? new Date(navigation.lastUpdatedAt) : null;
    const accuracyText = position.accuracy ? `(±${Math.round(position.accuracy)}m)` : "";
    const timeText = lastUpdated ? `업데이트: ${lastUpdated.toLocaleTimeString()}` : "";
    status.textContent = `현재 위치: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} ${accuracyText} ${timeText}`;
  } else {
    status.textContent = "위치 정보 수신 중...";
  }

  container.append(header, info, status);

  if (progress && routePlan.segments) {
    const segmentIndex = progress.closestSegmentIndex;
    const activeSegment = routePlan.segments[segmentIndex];

    const progressPercent = Math.round((progress.progressRatio ?? 0) * 100);
    const remainingText = formatDistance(progress.remainingMeters);

    const progressWrapper = document.createElement("div");
    progressWrapper.className = "navigation-status__progress";

    const bar = document.createElement("div");
    bar.className = "navigation-status__progress-bar";

    const barFill = document.createElement("div");
    barFill.className = "navigation-status__progress-bar-fill";
    barFill.style.width = `${progressPercent}%`;

    bar.append(barFill);
    progressWrapper.append(bar);

    const progressLabel = document.createElement("p");
    progressLabel.className = "navigation-status__progress-label";
    progressLabel.textContent = `진행률 ${progressPercent}% · 남은 거리 ${remainingText}`;

    container.append(progressWrapper, progressLabel);

    if (activeSegment) {
      const segmentInfo = document.createElement("p");
      segmentInfo.innerHTML = `<strong>현재 구간:</strong> 구간 ${segmentIndex + 1} (${activeSegment.fromLabel} → ${activeSegment.toLabel})`;
      container.append(segmentInfo);

      const leg = activeSegment.legs?.[progress.closestLegIndex];
      if (leg) {
        const legInfo = document.createElement("p");
        const distanceHint = progress.distanceToLegMeters != null
          ? `약 ${formatDistance(progress.distanceToLegMeters)} 이내`
          : "";
        legInfo.innerHTML = `<strong>다음 안내:</strong> ${leg.modeLabel}${leg.details ? ` · ${leg.details}` : ""} ${distanceHint}`;
        container.append(legInfo);
      }
    }
  }

  // 렌더링 마지막에 모바일 종료 버튼 재부착 (있을 경우)
  if (shouldReattachExit && exitButtonEl) {
    container.append(exitButtonEl);
  }
}

function createPlaceholder(text) {
  const p = document.createElement("p");
  p.className = "placeholder";
  p.textContent = text;
  return p;
}

function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return "--";
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(meters)}m`;
}

/**
 * 새로운 실시간 공항 복귀 정보를 계산합니다 (기존 함수와 호환)
 * @param {Object} routePlan - 경로 계획
 * @param {Object} navigation - 네비게이션 상태
 * @param {Object} progress - 진행률
 * @param {Object} tripMeta - 여행 메타데이터 (선택사항)
 * @returns {Promise<Object|null>} 복귀 시간 정보
 */
export async function calculateEnhancedReturnTimeInfo(routePlan, navigation, progress, tripMeta = null) {
  // 새로운 실시간 시스템 사용 시도
  if (navigation?.active && progress) {
    try {
      const state = { navigation, tripMeta: tripMeta || routePlan };
      const realTimeInfo = await calculateRealTimeReturnInfo(state, progress);
      if (realTimeInfo) {
        return convertToLegacyFormat(realTimeInfo);
      }
    } catch (error) {
      console.warn('실시간 공항 복귀 정보 계산 실패, 기존 시스템 사용:', error);
    }
  }
  
  // Fallback: 기존 시스템 사용
  return calculateReturnTimeInfo(routePlan, tripMeta);
}

/**
 * 기존 calculateReturnTimeInfo 함수 (호환성 유지)
 * @param {Object} routePlan - 경로 계획
 * @param {Object} tripMeta - 여행 메타데이터 (선택사항)
 * @returns {Object|null} 복귀 시간 정보
 */
export function calculateReturnTimeInfo(routePlan, tripMeta = null) {
  if (!routePlan?.totalDurationSeconds) {
    return null;
  }

  // 원본 출발 시간 우선 사용, 없으면 routePlan의 departureTime 사용
  let departureTime;
  if (tripMeta?.originalDeparture) {
    departureTime = new Date(tripMeta.originalDeparture);
  } else if (routePlan?.departureTime) {
    departureTime = new Date(routePlan.departureTime);
  } else {
    return null;
  }

  const now = new Date();
  const totalDurationMs = routePlan.totalDurationSeconds * 1000;
  
  // 남은 이동 시간 (초)
  const remainingTravelTimeSeconds = routePlan.totalDurationSeconds;
  
  // 복귀 버퍼 시간을 0분으로 하드코딩 (요약 섹션과 일관성 유지)
  const returnBufferMinutes = 0;
  const returnBufferSeconds = returnBufferMinutes * 60;
  
  // 복귀 준비 시작 시간
  const returnPreparationTime = new Date(departureTime.getTime() - returnBufferSeconds * 1000);
  
  // 현재 시간부터 복귀 준비 시작까지 남은 시간
  const timeToReturnPreparation = returnPreparationTime.getTime() - now.getTime();
  const timeToReturnPreparationMinutes = Math.floor(timeToReturnPreparation / (1000 * 60));
  
  // 현재 시간부터 출발까지 남은 시간
  const timeToDeparture = departureTime.getTime() - now.getTime();
  const timeToDepartureMinutes = Math.floor(timeToDeparture / (1000 * 60));
  
  // Slack 계산: 출발까지 남은 시간 - (남은 이동 시간 + 복귀 버퍼)
  const slackMinutesRaw = timeToDepartureMinutes - (remainingTravelTimeSeconds / 60) - returnBufferMinutes;
  const slackMinutes = Math.floor(slackMinutesRaw);
  
  let status, icon, title, subtitle;
  
  if (slackMinutes < 0) {
    // 위험: 시간이 부족함
    status = "danger";
    icon = "⚠️";
    title = "시간 부족";
    subtitle = `출발까지 ${Math.abs(slackMinutes)}분 부족합니다`;
  } else if (slackMinutes < 30) {
    // 주의: 시간이 촉박함
    status = "warning";
    icon = "⏰";
    title = "시간 촉박";
    subtitle = `출발까지 ${slackMinutes}분 여유가 있습니다`;
  } else {
    // 안전: 충분한 시간
    status = "safe";
    icon = "✅";
    title = "시간 여유";
    subtitle = `출발까지 ${slackMinutes}분 여유가 있습니다`;
  }
  
  return {
    status,
    icon,
    title,
    subtitle,
    timeToReturnPreparation: timeToReturnPreparationMinutes,
    timeToDeparture: timeToDepartureMinutes,
    slackMinutes
  };
}

function createReturnTimeBanner(returnTimeInfo) {
  const banner = document.createElement("div");
  banner.className = `return-time-banner ${returnTimeInfo.status}`;
  
  const icon = document.createElement("div");
  icon.className = "return-time-banner__icon";
  icon.textContent = returnTimeInfo.icon;
  
  const content = document.createElement("div");
  content.className = "return-time-banner__content";
  
  const title = document.createElement("div");
  title.className = "return-time-banner__title";
  title.textContent = returnTimeInfo.title;
  
  const subtitle = document.createElement("div");
  subtitle.className = "return-time-banner__subtitle";
  subtitle.textContent = returnTimeInfo.subtitle;
  
  content.append(title, subtitle);
  banner.append(icon, content);
  
  return banner;
}

function createNavigationStatusIndicator(returnTimeInfo, progress) {
  const indicator = document.createElement("div");
  indicator.className = "navigation-status-indicator";
  
  // 상태에 따른 색상과 아이콘 설정
  let statusClass, statusIcon, statusText, statusDescription, actionText;
  
  if (returnTimeInfo) {
    const slackMinutes = returnTimeInfo.slackMinutes;
    
    if (returnTimeInfo.status === "danger") {
      statusClass = "danger";
      statusIcon = "🚨";
      statusText = "긴급!";
      statusDescription = `출발까지 ${Math.abs(slackMinutes)}분 부족합니다`;
      actionText = "지금 즉시 공항으로 가세요!";
    } else if (returnTimeInfo.status === "warning") {
      statusClass = "warning";
      statusIcon = "⏰";
      statusText = "주의";
      statusDescription = `출발까지 ${slackMinutes}분 여유가 있습니다`;
      actionText = "이제 공항으로 향하세요!";
    } else {
      statusClass = "safe";
      statusIcon = "✅";
      statusText = "여유롭게";
      statusDescription = `출발까지 ${slackMinutes}분 여유가 있습니다`;
      actionText = "충분한 시간이 있어요!";
    }
  } else {
    statusClass = "neutral";
    statusIcon = "📍";
    statusText = "진행 중";
    statusDescription = "내비게이션을 진행하고 있습니다.";
    actionText = "안전하게 이동하세요.";
  }
  
  indicator.className = `navigation-status-indicator navigation-status-indicator--${statusClass}`;
  
  const icon = document.createElement("div");
  icon.className = "navigation-status-indicator__icon";
  icon.textContent = statusIcon;
  
  const content = document.createElement("div");
  content.className = "navigation-status-indicator__content";
  
  const title = document.createElement("div");
  title.className = "navigation-status-indicator__title";
  title.textContent = statusText;
  
  const description = document.createElement("div");
  description.className = "navigation-status-indicator__description";
  description.textContent = statusDescription;
  
  // 새로운 액션 텍스트 추가
  const action = document.createElement("div");
  action.className = "navigation-status-indicator__action";
  action.textContent = actionText;
  
  content.append(title, description, action);
  indicator.append(icon, content);
  
  return indicator;
}

/**
 * 경로 상태 인디케이터 생성 (Phase 1)
 * @param {Object} navigation - 네비게이션 상태
 * @returns {HTMLElement|null} 상태 인디케이터 요소 또는 null
 */
function createRouteStatusIndicator(navigation) {
  if (!navigation?.status || navigation.status === NAVIGATION_STATUS.NORMAL) {
    return null; // 정상 상태면 표시 안 함
  }

  const indicator = document.createElement('div');
  indicator.className = 'navigation-status-indicator';
  
  let statusClass, statusIcon, statusText, statusMessage;
  
  switch (navigation.status) {
    case NAVIGATION_STATUS.DEVIATED:
      statusClass = 'status-deviated';
      statusIcon = '⚠️';
      statusText = '경로 이탈';
      // 메시지가 있으면 사용, 없으면 기본 메시지
      const deviationMessage = navigation.routeDeviation?.message;
      if (deviationMessage) {
        statusMessage = deviationMessage;
      } else {
        const distance = navigation.routeDeviation?.distance;
        const isDeviated = navigation.routeDeviation?.isDeviated;
        if (distance) {
          if (isDeviated) {
            statusMessage = `경로에서 ${Math.round(distance)}m 벗어났습니다. 원래 경로로 돌아가세요.`;
          } else {
            statusMessage = `경로에서 ${Math.round(distance)}m 벗어났습니다. (확인 중...)`;
          }
        } else {
          statusMessage = '경로에서 벗어났습니다. 원래 경로로 돌아가세요.';
        }
      }
      break;
      
    case NAVIGATION_STATUS.LOW_ACCURACY:
      statusClass = 'status-low-accuracy';
      statusIcon = '📍';
      statusText = '위치 확인 중';
      statusMessage = navigation.gpsAccuracy?.message || 'GPS 정확도가 낮습니다.';
      break;
      
    case NAVIGATION_STATUS.REROUTING:
      statusClass = 'status-rerouting';
      statusIcon = '🔄';
      statusText = '재경로 계산 중';
      statusMessage = '새로운 경로를 계산하고 있습니다...';
      break;
      
    case NAVIGATION_STATUS.ERROR:
      statusClass = 'status-error';
      statusIcon = '❌';
      statusText = '오류';
      statusMessage = navigation.error || '네비게이션 오류가 발생했습니다.';
      break;
      
    default:
      return null;
  }
  
  indicator.className = `navigation-status-indicator navigation-status-indicator--${statusClass}`;
  indicator.innerHTML = `
    <div class="status-icon">${statusIcon}</div>
    <div class="status-content">
      <div class="status-title">${statusText}</div>
      <div class="status-message">${statusMessage}</div>
    </div>
  `;
  
  return indicator;
}
