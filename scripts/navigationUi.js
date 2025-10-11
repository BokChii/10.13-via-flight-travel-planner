export function renderNavigationStatus(container, navigation, routePlan, progress) {
  container.innerHTML = "";

  if (!routePlan) {
    container.append(createPlaceholder("내비게이션을 시작하면 현재 위치와 진행 상황이 표시됩니다."));
    return;
  }

  if (!navigation?.active) {
    container.append(createPlaceholder("계산된 경로로 내비게이션을 시작할 수 있습니다."));
    return;
  }

  // 복귀 시간 정보 추가
  const returnTimeInfo = calculateReturnTimeInfo(routePlan);
  if (returnTimeInfo) {
    const returnBanner = createReturnTimeBanner(returnTimeInfo);
    container.append(returnBanner);
  }

  const header = document.createElement("h3");
  header.className = "navigation-status__title";
  header.textContent = "내비게이션 진행 중";

  // 네비게이션 상태 인디케이터 추가
  const statusIndicator = createNavigationStatusIndicator(returnTimeInfo, progress);
  container.append(statusIndicator);

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

export function calculateReturnTimeInfo(routePlan) {
  if (!routePlan?.departureTime || !routePlan?.totalDurationSeconds) {
    return null;
  }

  const now = new Date();
  const departureTime = new Date(routePlan.departureTime);
  const totalDurationMs = routePlan.totalDurationSeconds * 1000;
  
  // 남은 이동 시간 (초)
  const remainingTravelTimeSeconds = routePlan.totalDurationSeconds;
  
  // 복귀 버퍼 시간 (기본 90분, 사용자 설정값이 있다면 사용)
  const returnBufferMinutes = routePlan.returnBufferMinutes || 90;
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
  const slackMinutes = timeToDepartureMinutes - (remainingTravelTimeSeconds / 60) - returnBufferMinutes;
  
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
  let statusClass, statusIcon, statusText, statusDescription;
  
  if (returnTimeInfo) {
    if (returnTimeInfo.status === "danger") {
      statusClass = "danger";
      statusIcon = "⚠️";
      statusText = "위험";
      statusDescription = "시간이 부족합니다. 서둘러 이동하세요.";
    } else if (returnTimeInfo.status === "warning") {
      statusClass = "warning";
      statusIcon = "⏰";
      statusText = "주의";
      statusDescription = "시간이 촉박합니다. 경로를 확인하세요.";
    } else {
      statusClass = "safe";
      statusIcon = "✅";
      statusText = "안전";
      statusDescription = "충분한 시간이 있습니다.";
    }
  } else {
    statusClass = "neutral";
    statusIcon = "📍";
    statusText = "진행 중";
    statusDescription = "내비게이션을 진행하고 있습니다.";
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
  
  content.append(title, description);
  indicator.append(icon, content);
  
  return indicator;
}
