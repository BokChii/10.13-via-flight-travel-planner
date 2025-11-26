// Centralized application state container with a minimal pub/sub helper.
const state = {
  origin: null,
  destination: null,
  waypoints: [],
  routePlan: null,
  tripMeta: null,
  navigation: {
    active: false,
    startedAt: null,
    currentPosition: null,
    lastUpdatedAt: null,
    error: null,
    // Phase 1: 경로 이탈 및 GPS 정확도 정보
    routeDeviation: null,      // 경로 이탈 정보
    gpsAccuracy: null,          // GPS 정확도 정보
    status: 'normal',           // 네비게이션 상태 (normal, deviated, rerouting, low_accuracy, error)
    // Phase 2: 재경로로 인한 추가 소요 시간 (분)
    rerouteAdditionalMinutes: 0,
  },
};


function cloneTripMeta(meta) {
  if (!meta) return null;
  return {
    ...meta,
    exploreWindow: meta.exploreWindow ? { ...meta.exploreWindow } : null,
    categoriesUsed: Array.isArray(meta.categoriesUsed) ? [...meta.categoriesUsed] : [],
  };
}

const listeners = new Set();

export function getState() {
  return {
    ...state,
    navigation: { 
      ...state.navigation,
      routeDeviation: state.navigation.routeDeviation ? { ...state.navigation.routeDeviation } : null,
      gpsAccuracy: state.navigation.gpsAccuracy ? { ...state.navigation.gpsAccuracy } : null,
    },
    waypoints: state.waypoints.map((wp) => ({ ...wp })),
    origin: state.origin ? { ...state.origin } : null,
    destination: state.destination ? { ...state.destination } : null,
    tripMeta: state.tripMeta ? cloneTripMeta(state.tripMeta) : null,
    routePlan: state.routePlan ? { ...state.routePlan } : null,
  };
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateState(mutator) {
  mutator(state);
  listeners.forEach((listener) => listener(getState()));
}

/**
 * 상태를 업데이트하되 리스너를 트리거하지 않음 (무한 루프 방지)
 * subscribe 내부에서 상태를 업데이트할 때 사용
 * @param {Function} mutator - 상태 변경 함수
 */
export function updateStateSilent(mutator) {
  mutator(state);
  // 리스너 트리거 안 함 (무한 루프 방지)
}

export function resetState() {
  updateState((draft) => {
    draft.origin = null;
    draft.destination = null;
    draft.waypoints = [];
    draft.tripMeta = null;
    draft.routePlan = null;
    draft.navigation = {
      active: false,
      startedAt: null,
      currentPosition: null,
      lastUpdatedAt: null,
      error: null,
      routeDeviation: null,
      gpsAccuracy: null,
      status: 'normal',
      rerouteAdditionalMinutes: 0,
    };
  });
}
