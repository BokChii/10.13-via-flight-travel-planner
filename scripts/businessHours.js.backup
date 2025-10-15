/**
 * 영업 시간 처리 모듈
 * 기존 app.js의 영업 시간 로직을 모듈화하여 현재 프로젝트에 통합
 */

// 캐시 관리
const openStatusCache = new Map();

/**
 * 로컬 시간대 정보 추출
 */
export function getLocalParts(date, timeZone) {
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
export function convertTo24h(timeStr) {
  const minutes = parseTimeString(timeStr);
  if (minutes == null) return '00:00';
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_NAME_MAP = DAY_NAMES.reduce((acc, name, index) => {
  acc[name] = index;
  return acc;
}, {});

/**
 * 시간 문자열을 분 단위로 파싱
 */
export function parseTimeString(timeStr) {
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
export function normalizeWeekMinutes(day, timeStr) {
  const dayIndex = (typeof day === 'number' && !Number.isNaN(day)) ? day : 0;
  const minutes = parseTimeString(timeStr);
  const safeMinutes = minutes == null ? 0 : minutes;
  return dayIndex * 1440 + safeMinutes;
}

/**
 * 텍스트 영업 시간 파싱
 */
export function parseTextOperatingHours(entry, dayIdx, asWeekly = false) {
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
  
  // 24시간 영업 감지
  if (/24\s*hour|24\s*hours|24\/7|24\s*시간/i.test(value)) {
    if (asWeekly) {
      const base = localDayIdx * 1440;
      return [{ start: base, end: base + 1440 }];
    }
    return [{ start: 0, end: 1440 }];
  }
  
  // 시간 구간 파싱
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
 * 영업 시간 구간 빌드
 */
export function buildOpeningIntervals(opening) {
  const intervals = [];
  if (!opening) return intervals;
  
  const periods = Array.isArray(opening.periods) ? opening.periods : [];
  
  // periods 데이터 처리
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
  
  // weekday_text 데이터 처리
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
 * 로컬 분 단위 해결
 */
export function resolveLocalMinutes(date, timeZone, offsetMinutes) {
  if (typeof offsetMinutes === 'number') {
    const local = new Date(date.getTime() + offsetMinutes * 60000);
    return { day: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
  }
  
  const parts = getLocalParts(date, timeZone);
  return { day: parts.wd, minutes: parts.h * 60 + parts.m };
}

/**
 * 구간 내 포함 여부 확인
 */
export function isWithinIntervals(intervals, startMin, endMin) {
  const WEEK = 7 * 1440;
  if (endMin - startMin >= WEEK) {
    return intervals.length > 0;
  }
  
  const offsets = [-WEEK, 0, WEEK];
  for (const { start, end } of intervals) {
    for (const offset of offsets) {
      const s = start + offset;
      const e = end + offset;
      if (startMin >= s && endMin <= e) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 영업 상태 평가 (핵심 함수)
 */
export function evaluateOperatingStatus(openingHours, startDate, stayMinutes, timeZone, offsetMinutes) {
  console.log('🔍 [FIXED] evaluateOperatingStatus 호출됨');
  console.log('📅 [FIXED] startDate:', startDate);
  console.log('⏰ [FIXED] stayMinutes:', stayMinutes);
  console.log('🌍 [FIXED] timeZone:', timeZone);
  console.log('📊 [FIXED] openingHours:', openingHours);
  
  if (!openingHours) {
    console.log('⚠️ [FIXED] openingHours 없음 - true 반환');
    return true;
  }
  
  const intervals = buildOpeningIntervals(openingHours);
  const WEEK = 7 * 1440;
  const stay = Math.max(1, stayMinutes || 0);
  const endDate = new Date(startDate.getTime() + stay * 60000);
  
  const startInfo = resolveLocalMinutes(startDate, timeZone, offsetMinutes);
  const endInfo = resolveLocalMinutes(endDate, timeZone, offsetMinutes);
  
  let startMin = startInfo.day * 1440 + startInfo.minutes;
  let endMin = endInfo.day * 1440 + endInfo.minutes;
  
  console.log('🕐 [FIXED] startMin:', startMin);
  console.log('🕐 [FIXED] endMin:', endMin);
  
  if (endMin < startMin) {
    endMin += WEEK;
  }
  
  if (intervals.length && isWithinIntervals(intervals, startMin, endMin)) {
    console.log('✅ [FIXED] intervals 내에 있음 - true 반환');
    return true;
  }
  
  const localStart = offsetMinutes != null ? new Date(startDate.getTime() + offsetMinutes * 60000) : new Date(startDate);
  const localEnd = offsetMinutes != null ? new Date(endDate.getTime() + offsetMinutes * 60000) : new Date(endDate);
  
  const startSlots = getTodayOperatingHours(openingHours, localStart.getDay());
  if (startSlots && startSlots.length) {
    if (!isWithinOperatingTime(startSlots, localStart)) {
      return false;
    }
    if (isWithinOperatingTime(startSlots, localEnd)) {
      return true;
    }
    
    const nextSlots = getTodayOperatingHours(openingHours, localEnd.getDay());
    if (nextSlots && nextSlots.length) {
      return isWithinOperatingTime(nextSlots, localEnd);
    }
    return false;
  }
  
  if (Array.isArray(openingHours.weekday_text)) {
    const is24 = openingHours.weekday_text.some(text => /24\s*hour|24\s*hours|24\/7|24\s*시간/i.test(text));
    if (is24) {
      return true;
    }
  }
  
  return false;
}

/**
 * 오늘의 영업 시간 가져오기
 */
export function getTodayOperatingHours(openingHours, dayOfWeek) {
  if (!openingHours) return null;
  
  const slots = [];
  
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
  
  if (Array.isArray(openingHours.weekday_text)) {
    const entry = openingHours.weekday_text.find(text => text.startsWith(DAY_NAMES[dayOfWeek]));
    if (entry) {
      const parsed = parseTextOperatingHours(entry, dayOfWeek, false);
      if (parsed.length) {
        return parsed;
      }
    }
  }
  
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
export function isWithinOperatingTime(slots, hourOrDate, minute) {
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
 * 영업 상태 판정 (통합 함수)
 */
export function getBusinessStatus(poi, travelTime = null) {
  console.log('🔍 [FIXED] getBusinessStatus 호출됨 - 수정된 버전');
  const { business_status, opening_hours } = poi;
  
  // opening_hours가 없으면 상태 불명
  if (!opening_hours) {
    console.log('⚠️ [FIXED] opening_hours 없음 - UNKNOWN 반환');
    return 'UNKNOWN';
  }
  
  // 여행 시간이 주어진 경우 영업 시간 비교 (OPERATIONAL이어도 실제 영업 시간 확인)
  if (travelTime) {
    console.log('🕐 [FIXED] travelTime 있음 - evaluateOperatingStatus 호출');
    const isOpen = evaluateOperatingStatus(
      opening_hours,
      travelTime.start,
      travelTime.durationMinutes,
      travelTime.timeZone,
      poi.utc_offset_minutes
    );
    console.log('📊 [FIXED] evaluateOperatingStatus 결과:', isOpen);
    const result = isOpen ? 'OPEN' : 'CLOSED';
    console.log('✅ [FIXED] 최종 결과:', result);
    return result;
  }
  
  // Google Places API의 business_status는 참고용으로만 사용
  if (business_status === 'CLOSED_TEMPORARILY' || business_status === 'CLOSED_PERMANENTLY') {
    console.log('❌ [FIXED] CLOSED_TEMPORARILY/PERMANENTLY - CLOSED 반환');
    return 'CLOSED';
  }
  
  console.log('⚠️ [FIXED] 기본 - UNKNOWN 반환');
  return 'UNKNOWN';
}

/**
 * 영업 상태 아이콘 가져오기
 */
export function getBusinessStatusIcon(status) {
  const statusMap = {
    'OPEN': '🟢',
    'CLOSED': '🔴',
    'UNKNOWN': '⚪'
  };
  return statusMap[status] || '⚪';
}

/**
 * 영업 상태 라벨 가져오기
 */
export function getBusinessStatusLabel(status) {
  const labelMap = {
    'OPEN': '영업 중',
    'CLOSED': '영업 종료',
    'UNKNOWN': '영업 상태 확인 불가'
  };
  return labelMap[status] || '영업 상태 확인 불가';
}

/**
 * 캐시 무효화
 */
export function invalidateOpenStatusCache() {
  openStatusCache.clear();
}
