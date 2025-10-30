/**
 * 영업 시간 처리 모듈 - 기존 서비스 검증된 코드
 * 24시간 영업, 브레이크 타임, UTC offset 보정 모두 지원
 */

/**
 * 시간대별 날짜 정보 추출
 */
function getLocalParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short'
  });
  
  const parts = fmt.formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  
  return {
    Y: Number(parts.year),
    M: Number(parts.month),
    D: Number(parts.day),
    h: Number(parts.hour),
    m: Number(parts.minute),
    wd
  };
}

/**
 * 시간 문자열을 24시간 형식으로 변환
 */
function convertTo24h(timeStr) {
  const minutes = parseTimeString(timeStr);
  if (minutes == null) return '00:00';
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * 요일 이름 매핑
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAME_MAP = DAY_NAMES.reduce((acc, name, index) => {
  acc[name] = index;
  return acc;
}, {});

/**
 * 시간 문자열 파싱 (AM/PM, 24시간 형식 지원)
 */
function parseTimeString(timeStr) {
  if (timeStr == null) return null;
  if (typeof timeStr === 'number' && Number.isFinite(timeStr)) {
    return Math.round(timeStr);
  }
  
  const trimmed = String(timeStr).trim();
  if (trimmed.length === 0) return null;
  
  // HHMM 형식 (예: 1430)
  if (/^[0-9]{4}$/.test(trimmed)) {
    const hour = parseInt(trimmed.slice(0, 2), 10);
    const minute = parseInt(trimmed.slice(2, 4), 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return hour * 60 + minute;
  }
  
  // 12시간 형식 (예: 2:30 PM)
  const twelve = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (twelve) {
    let hour = parseInt(twelve[1], 10);
    const minute = parseInt(twelve[2], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    const period = twelve[3].toUpperCase();
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return hour * 60 + minute;
  }
  
  // 24시간 형식 (예: 14:30)
  const twentyFour = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const hour = parseInt(twentyFour[1], 10);
    const minute = parseInt(twentyFour[2], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return hour * 60 + minute;
  }
  
  return null;
}

/**
 * 주간 분 단위로 정규화
 */
function normalizeWeekMinutes(day, timeStr) {
  const dayIndex = (typeof day === 'number' && !Number.isNaN(day)) ? day : 0;
  const minutes = parseTimeString(timeStr);
  const safeMinutes = minutes == null ? 0 : minutes;
  return dayIndex * 1440 + safeMinutes;
}

/**
 * 텍스트 영업 시간 파싱 (24시간, 브레이크 타임 지원)
 */
function parseTextOperatingHours(entry, dayIdx, asWeekly = false) {
  if (!entry) return [];
  
  let value = entry;
  let localDayIdx = dayIdx;
  
  // 요일 접두사 제거
  const prefixMatch = value.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*: ?\s*/i);
  if (prefixMatch) {
    value = value.slice(prefixMatch[0].length).trim();
    if (localDayIdx == null) {
      const normalized = prefixMatch[1].charAt(0).toUpperCase() + prefixMatch[1].slice(1).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(DAY_NAME_MAP, normalized)) {
        localDayIdx = DAY_NAME_MAP[normalized];
      }
    }
  }
  
  if (localDayIdx == null) {
    localDayIdx = 0;
  }
  
  if (value.length === 0 || /closed/i.test(value)) return [];
  
  // 24시간 영업 처리
  if (/24\s*hour|24\s*hours|24\/7|24\s*시간/i.test(value)) {
    if (asWeekly) {
      const base = localDayIdx * 1440;
      return [{ start: base, end: base + 1440 }];
    }
    return [{ start: 0, end: 1440 }];
  }
  
  // 여러 시간대 파싱 (브레이크 타임 지원)
  const segments = value.split(/,|;/).map(seg => seg.trim()).filter(Boolean);
  const slots = [];
  
  for (const segment of segments) {
    const match = segment.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*(?:-|–|—|to|until|~)\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (!match) continue;
    
    const open = parseTimeString(match[1]);
    const close = parseTimeString(match[2]);
    if (open == null || close == null) continue;
    
    if (asWeekly) {
      const base = localDayIdx * 1440;
      let start = base + open;
      let end = base + close;
      if (end <= start) end += 1440;
      slots.push({ start, end });
    } else {
      let start = open;
      let end = close;
      if (end <= start) end += 1440;
      slots.push({ start, end });
    }
  }
  
  return slots;
}

/**
 * 영업 시간 간격 구축 (periods와 weekday_text 모두 지원)
 */
function buildOpeningIntervals(opening) {
  const intervals = [];
  if (!opening) return intervals;
  
  // periods 배열 처리
  const periods = Array.isArray(opening.periods) ? opening.periods : [];
  for (const period of periods) {
    const open = period.open;
    if (!open?.time) continue;
    
    const start = normalizeWeekMinutes(open.day ?? 0, open.time);
    const close = period.close;
    let end;
    
    if (!close || close.time == null) {
      end = start + 1440;
    } else {
      end = normalizeWeekMinutes(close.day ?? (open.day ?? 0), close.time);
      if (end <= start) end += 1440;
    }
    
    intervals.push({ start, end });
  }
  
  if (intervals.length) {
    return intervals;
  }
  
  // weekday_text 처리
  if (Array.isArray(opening?.weekday_text)) {
    for (const entry of opening.weekday_text) {
      const dayMatch = entry.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i);
      if (!dayMatch) continue;
      
      const normalized = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1).toLowerCase();
      const dayIdx = DAY_NAME_MAP[normalized];
      if (dayIdx == null) continue;
      
      const parsed = parseTextOperatingHours(entry, dayIdx, true);
      parsed.forEach(slot => intervals.push(slot));
    }
  }
  
  return intervals;
}

/**
 * 로컬 시간 분 단위로 변환 (UTC offset 보정)
 */
function resolveLocalMinutes(date, timeZone, offsetMinutes) {
  // 항상 getLocalParts를 사용하도록 수정
  const parts = getLocalParts(date, timeZone);
  return { day: parts.wd, minutes: parts.h * 60 + parts.m };
}

/**
 * 간격 내 포함 여부 확인 (주간 순환 고려)
 * 방문 시간과 영업 시간이 부분적으로라도 겹치면 영업 중으로 간주
 */
function isWithinIntervals(intervals, startMin, endMin) {
  const WEEK = 7 * 1440;
  
  if (endMin - startMin >= WEEK) {
    return intervals.length > 0;
  }
  
  const offsets = [-WEEK, 0, WEEK];
  for (const { start, end } of intervals) {
    for (const offset of offsets) {
      const s = start + offset;
      const e = end + offset;
      
      // 방문 시간과 영업 시간이 겹치는지 확인 (부분 겹침도 허용)
      // 두 구간이 겹치는 조건: startMin < e && endMin > s
      // 이는 방문 시간의 시작이 영업 시간의 끝보다 이전이고,
      // 방문 시간의 끝이 영업 시간의 시작보다 이후일 때 두 구간이 겹침
      if (startMin < e && endMin > s) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 특정 요일의 영업 시간 가져오기
 */
function getTodayOperatingHours(openingHours, dayOfWeek) {
  if (!openingHours) return null;
  
  const slots = [];
  
  // periods 배열에서 해당 요일 찾기
  if (Array.isArray(openingHours.periods)) {
    const todays = openingHours.periods.filter(period => period.open && period.open.day === dayOfWeek);
    for (const period of todays) {
      const openMinutes = parseTimeString(period.open.time);
      if (openMinutes == null) continue;
      
      let closeMinutes;
      if (period.close && period.close.time) {
        closeMinutes = parseTimeString(period.close.time);
        if (closeMinutes == null) continue;
        if (period.close.day != null && period.close.day !== dayOfWeek) {
          closeMinutes += 1440;
        }
      } else {
        closeMinutes = openMinutes + 1440;
      }
      
      if (closeMinutes <= openMinutes) {
        closeMinutes += 1440;
      }
      
      slots.push({ start: openMinutes, end: closeMinutes });
    }
    
    if (slots.length) {
      return slots;
    }
  }
  
  // weekday_text에서 해당 요일 찾기
  if (Array.isArray(openingHours.weekday_text)) {
    const entry = openingHours.weekday_text.find(text => text.startsWith(DAY_NAMES[dayOfWeek]));
    if (entry) {
      const parsed = parseTextOperatingHours(entry, dayOfWeek, false);
      if (parsed.length) {
        return parsed;
      }
    }
  }
  
  // 문자열 형태의 영업 시간 처리
  if (typeof openingHours === 'string') {
    const parsed = parseTextOperatingHours(openingHours, dayOfWeek, false);
    if (parsed.length) {
      return parsed;
    }
  }
  
  return null;
}

/**
 * 영업 시간 내 포함 여부 확인
 */
function isWithinOperatingTime(slots, hourOrDate, minute) {
  if (!Array.isArray(slots) || slots.length === 0) return false;
  
  let minutes;
  if (hourOrDate instanceof Date) {
    minutes = hourOrDate.getHours() * 60 + hourOrDate.getMinutes();
  } else if (typeof hourOrDate === 'number') {
    minutes = hourOrDate * 60 + (minute || 0);
  } else {
    return false;
  }
  
  const candidates = [minutes, minutes + 1440];
  
  for (const slot of slots) {
    if (slot == null) continue;
    
    let start = slot.start != null ? slot.start : 0;
    let end = slot.end != null ? slot.end : start + 1440;
    
    if (end <= start) {
      end += 1440;
    }
    
    if (candidates.some(val => val >= start && val < end)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 영업 상태 평가 (핵심 함수)
 */
export function evaluateOperatingStatus(openingHours, startDate, stayMinutes, timeZone, offsetMinutes) {
  // openingHours가 없으면 영업 상태 불명으로 간주 (기본적으로 true 반환)
  if (!openingHours) {
    return true;
  }
  
  // stayMinutes가 없거나 0이면 1분으로 설정
  const stay = Math.max(1, stayMinutes || 0);
  const endDate = new Date(startDate.getTime() + stay * 60000);
  
  // 시간대 정보가 없으면 기본값 사용
  const effectiveTimeZone = timeZone || 'Asia/Seoul';
  const effectiveOffsetMinutes = offsetMinutes || 0;
  
  // 로컬 시간으로 변환
  const startInfo = resolveLocalMinutes(startDate, effectiveTimeZone, effectiveOffsetMinutes);
  const endInfo = resolveLocalMinutes(endDate, effectiveTimeZone, effectiveOffsetMinutes);
  
  // 주간 분 단위로 변환
  let startMin = startInfo.day * 1440 + startInfo.minutes;
  let endMin = endInfo.day * 1440 + endInfo.minutes;
  
  // 다음 날로 넘어가는 경우 처리
  if (endMin < startMin) {
    endMin += 7 * 1440; // 7일 = 1주
  }
  
  // 영업 시간 간격 구축
  const intervals = buildOpeningIntervals(openingHours);
  
  // 간격 내에 포함되는지 확인
  if (intervals.length > 0 && isWithinIntervals(intervals, startMin, endMin)) {
    return true;
  }
  
  // 24시간 영업 확인
  if (Array.isArray(openingHours.weekday_text)) {
    const is24 = openingHours.weekday_text.some(text => 
      /24\s*hour|24\s*hours|24\/7|24\s*시간/i.test(text)
    );
    if (is24) {
      return true;
    }
  }
  
  // periods 배열에서 24시간 영업 확인
  if (Array.isArray(openingHours.periods)) {
    const is24 = openingHours.periods.some(period => {
      if (!period.open?.time) return false;
      const openTime = parseTimeString(period.open.time);
      const closeTime = period.close?.time ? parseTimeString(period.close.time) : null;
      return openTime === 0 && (!closeTime || closeTime === 1440);
    });
    if (is24) {
      return true;
    }
  }
  
  return false;
}

/**
 * 영업 상태 판정 (통합 함수)
 */
export function getBusinessStatus(poi, travelTime = null) {
  console.log('🔍 [getBusinessStatus] 호출:', {
    poiName: poi?.name || poi?.label,
    hasOpeningHours: !!poi?.opening_hours,
    business_status: poi?.business_status,
    hasTravelTime: !!travelTime,
    travelTimeStart: travelTime?.start?.toISOString(),
    travelTimeDurationMinutes: travelTime?.durationMinutes,
    travelTimeTimeZone: travelTime?.timeZone
  });
  
  const { business_status, opening_hours } = poi;
  
  // opening_hours가 없으면 상태 불명
  if (!opening_hours) {
    console.warn('⚠️ [getBusinessStatus] opening_hours 없음 → UNKNOWN', {
      poiName: poi?.name || poi?.label
    });
    return 'UNKNOWN';
  }
  
  // Google Places API의 business_status가 명시적으로 폐업/휴업인 경우
  if (business_status === 'CLOSED_TEMPORARILY' || business_status === 'CLOSED_PERMANENTLY') {
    console.log('❌ [getBusinessStatus] 폐업/휴업 상태 → CLOSED', {
      poiName: poi?.name || poi?.label,
      business_status
    });
    return 'CLOSED';
  }
  
  // 여행 시간이 주어진 경우 영업 시간 비교
  if (travelTime && travelTime.start && travelTime.durationMinutes) {
    const isOpen = evaluateOperatingStatus(
      opening_hours,
      travelTime.start,
      travelTime.durationMinutes,
      travelTime.timeZone || 'Asia/Seoul',
      poi.utc_offset_minutes || 0
    );
    
    const result = isOpen ? 'OPEN' : 'CLOSED';
    console.log(`✅ [getBusinessStatus] 영업 시간 평가 완료 → ${result}`, {
      poiName: poi?.name || poi?.label,
      isOpen,
      visitStartTime: travelTime.start?.toISOString(),
      durationMinutes: travelTime.durationMinutes,
      timeZone: travelTime.timeZone
    });
    return result;
  }
  
  console.warn('⚠️ [getBusinessStatus] travelTime 조건 불만족 → UNKNOWN', {
    poiName: poi?.name || poi?.label,
    hasTravelTime: !!travelTime,
    hasStart: !!travelTime?.start,
    hasDurationMinutes: !!travelTime?.durationMinutes
  });
  return 'UNKNOWN';
}

/**
 * business_hours 문자열 기반 운영 상태 판정 (SQLite 공항 POI 전용)
 * 지원 패턴 예시:
 * - OPEN 24/7
 * - 6:00AM - 10:00PM (주석 포함 가능)
 * - 10:00 - 22:00 (24h 형식)
 */
function parseTimeToken(token) {
  if (!token) return null;
  const t = token.trim();
  // 24h like 10:00 or 8:30
  const m24 = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (m24) {
    const h = Number(m24[1]);
    const m = Number(m24[2] || '0');
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) return h * 60 + m;
  }
  // 12h like 10:00AM, 8PM
  const m12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (m12) {
    let h = Number(m12[1]);
    const m = Number(m12[2] || '0');
    const ap = m12[3].toUpperCase();
    if (ap === 'AM') {
      if (h === 12) h = 0;
    } else {
      if (h !== 12) h += 12;
    }
    return h * 60 + m;
  }
  return null;
}

function extractIntervalsFromBusinessHoursString(businessHoursStr) {
  if (!businessHoursStr || typeof businessHoursStr !== 'string') return [];
  let s = businessHoursStr.trim();
  // 한글 오전/오후 → AM/PM
  s = s.replace(/오전/gi, 'AM').replace(/오후/gi, 'PM');
  // 다양한 구분자(~, –, —, to, 〜)를 하이픈으로 통일
  s = s.replace(/\s*(~|–|—|to|〜)\s*/gi, ' - ');
  // AM/PM 전치 → 후치 (예: 'AM 10:00' → '10:00AM')
  s = s.replace(/\b(AM|PM)\s*(\d{1,2}(?::\d{2})?)/gi, (_m, ap, time) => `${time}${ap.toUpperCase()}`);
  // 공백 정리
  s = s.replace(/\s+/g, ' ').trim();
  // 24/7 detection
  if (/24\s*\/\s*7|24\s*hours?|OPEN\s*24\s*\/\s*7/i.test(s)) {
    return [{ start: 0, end: 1440 }];
  }
  // Remove parenthetical notes
  const withoutNotes = s.replace(/\([^)]*\)/g, '').trim();
  // Expect a single range "A - B"
  const parts = withoutNotes.split('-').map(p => p.trim());
  if (parts.length === 2) {
    // Try 12h first
    let startMin = parseTimeToken(parts[0].toUpperCase().replace(/\s+/g, ''));
    let endMin = parseTimeToken(parts[1].toUpperCase().replace(/\s+/g, ''));
    if (startMin == null || endMin == null) {
      // Try forgiving parse (keep spaces)
      startMin = parseTimeToken(parts[0]);
      endMin = parseTimeToken(parts[1]);
    }
    if (startMin != null && endMin != null) {
      if (endMin <= startMin) endMin += 1440; // cross midnight
      return [{ start: startMin, end: endMin }];
    }
  }
  return [];
}

export function getStatusFromBusinessHoursString(businessHoursStr, visitStartDate, stayMinutes = 30, timeZone = 'Asia/Singapore') {
  try {
    // 방문 구간 계산 (로컬 분)
    const startInfo = resolveLocalMinutes(visitStartDate, timeZone, 0);
    const startMin = startInfo.day * 1440 + startInfo.minutes;
    const endMin = startMin + Math.max(1, stayMinutes);
    const intervals = extractIntervalsFromBusinessHoursString(businessHoursStr);
    if (intervals.length === 0) return 'UNKNOWN';
    // 매일 반복되는 영업시간으로 간주하여 방문일 경계에 정렬 후 일 단위 오프셋으로 부분 겹침 검사
    const DAY = 1440;
    const baseDay = Math.floor(startMin / DAY) * DAY;
    const dayOffsets = [-3 * DAY, -2 * DAY, -1 * DAY, 0, 1 * DAY, 2 * DAY, 3 * DAY];
    for (const { start, end } of intervals) {
      for (const dOffset of dayOffsets) {
        const s = baseDay + dOffset + start;
        let e = baseDay + dOffset + end;
        if (e <= s) e += DAY; // 자정 교차 처리
        if (startMin < e && endMin > s) return 'OPEN';
      }
    }
    return 'CLOSED';
  } catch (e) {
    console.warn('getStatusFromBusinessHoursString 실패', e);
    return 'UNKNOWN';
  }
}

/**
 * 영업 상태 아이콘 가져오기
 */
export function getBusinessStatusIcon(status) {
  switch (status) {
    case 'OPEN':
      return '🟢';
    case 'CLOSED':
      return '🔴';
    case 'CLOSING_SOON':
      return '🟡';
    default:
      return '⚪';
  }
}

/**
 * 영업 상태 라벨 가져오기
 */
export function getBusinessStatusLabel(status) {
  switch (status) {
    case 'OPEN':
      return '영업 중';
    case 'CLOSED':
      return '영업 종료';
    case 'CLOSING_SOON':
      return '곧 영업 종료';
    default:
      return '영업 상태 확인 불가';
  }
}