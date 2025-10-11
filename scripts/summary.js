import { calculateReturnTimeInfo } from './navigationUi.js';

export function renderSummary(container, routePlan, activeSegmentIndex = null) {
  container.innerHTML = "";

  if (!routePlan) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "경로를 계산하면 총 소요 시간과 이동 정보를 확인할 수 있어요.";
    container.append(placeholder);
    return;
  }

  container.append(createHeroCard(routePlan));
  routePlan.segments?.forEach((segment, index) => {
    container.append(createSegmentEntry(segment, index, index === activeSegmentIndex));
  });
}

function createHeroCard(routePlan) {
  const { totalDurationText, totalDistanceText, arrivalTimeText } = routePlan;
  const card = document.createElement("article");
  card.className = "summary-card";

  // 복귀 시간 계산
  const returnTimeInfo = calculateReturnTimeInfo(routePlan);
  
  card.innerHTML = `
    <h3>전체 여정 요약</h3>
    <p><strong>총 소요 시간:</strong> ${totalDurationText}</p>
    <p><strong>총 이동 거리:</strong> ${totalDistanceText}</p>
    ${arrivalTimeText ? `<p><strong>예상 도착:</strong> ${arrivalTimeText}</p>` : ""}
    ${returnTimeInfo ? `
      <div class="return-time-banner ${returnTimeInfo.status}">
        <div class="return-time-banner__icon">${returnTimeInfo.icon}</div>
        <div class="return-time-banner__content">
          <div class="return-time-banner__title">${returnTimeInfo.title}</div>
          <div class="return-time-banner__subtitle">${returnTimeInfo.subtitle}</div>
        </div>
      </div>
    ` : ""}
  `;

  return card;
}

// calculateReturnTimeInfo 함수는 navigationUi.js로 이동됨

function createSegmentEntry(segment, index, isActive) {
  const details = document.createElement("details");
  details.className = "summary-card summary-card--segment";
  details.style.borderLeft = `6px solid ${segment.color}`;
  if (isActive) {
    details.open = true;
    details.classList.add("summary-card--active");
  }

  const summary = document.createElement("summary");
  summary.className = "summary-card__summary";

  const colorDot = document.createElement("span");
  colorDot.className = "summary-card__color";
  colorDot.style.backgroundColor = segment.color;

  const title = document.createElement("span");
  title.className = "summary-card__title";
  title.textContent = `구간 ${index + 1}: ${segment.fromLabel} → ${segment.toLabel}`;

  summary.append(colorDot, title);
  details.append(summary);

  const content = document.createElement("div");
  content.className = "summary-card__content";

  const meta = document.createElement("p");
  meta.innerHTML = `<strong>소요 시간:</strong> ${segment.durationText} · <strong>이동 거리:</strong> ${segment.distanceText}`;
  content.append(meta);

  if (segment.legs?.length) {
    const list = document.createElement("ul");
    list.className = "summary-card__legs";
    segment.legs.forEach((leg) => {
      const item = document.createElement("li");
      const lines = [];
      if (leg.durationText) lines.push(leg.durationText);
      if (leg.distanceText) lines.push(leg.distanceText);
      if (leg.details) lines.push(leg.details);
      item.innerHTML = `<strong>${leg.modeLabel}</strong>${lines.length ? ` ${lines.join(" · ")}` : ""}`;
      list.append(item);
    });
    content.append(list);
  }

  const actions = document.createElement("div");
  actions.className = "summary-card__actions";
  const mapButton = document.createElement("button");
  mapButton.type = "button";
  mapButton.className = "btn btn--ghost btn--small";
  mapButton.dataset.summaryHighlight = index;
  mapButton.textContent = "지도에서 보기";
  actions.append(mapButton);
  content.append(actions);

  details.append(content);
  return details;
}
