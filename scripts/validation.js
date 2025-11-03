/**
 * 데이터 검증 유틸리티
 * sessionStorage나 외부에서 받은 데이터의 유효성을 검증합니다.
 */

/**
 * Planner에서 생성된 plan 객체의 유효성을 검증합니다.
 * @param {any} plan - 검증할 plan 객체
 * @returns {boolean} 유효하면 true
 */
export function isValidPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return false;
  }

  // origin과 destination은 optional하지만 존재하면 객체여야 함
  if (plan.origin !== undefined && (typeof plan.origin !== 'object' || plan.origin === null)) {
    return false;
  }

  if (plan.destination !== undefined && (typeof plan.destination !== 'object' || plan.destination === null)) {
    return false;
  }

  // waypoints는 배열이어야 함 (없으면 빈 배열)
  if (!Array.isArray(plan.waypoints)) {
    return false;
  }

  // waypoint 항목들이 유효한지 확인
  for (const wp of plan.waypoints) {
    if (!wp || typeof wp !== 'object') {
      return false;
    }
    // 최소한 label이나 address 중 하나는 있어야 함
    if (!wp.label && !wp.address) {
      return false;
    }
  }

  // meta는 optional하지만 존재하면 객체여야 함
  if (plan.meta !== undefined) {
    if (typeof plan.meta !== 'object' || plan.meta === null) {
      return false;
    }

    // meta 내부 필드 검증 (필수는 아니지만 타입은 확인)
    if (plan.meta.arrival !== undefined && typeof plan.meta.arrival !== 'string') {
      return false;
    }
    if (plan.meta.departure !== undefined && typeof plan.meta.departure !== 'string') {
      return false;
    }
    if (plan.meta.exploreWindow !== undefined) {
      if (typeof plan.meta.exploreWindow !== 'object' || plan.meta.exploreWindow === null) {
        return false;
      }
      if (plan.meta.exploreWindow.start !== undefined && typeof plan.meta.exploreWindow.start !== 'string') {
        return false;
      }
      if (plan.meta.exploreWindow.end !== undefined && typeof plan.meta.exploreWindow.end !== 'string') {
        return false;
      }
    }
    if (plan.meta.categoriesUsed !== undefined && !Array.isArray(plan.meta.categoriesUsed)) {
      return false;
    }
  }

  return true;
}

/**
 * Router state 객체의 유효성을 검증합니다.
 * @param {any} state - 검증할 state 객체
 * @returns {boolean} 유효하면 true
 */
export function isValidRouterState(state) {
  if (!state || typeof state !== 'object') {
    return false;
  }

  // 허용된 키만 있는지 확인 (기본적인 구조 검증)
  const allowedKeys = [
    'transferInfo',
    'userChoice',
    'preferences',
    'selectedPois',
    'schedule',
    'navigationActive'
  ];

  // 모든 키가 허용된 키이거나 안전한 타입인지 확인
  for (const key in state) {
    if (!allowedKeys.includes(key)) {
      // 알 수 없는 키가 있어도 허용 (확장 가능성)
      // 하지만 값이 함수나 복잡한 객체는 제외
      if (typeof state[key] === 'function') {
        return false;
      }
    }
  }

  // 선택된 필드들의 타입 확인
  if (state.selectedPois !== undefined && !Array.isArray(state.selectedPois)) {
    return false;
  }

  if (state.navigationActive !== undefined && typeof state.navigationActive !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Trip snapshot 객체의 유효성을 검증합니다.
 * @param {any} snapshot - 검증할 snapshot 객체
 * @returns {boolean} 유효하면 true
 */
export function isValidTripSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return false;
  }

  // 필수 필드 확인
  if (!snapshot.origin || typeof snapshot.origin !== 'object') {
    return false;
  }

  if (!snapshot.destination || typeof snapshot.destination !== 'object') {
    return false;
  }

  // waypoints는 배열이어야 함
  if (!Array.isArray(snapshot.waypoints)) {
    return false;
  }

  // version이 있으면 숫자여야 함
  if (snapshot.version !== undefined && typeof snapshot.version !== 'number') {
    return false;
  }

  return true;
}

/**
 * sessionStorage에서 데이터를 안전하게 파싱하고 검증합니다.
 * @param {string} key - sessionStorage 키
 * @param {Function} validator - 검증 함수
 * @returns {any|null} 파싱된 데이터 또는 null
 */
export function safeParseFromStorage(key, validator) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    
    // 검증 함수가 제공되면 검증 수행
    if (validator && !validator(parsed)) {
      console.warn(`[validation] Invalid data structure for key "${key}"`);
      // 손상된 데이터 제거
      sessionStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(`[validation] Failed to parse data from "${key}":`, error);
    // 파싱 실패 시 손상된 데이터 제거
    sessionStorage.removeItem(key);
    return null;
  }
}

