import { calculateReturnTimeInfo } from './navigationUi.js';

export function renderSummary(container, routePlan, activeSegmentIndex = null, tripMeta = null) {
  container.innerHTML = "";

  if (!routePlan) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "경로를 계산하면 총 소요 시간과 이동 정보를 확인할 수 있어요.";
    container.append(placeholder);
    return;
  }

  container.append(createHeroCard(routePlan, tripMeta));

  // 구간별 실제 시간대 기준 출/도착 시간 계산
  const segmentSchedule = buildSegmentSchedule(routePlan, tripMeta);

  routePlan.segments?.forEach((segment, index) => {
    const sched = segmentSchedule[index] || null;
    container.append(createSegmentEntry(segment, index, index === activeSegmentIndex, sched));
  });
}

function createHeroCard(routePlan, tripMeta = null) {
  const { totalDurationText, totalDistanceText, arrivalTimeText } = routePlan;
  const card = document.createElement("article");
  card.className = "summary-card";

  // 복귀 시간 계산
  const returnTimeInfo = calculateReturnTimeInfo(routePlan, tripMeta);
  
  // 여행 정보 섹션 생성
  const tripInfoSection = tripMeta ? createTripInfoSection(tripMeta) : '';
  
  card.innerHTML = `
    <div class="total-summary">
      <div class="total-summary__title">전체 여정 요약</div>
      ${tripInfoSection}
      <div class="total-summary__item">
        <span class="total-summary__label">총 소요 시간</span>
        <span class="total-summary__value total-summary__value--time">${totalDurationText}</span>
      </div>
      <div class="total-summary__item">
        <span class="total-summary__label">총 이동 거리</span>
        <span class="total-summary__value total-summary__value--distance">${totalDistanceText}</span>
      </div>
      ${arrivalTimeText ? `
        <div class="total-summary__item">
          <span class="total-summary__label">예상 도착</span>
          <span class="total-summary__value">${arrivalTimeText}</span>
        </div>
      ` : ""}
    </div>
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

function createSegmentEntry(segment, index, isActive, schedule = null) {
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

  // 출발/도착 시간 표시 (여행자 실제 환승 시간대 기준)
  if (schedule?.start && schedule?.end) {
    const timeBlock = document.createElement("p");
    timeBlock.innerHTML = `<strong>출발:</strong> ${formatDateTime(schedule.start)} · <strong>도착:</strong> ${formatDateTime(schedule.end)}`;
    content.append(timeBlock);
  }

  if (segment.legs?.length) {
    const list = document.createElement("ul");
    list.className = "summary-card__legs";
    // segment 시작 시각을 커서로 사용하여 leg별 시간 계산
    let legCursor = schedule?.start ? new Date(schedule.start) : null;
    segment.legs.forEach((leg) => {
      const item = document.createElement("li");
      const lines = [];
      if (leg.durationText) lines.push(leg.durationText);
      if (leg.distanceText) lines.push(leg.distanceText);
      if (leg.details) lines.push(leg.details);

      // leg 출발/도착 시각 계산 (가능한 경우)
      let timesSuffix = '';
      if (legCursor) {
        const legDurSec = Number(leg?.duration) || parseDurationTextToSeconds(leg?.durationText) || 0;
        const legStart = new Date(legCursor);
        const legEnd = new Date(legStart.getTime() + Math.max(0, legDurSec) * 1000);
        legCursor = new Date(legEnd);
        const startText = formatTimeLocalHM(legStart);
        const endText = formatTimeLocalHM(legEnd);
        timesSuffix = ` · ${startText} 출발 · ${endText} 도착`;
      }

      item.innerHTML = `<strong>${leg.modeLabel}</strong>${lines.length ? ` ${lines.join(" · ")}` : ""}${timesSuffix}`;
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

// 구간별 출발/도착 시각을 originalArrival/arrival을 기준으로 생성
function buildSegmentSchedule(routePlan, tripMeta) {
  try {
    const baseISO = tripMeta?.originalArrival || tripMeta?.arrival;
    if (!baseISO) return [];
    const base = new Date(baseISO);
    if (isNaN(base.getTime())) return [];
    let cursor = new Date(base);

    return (routePlan.segments || []).map((seg) => {
      const dSec = Number(seg?.duration) || parseDurationTextToSeconds(seg?.durationText) || 0;
      const start = new Date(cursor);
      const end = new Date(start.getTime() + Math.max(0, dSec) * 1000);
      cursor = new Date(end);
      return { start, end };
    });
  } catch (e) {
    console.warn('buildSegmentSchedule 실패:', e?.message);
    return [];
  }
}

// durationText("1시간 23분"/"1h 23m")를 초로 파싱
function parseDurationTextToSeconds(text) {
  if (!text || typeof text !== 'string') return 0;
  const t = text.trim();
  const kr = t.match(/(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?/);
  if (kr && (kr[1] || kr[2])) {
    const h = parseInt(kr[1] || '0', 10);
    const m = parseInt(kr[2] || '0', 10);
    return (h * 60 + m) * 60;
  }
  const en = t.match(/(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/i);
  if (en && (en[1] || en[2])) {
    const h = parseInt(en[1] || '0', 10);
    const m = parseInt(en[2] || '0', 10);
    return (h * 60 + m) * 60;
  }
  const onlyMin = t.match(/^(\d+)\s*분?$/);
  if (onlyMin) return parseInt(onlyMin[1], 10) * 60;
  return 0;
}

/**
 * 여행 정보 섹션을 생성합니다
 * @param {Object} tripMeta - 여행 메타데이터
 * @returns {string} HTML 문자열
 */
function createTripInfoSection(tripMeta) {
  if (!tripMeta) return '';

  // 원본 도착/출발 시간 사용 (transfer-info에서 입력한 값)
  const arrivalTimeStr = tripMeta.originalArrival || tripMeta.arrival;
  const departureTimeStr = tripMeta.originalDeparture || tripMeta.departure;
  
  if (!arrivalTimeStr || !departureTimeStr) {
    console.warn('⚠️ createTripInfoSection: arrival 또는 departure 시간이 없습니다.', tripMeta);
    return '';
  }
  
  const arrival = new Date(arrivalTimeStr);
  const departure = new Date(departureTimeStr);
  
  // 유효한 날짜인지 확인
  if (isNaN(arrival.getTime()) || isNaN(departure.getTime())) {
    console.warn('⚠️ createTripInfoSection: 유효하지 않은 날짜입니다.', {
      arrival: arrivalTimeStr,
      departure: departureTimeStr
    });
    return '';
  }
  
  // 전체 환승 시간 계산 (원본 출발 - 원본 도착)
  const totalLayoverMinutes = Math.round((departure.getTime() - arrival.getTime()) / (1000 * 60));
  const totalLayoverHours = Math.floor(totalLayoverMinutes / 60);
  const remainingMinutes = totalLayoverMinutes % 60;
  const layoverTimeText = totalLayoverHours > 0 
    ? `${totalLayoverHours}시간 ${remainingMinutes}분`
    : `${remainingMinutes}분`;

  // 입국/출국 버퍼를 0분으로 하드코딩 (요청사항)
  const entryBufferMinutes = 0;
  const returnBufferMinutes = 0;

  return `
    <div class="trip-info-section">
      <h4>✈️ 여행 정보</h4>
      <p><strong>🛫 도착:</strong> ${formatDateTime(arrival)}</p>
      <p><strong>🛬 출발:</strong> ${formatDateTime(departure)}</p>
      <p><strong>⏱️ 전체 환승 시간:</strong> ${layoverTimeText}</p>
      <p><strong>🕐 입국 버퍼:</strong> ${entryBufferMinutes}분</p>
      <p><strong>🕐 출국 버퍼:</strong> ${returnBufferMinutes}분</p>
    </div>
  `;
}

/**
 * 날짜와 시간을 포맷팅합니다
 * @param {Date} date - 포맷팅할 날짜
 * @returns {string} 포맷된 날짜 문자열
 */
function formatDateTime(date) {
  if (!date || !(date instanceof Date)) return '-';
  
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 로컬 시간 HH:MM (오전/오후 포함) 출력
function formatTimeLocalHM(date) {
  if (!date || !(date instanceof Date)) return '-';
  try {
    // ko-KR 로케일 사용하여 "오전/오후 HH:MM"
    return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  } catch (_) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}
