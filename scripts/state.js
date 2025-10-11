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
    navigation: { ...state.navigation },
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
    };
  });
}
