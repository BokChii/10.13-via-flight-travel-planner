import { getElements, renderWaypoints } from "./ui.js";
import { getState, subscribe, updateState, resetState } from "./state.js";
import { renderSummary } from "./summary.js";
import { renderNavigationStatus } from "./navigationUi.js";
import { loadGoogleMapsSdk, requestDirections } from "./api.js";
import {
  initMap,
  renderRoute,
  clearRoute,
  highlightSegment,
  updateUserLocation,
  showPreviewMarker,
  clearPreviewMarker,
} from "./map.js";
import { buildRoutePlan } from "./routing.js";
import { getGoogleMapsApiKey, NOTIFICATION_CONFIG } from "./config.js";
import { initAutocomplete } from "./autocomplete.js";
// import { updateAutocompleteRegion } from "./autocomplete.js"; // 국가별 제한 기능 활성화 시 주석 해제
import { getRouteColors } from "./palette.js";
import { beginNavigationTracking } from "./navigationTracker.js";
import { calculateNavigationProgress } from "./progress.js";
import { showToast } from "./toast.js";
import { buildTripSnapshot, buildShareText, parseTripSnapshot } from "./trip.js";
import { initPlaceModal, openPlaceModal } from "./placeModal.js";
import { getCurrentLocationContext, generateLocationDescription } from "./locationContext.js";
import { getCurrentWaypointContext } from "./navigationUi.js";
import { detectEmergencySituation, activateEmergencyMode, calculateAirportReturnRoute, showAirportReturnModal } from "./emergencyMode.js";
import { calculateRealTimeReturnInfo, generateAirportReturnMessage } from "./airportReturnSystem.js";

import { attachPlannerServices } from "./planner.js";

const config = {
  googleMapsApiKey: getGoogleMapsApiKey(),
};

const TOAST_COOLDOWN_MS = NOTIFICATION_CONFIG.TOAST_COOLDOWN_MS;
const TOAST_DISTANCE_THRESHOLD_METERS = NOTIFICATION_CONFIG.TOAST_DISTANCE_THRESHOLD_METERS;
const RETURN_WARNING_THRESHOLD_MINUTES = 20;
const RETURN_DEADLINE_TIMER_INTERVAL_MS = NOTIFICATION_CONFIG.RETURN_DEADLINE_TIMER_INTERVAL_MS;
const RETURN_ETA_WARNING_THRESHOLD_MINUTES = 30;



let googleMaps;
let mapInstance;
let placesService;
let stopNavigationTracking = null;
let lastHighlightedSegment = null;
let lastToastTimestamp = 0;
let returnDeadlineWarningNotified = false;
let returnDeadlineMissedNotified = false;
let returnEtaWarningNotified = false;
let returnEtaCriticalNotified = false;
let returnDeadlineTimerId = null;
let lastWaypointsState = null;
let lastTripMetaState = null;



// Check for planner result from sessionStorage and apply it
function checkForPlannerResult() {
  const plannerResult = sessionStorage.getItem('plannerResult');
  if (plannerResult) {
    try {
      const plan = JSON.parse(plannerResult);
      applyPlannerPlan(plan);
      // Clear the stored result
      sessionStorage.removeItem('plannerResult');
    } catch (error) {
      console.error('Failed to parse planner result:', error);
      sessionStorage.removeItem('plannerResult');
    }
  }
}

async function applyPlannerPlan(plan) {
  if (!plan) return;

  const elements = getElements();

  console.log('applyPlannerPlan: 받은 plan 데이터:', plan);
  console.log('applyPlannerPlan: plan.destination:', plan.destination);

  updateState((draft) => {
    draft.origin = plan.origin ? { ...plan.origin } : null;
    draft.destination = plan.destination ? { ...plan.destination } : null;
    draft.tripMeta = plan.meta
      ? {
          ...plan.meta,
          airportPosition: plan.destination?.location || null,  // 복귀 공항 위치 정보 추가
          returnAirport: plan.destination || null,              // 복귀 공항 전체 정보 추가
          exploreWindow: plan.meta?.exploreWindow ? { ...plan.meta.exploreWindow } : null,
          categoriesUsed: Array.isArray(plan.meta?.categoriesUsed) ? [...plan.meta.categoriesUsed] : [],
        }
      : null;
    draft.waypoints = Array.isArray(plan.waypoints) ? plan.waypoints.map((wp) => ({ ...wp })) : [];
    draft.routePlan = null;
    resetNavigationDraft(draft);
    
    console.log('applyPlannerPlan: 저장된 tripMeta:', draft.tripMeta);
  });

  if (elements.origin) {
    elements.origin.value = plan.origin?.address ?? plan.origin?.label ?? '';
  }
  if (elements.destination) {
    elements.destination.value = plan.destination?.address ?? plan.destination?.label ?? '';
  }
  if (elements.waypointInput) { elements.waypointInput.value = ''; }

  lastHighlightedSegment = null;

  // Recenter map to selected airport anchor if available
  const anchor = plan.origin?.location ?? plan.destination?.location;
  if (anchor && mapInstance?.setCenter) {
    try {
      mapInstance.setCenter(anchor);
    } catch {}
  }

  // Update autocomplete region based on selected airport
  // const airportLocation = plan.origin?.location ?? plan.destination?.location;
  // if (airportLocation) {
  //   const countryCode = getCountryCodeFromLocation(airportLocation);
  //   updateAutocompleteRegion(countryCode);
  // }

  showToast({ message: '추천 일정으로 경유지를 구성했습니다. 경로를 계산합니다.' });

  setViewMode('planning');
  try {
    await calculateRoute();
    showToast({ message: '추천 일정 경로가 준비됐어요.', type: 'success' });
  } catch (error) {
    console.error(error);
  }
}

async function bootstrap() {
  const elements = getElements();
  assertElements(elements);

  subscribe(async (latestState) => {
    manageNavigationTracking(latestState);
    const progress = computeProgress(latestState);
    applyNavigationHighlight(latestState, progress);
    maybeAnnounceNextStep(latestState, progress);
    await syncUi(elements, latestState, progress);
    await maybeNotifyReturnDeadline(latestState, progress);
    updateReturnDeadlineTimer(latestState);
  });
  const initialState = getState();
  const initialProgress = computeProgress(initialState);
  await syncUi(elements, initialState, null);
  // 초기 로드 시에는 긴급 모드 체크하지 않음 (네비게이션 활성화 후에만 체크)
  // maybeNotifyReturnDeadline(initialState, initialProgress);
  updateReturnDeadlineTimer(initialState);

  wireEventHandlers(elements);
  initPlaceModal();
  // Check for planner result will be called after Google Maps initialization

  if (!config.googleMapsApiKey) {
    document.getElementById("map").textContent = "Google Maps API 키가 설정되지 않았습니다.";
    console.warn("Google Maps API 키를 meta 태그에 설정하세요.");
    return;
  }

  try {
    googleMaps = await loadGoogleMapsSdk({
      apiKey: config.googleMapsApiKey,
      libraries: ["places"],
    });

    mapInstance = initMap(googleMaps, { center: { lat: 37.5665, lng: 126.978 }, zoom: 13 });
    placesService = new googleMaps.maps.places.PlacesService(mapInstance);
    attachPlannerServices({ googleMaps, placesService, map: mapInstance });
    const refreshedElements = getElements();
    initAutocomplete(googleMaps, refreshedElements, {
      onOriginSelect: (place) => handlePlaceSelection("origin", place, refreshedElements.origin),
      onDestinationSelect: (place) => handlePlaceSelection("destination", place, refreshedElements.destination),
      onWaypointSelect: (place) => handleWaypointSelection(place, refreshedElements.waypointInput),ㅇㅇ
    });

    // Now check for planner result after Google Maps is initialized
    checkForPlannerResult();
  } catch (error) {
    console.error(error);
    document.getElementById("map").textContent = "지도를 불러오지 못했습니다. API 키를 확인하세요.";
  }
}

function wireEventHandlers({
  form,
  origin,
  destination,
  waypointInput,
  addWaypoint,
  clearButton,
  summaryOutput,
  startNavigation,
  exitNavigation,
  saveTrip,
  copyTrip,
  importTrip,
  importTripInput,
  emergencyReturn,
}) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const originValue = origin.value.trim();
    const destinationValue = destination.value.trim();
    if (!originValue || !destinationValue) return;

    updateState((draft) => {
      draft.origin = draft.origin ?? { label: originValue, address: originValue };
      draft.destination = draft.destination ?? { label: destinationValue, address: destinationValue };
      draft.tripMeta = null;
      resetNavigationDraft(draft);
    });

    calculateRoute();
  });

  addWaypoint.addEventListener("click", () => {
    const value = waypointInput.value.trim();
    if (!value) return;

    updateState((draft) => {
      draft.waypoints = [...draft.waypoints, { label: value, address: value, location: null }];
      resetNavigationDraft(draft);
    });

    waypointInput.value = "";
  });

  waypointInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addWaypoint.click();
    }
  });

  clearButton.addEventListener("click", () => {
    resetState();
    resetReturnDeadlineAlerts();
    origin.value = "";
    destination.value = "";
    waypointInput.value = "";
    clearRoute();
    updateUserLocation(null);
    lastHighlightedSegment = null;
    setViewMode("planning");
  });

  summaryOutput.addEventListener("click", (event) => {
    const button = event.target.closest("[data-summary-highlight]");
    if (!button) return;
    const index = Number(button.dataset.summaryHighlight);
    if (Number.isFinite(index)) {
      highlightSegment(index, { focus: true });
      lastHighlightedSegment = index;
    }
  });

  startNavigation.addEventListener("click", () => {
    const now = Date.now();
    updateState((draft) => {
      draft.navigation.active = true;
      draft.navigation.startedAt = now;
      draft.navigation.currentPosition = null;
      draft.navigation.lastUpdatedAt = null;
      draft.navigation.error = null;
    });
    setViewMode("navigation");
    showToast({ message: "내비게이션을 시작합니다." });
  });

  exitNavigation.addEventListener("click", () => {
    updateState((draft) => {
      draft.navigation.active = false;
      draft.navigation.currentPosition = null;
      draft.navigation.lastUpdatedAt = null;
    });
    setViewMode("planning");
    showToast({ message: "내비게이션을 종료했습니다." });
  });

  saveTrip.addEventListener("click", handleSaveTrip);
  copyTrip.addEventListener("click", handleCopyTrip);

  // 공항 복귀 버튼 이벤트 추가
  if (emergencyReturn) {
    emergencyReturn.addEventListener("click", async () => {
      try {
        const state = getState();
        const routeData = await calculateAirportReturnRoute(state);
        showAirportReturnModal(routeData, state);
      } catch (error) {
        console.error('공항 복귀 경로 계산 실패:', error);
        showToast({ 
          message: '공항 복귀 경로를 계산할 수 없습니다. 현재 위치와 여행 정보를 확인해주세요.', 
          type: 'error' 
        });
      }
    });
  }

  importTrip.addEventListener("click", () => {
    importTripInput?.click();
  });

  importTripInput.addEventListener("change", handleImportTrip);
}

async function syncUi({
  waypointList,
  summaryOutput,
  origin,
  destination,
  startNavigation,
  exitNavigation,
  saveTrip,
  copyTrip,
  importTrip,
  emergencyReturn,
  navigationStatus,
  navigationOverlay,
}, latestState, progress) {
  if (latestState.origin?.address) {
    origin.value = latestState.origin.address;
  }
  if (latestState.destination?.address) {
    destination.value = latestState.destination.address;
  }

  // waypoints 또는 tripMeta가 변경된 경우에만 renderWaypoints 호출
  const waypointsChanged = JSON.stringify(latestState.waypoints) !== JSON.stringify(lastWaypointsState);
  const tripMetaChanged = JSON.stringify(latestState.tripMeta) !== JSON.stringify(lastTripMetaState);
  
  if (waypointsChanged || tripMetaChanged) {
    await renderWaypoints(
      waypointList,
      latestState.waypoints,
      {
        onRemove: (index) =>
          updateState((draft) => {
            draft.waypoints = draft.waypoints.filter((_, i) => i !== index);
            resetNavigationDraft(draft);
            setViewMode("planning");
          }),
        onMoveUp: (index) =>
          updateState((draft) => {
            if (index === 0) return;
            const next = [...draft.waypoints];
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
            draft.waypoints = next;
            resetNavigationDraft(draft);
            setViewMode("planning");
          }),
        onMoveDown: (index) =>
          updateState((draft) => {
            const { waypoints } = draft;
            if (index === waypoints.length - 1) return;
            const next = [...waypoints];
            [next[index], next[index + 1]] = [next[index + 1], next[index]];
            draft.waypoints = next;
            resetNavigationDraft(draft);
            setViewMode("planning");
          }),
        onShowDetails: (waypoint, poiInfo) => handleWaypointDetails(waypoint, poiInfo),
        onUpdateStayTime: (index, newStayMinutes) => {
          updateState((draft) => {
            const waypoint = draft.waypoints[index];
            if (waypoint) {
              waypoint.stayMinutes = newStayMinutes;
              resetNavigationDraft(draft);
              setViewMode("planning");
              
              // 토스트 메시지 표시
              const label = waypoint.label ?? waypoint.address ?? `경유지 ${index + 1}`;
              showToast({
                message: `${label} 체류 시간을 ${newStayMinutes}분으로 변경했습니다.`,
                type: "success",
              });
            }
          });
        }
      },
      latestState.tripMeta  // ✅ 네 번째 매개변수로 tripMeta 전달
    );
    
    // 현재 상태를 저장
    lastWaypointsState = JSON.parse(JSON.stringify(latestState.waypoints));
    lastTripMetaState = JSON.parse(JSON.stringify(latestState.tripMeta));
  }

  const hasRoute = Boolean(latestState.routePlan);
  startNavigation.disabled = !hasRoute;
  saveTrip.disabled = !hasRoute;
  copyTrip.disabled = !hasRoute;
  importTrip.disabled = false;

  startNavigation.textContent = latestState.navigation.active ? "내비게이션 진행 중" : "내비게이션 시작";
  exitNavigation.hidden = !latestState.navigation.active;
  
  // 공항 복귀 버튼 표시 로직 (네비게이션 활성화 시에만 표시)
  if (emergencyReturn) {
    emergencyReturn.hidden = !latestState.navigation.active;
  }

  document.body.classList.toggle("navigation-active", latestState.navigation.active);
  updateNavigationOverlay(navigationOverlay, latestState, progress);

  // PC용 네비게이션 종료 버튼 관리
  updateNavigationExitButton(latestState.navigation.active);

  await renderNavigationStatus(navigationStatus, latestState.navigation, latestState.routePlan, progress);
  renderSummary(summaryOutput, latestState.routePlan, progress?.closestSegmentIndex ?? null, latestState.tripMeta);
}

async function calculateRoute() {
  const current = getState();
  const stops = buildStopList(current);
  if (!googleMaps || stops.length < 2) return;

  try {
    const segments = [];
    for (let i = 0; i < stops.length - 1; i += 1) {
      const origin = extractDirectionsInput(stops[i]);
      const destination = extractDirectionsInput(stops[i + 1]);
      if (!origin || !destination) {
        throw new Error("경로 계산에 필요한 위치 정보가 부족합니다.");
      }

      const segmentResult = await requestDirections({
        google: googleMaps,
        origin,
        destination,
      });
      segments.push(segmentResult);
    }

    const colors = getRouteColors(segments.length);
    const labeledStops = stops.map((stop, index) => ({
      ...stop,
      markerLabel: markerLabelForIndex(index, stops.length),
    }));

    renderRoute(googleMaps, { segments, stops: labeledStops, colors });
    lastHighlightedSegment = null;

    updateState((draft) => {
      draft.routePlan = buildRoutePlan({ segments, stops: labeledStops, colors });
    });
  } catch (error) {
    console.error(error);
    alert("경로를 불러오지 못했습니다. 다시 시도해주세요.");
  }
}

function manageNavigationTracking(state) {
  if (state.navigation.active) {
    if (!stopNavigationTracking) {
      stopNavigationTracking = beginNavigationTracking({
        onPosition: (position) => {
          updateState((draft) => {
            draft.navigation.currentPosition = position;
            draft.navigation.lastUpdatedAt = Date.now();
            draft.navigation.error = null;
          });
          updateUserLocation(position, { centerMap: true });
        },
        onError: (error) => {
          console.error(error);
          updateState((draft) => {
            draft.navigation.error = error.message;
            draft.navigation.active = false;
          });
          showToast({ message: "위치 정보를 가져올 수 없습니다.", type: "warning" });
        },
      });
    }
  } else {
    if (stopNavigationTracking) {
      stopNavigationTracking();
      stopNavigationTracking = null;
    }
    updateUserLocation(null);
    if (state.navigation.currentPosition || state.navigation.lastUpdatedAt) {
      updateState((draft) => {
        draft.navigation.currentPosition = null;
        draft.navigation.lastUpdatedAt = null;
      });
    }
  }
}

function applyNavigationHighlight(state, progress) {
  if (!state.routePlan || !state.routePlan.segments?.length) return;

  if (state.navigation.active && progress) {
    if (progress.closestSegmentIndex !== lastHighlightedSegment) {
      highlightSegment(progress.closestSegmentIndex, { focus: false });
      lastHighlightedSegment = progress.closestSegmentIndex;
    }
  }
}

function maybeAnnounceNextStep(state, progress) {
  if (!state.navigation.active || !progress || !state.routePlan?.segments) return;

  const now = Date.now();
  if (now - lastToastTimestamp < TOAST_COOLDOWN_MS) return;

  const segment = state.routePlan.segments[progress.closestSegmentIndex];
  const leg = segment?.legs?.[progress.closestLegIndex];
  if (!leg) return;

  const distance = progress.distanceToLegMeters ?? 0;
  if (distance > TOAST_DISTANCE_THRESHOLD_METERS) return;

  const message = `다음 안내: ${leg.modeLabel}${leg.details ? ` · ${leg.details}` : ""}`;
  showToast({ message });
  lastToastTimestamp = now;
}

async function maybeNotifyReturnDeadline(state, progress = null) {
  // 새로운 실시간 공항 복귀 시스템 사용
  try {
    const returnInfo = await calculateRealTimeReturnInfo(state, progress);
    if (!returnInfo) return;

    const alertMessage = generateAirportReturnMessage(returnInfo);
    
    // 긴급 모드 활성화
    if (returnInfo.shouldActivateEmergencyMode && !returnDeadlineWarningNotified) {
      activateEmergencyMode(returnInfo, state);
      returnDeadlineWarningNotified = true;
      returnDeadlineMissedNotified = true;
      returnEtaCriticalNotified = true;
      returnEtaWarningNotified = true;
      return;
    }
    
    // 점진적 알림 표시
    if (returnInfo.shouldShowAlert && alertMessage.urgency !== 'low') {
      const toastType = alertMessage.urgency === 'critical' ? 'error' : 
                       alertMessage.urgency === 'high' ? 'warning' : 'info';
      showToast({ 
        message: alertMessage.message, 
        type: toastType 
      });
    }
  } catch (error) {
    console.warn('실시간 공항 복귀 알림 실패, 기존 시스템 사용:', error);
    
    // Fallback: 기존 긴급 상황 감지 시스템 사용
    const emergencySituation = detectEmergencySituation(state, progress);
    
    if (!emergencySituation) return;
    
    const { emergencyLevel, shouldActivateEmergencyMode, actualSlackMinutes } = emergencySituation;
    
    // 긴급 모드 활성화가 필요한 경우
    if (shouldActivateEmergencyMode && !returnDeadlineWarningNotified) {
      activateEmergencyMode(emergencySituation, state);
      returnDeadlineWarningNotified = true;
      returnDeadlineMissedNotified = true;
      returnEtaCriticalNotified = true;
      returnEtaWarningNotified = true;
      return;
    }
    
    // 기존 알림 시스템과 통합
    if (emergencyLevel === 'WARNING' && !returnEtaWarningNotified) {
      const message = `⏰ 주의! 공항 복귀까지 ${actualSlackMinutes}분 여유가 있습니다. 이동 준비를 시작하세요.`;
      showToast({ message, type: 'warning' });
      returnEtaWarningNotified = true;
      returnDeadlineWarningNotified = true;
    }
  }
}
function stopReturnDeadlineTimer() {
  if (returnDeadlineTimerId != null) {
    clearInterval(returnDeadlineTimerId);
    returnDeadlineTimerId = null;
  }
}

function updateReturnDeadlineTimer(state) {
  const hasDeadline = Boolean(state?.tripMeta?.exploreWindow?.end);
  if (hasDeadline) {
    if (returnDeadlineTimerId == null) {
      returnDeadlineTimerId = window.setInterval(() => {
        const snapshot = getState();
        const progressSnapshot = computeProgress(snapshot);
        maybeNotifyReturnDeadline(snapshot, progressSnapshot);
      }, RETURN_DEADLINE_TIMER_INTERVAL_MS);
    }
  } else {
    stopReturnDeadlineTimer();
  }
}

function handleSaveTrip() {
  const snapshot = buildTripSnapshot(getState());
  if (!snapshot) {
    showToast({ message: "저장할 경로가 없습니다.", type: "warning" });
    return;
  }

  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = URL.createObjectURL(blob);
  link.download = `trip-${timestamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  showToast({ message: "일정 JSON 파일로 저장했어요.", type: "success" });
}

async function handleCopyTrip() {
  const snapshot = buildTripSnapshot(getState());
  if (!snapshot) {
    showToast({ message: "복사할 경로가 없습니다.", type: "warning" });
    return;
  }

  const text = buildShareText(snapshot);
  try {
    await navigator.clipboard.writeText(text);
    showToast({ message: "경로 요약을 클립보드에 복사했습니다.", type: "success" });
  } catch (error) {
    console.error(error);
    showToast({ message: "클립보드 복사에 실패했습니다.", type: "warning" });
  }
}

async function handleImportTrip(event) {
  const input = event.target;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const snapshot = parseTripSnapshot(text);
    if (!snapshot) {
      showToast({ message: "일정 파일을 해석할 수 없습니다.", type: "warning" });
      return;
    }

    updateState((draft) => {
      draft.origin = snapshot.origin;
      draft.destination = snapshot.destination;
      draft.waypoints = snapshot.waypoints ?? [];
      draft.tripMeta = snapshot.tripMeta ?? null;
      draft.routePlan = null;
      resetNavigationDraft(draft);
    });

    setViewMode("planning");

    if (!googleMaps) {
      showToast({ message: "지도 로딩 이후에 다시 시도해주세요.", type: "warning" });
      return;
    }

    await calculateRoute();
    showToast({ message: "저장된 일정을 불러왔어요.", type: "success" });
  } catch (error) {
    console.error(error);
    showToast({ message: "일정 파일을 불러오지 못했습니다.", type: "warning" });
  }
}

function computeProgress(state) {
  if (!state.routePlan || !state.navigation.currentPosition) return null;
  return calculateNavigationProgress(state.routePlan, state.navigation.currentPosition);
}

function resetNavigationDraft(draft) {
  draft.navigation.active = false;
  draft.navigation.startedAt = null;
  draft.navigation.currentPosition = null;
  draft.navigation.lastUpdatedAt = null;
  draft.navigation.error = null;
  lastToastTimestamp = 0;
  resetReturnDeadlineAlerts();
}

function setViewMode(view) {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  layout.dataset.view = view;
}

function markerLabelForIndex(index, total) {
  if (index === 0) return "출발";
  if (index === total - 1) return "도착";
  return `경유 ${index}`;
}

function buildStopList(state) {
  const list = [];
  if (state.origin) list.push(state.origin);
  state.waypoints.forEach((wp) => list.push(wp));
  if (state.destination) list.push(state.destination);
  return list;
}

function extractDirectionsInput(entry) {
  if (!entry) return null;
  if (entry.location) return entry.location;
  if (entry.placeId) return { placeId: entry.placeId };
  return entry.address ?? entry.label ?? null;
}

function handlePlaceSelection(key, place, inputElement) {
  inputElement.value = place.address;
  updateState((draft) => {
    draft[key] = { label: place.name ?? place.address, ...place };
    draft.tripMeta = null;
    resetNavigationDraft(draft);
  });
}

async function handleWaypointSelection(place, inputElement) {
  if (!place) return;
  if (inputElement) {
    inputElement.value = place.address ?? place.name ?? '';
  }

  const fallbackWaypoint = {
    label: place.name ?? place.address ?? '경유지',
    address: place.address ?? place.name ?? '',
    location: place.location ?? null,
    placeId: place.placeId ?? null,
  };
  fallbackWaypoint.stayMinutes ??= 60;

  if (!placesService || !place.placeId) {
    updateState((draft) => {
      draft.waypoints = [...draft.waypoints, fallbackWaypoint];
      draft.tripMeta = null;
      resetNavigationDraft(draft);
    });
    showToast({ message: `${fallbackWaypoint.label}을(를) 추가했습니다.`, type: 'success' });
    if (inputElement) inputElement.value = '';    return;
  }

  try {
    const details = await fetchPlaceDetails(place.placeId);
    const position = toLatLngLiteral(details.geometry?.location) ?? place.location ?? null;
    if (position) {
      showPreviewMarker({ position, label: details.name ?? place.name });
    }

    const currentState = getState();
    const result = await openPlaceModal({ 
      details, 
      defaultStayMinutes: 60,
      tripMeta: currentState.tripMeta,
      waypoints: currentState.waypoints,
      waypointIndex: currentState.waypoints.length
    });
    if (result?.confirmed) {
      const waypoint = buildWaypointFromDetails(details, result.stayMinutes, place);
      updateState((draft) => {
        draft.waypoints = [...draft.waypoints, waypoint];
        resetNavigationDraft(draft);
      });
      showToast({ message: `${waypoint.label}을(를) 일정에 추가했습니다.`, type: 'success' });
    }
  } catch (error) {
    console.error(error);
    showToast({ message: '장소 정보를 가져오지 못했습니다. 다시 시도해주세요.', type: 'warning' });
  } finally {
    clearPreviewMarker();
    if (inputElement) inputElement.value = '';
  }
}


function estimateRemainingTravelMinutes(state, progress) {
  const routePlan = state.routePlan;
  if (!routePlan) return null;

  if (
    progress?.progressRatio != null &&
    Number.isFinite(routePlan.totalDurationSeconds)
  ) {
    const remainingSeconds = Math.max(routePlan.totalDurationSeconds * (1 - progress.progressRatio), 0);
    return remainingSeconds / 60;
  }

  if (!progress && Array.isArray(routePlan.segments) && routePlan.segments.length) {
    const finalSegment = routePlan.segments[routePlan.segments.length - 1];
    if (finalSegment?.legs?.length) {
      const segmentSeconds = finalSegment.legs.reduce(
        (sum, leg) => sum + (leg.durationValue ?? 0),
        0
      );
      if (segmentSeconds > 0) {
        return segmentSeconds / 60;
      }
    }
  }

  if (Number.isFinite(routePlan.totalDurationSeconds)) {
    return routePlan.totalDurationSeconds / 60;
  }

  if (Array.isArray(routePlan.legs) && routePlan.legs.length) {
    const totalSeconds = routePlan.legs.reduce(
      (sum, leg) => sum + (leg.durationValue ?? 0),
      0
    );
    if (totalSeconds > 0) {
      return totalSeconds / 60;
    }
  }

  return null;
}
function resetReturnDeadlineAlerts() {
  returnDeadlineWarningNotified = false;
  returnDeadlineMissedNotified = false;
  returnEtaWarningNotified = false;
  returnEtaCriticalNotified = false;
  stopReturnDeadlineTimer();
}

async function handleWaypointDetails(waypoint, poiInfo) {
  if (!waypoint) return;

  let details = null;
  
  // POI 정보가 있으면 사용, 없으면 기존 방식으로 가져오기
  if (poiInfo) {
    details = {
      name: poiInfo.name || waypoint.label,
      formatted_address: poiInfo.address,
      types: poiInfo.types,
      photos: poiInfo.photos,
      opening_hours: poiInfo.openingHours,
      business_status: poiInfo.businessStatus,
      category: poiInfo.category,
      // 추가 정보는 기존 방식으로 가져오기
      website: null,
      formatted_phone_number: null,
      rating: null,
      user_ratings_total: null,
      reviews: null
    };
    
    // POI 정보가 있으면 추가 상세 정보 가져오기
    if (poiInfo.placeId && placesService) {
      try {
        const additionalDetails = await fetchPlaceDetails(poiInfo.placeId);
        
        if (additionalDetails) {
          details = {
            ...details,
            ...additionalDetails,
            // POI 정보 우선 유지
            name: poiInfo.name || additionalDetails.name,
            formatted_address: poiInfo.address || additionalDetails.formatted_address,
            photos: poiInfo.photos?.length ? [poiInfo.photos[0]] : (additionalDetails.photos?.length ? [additionalDetails.photos[0]] : []),
            opening_hours: poiInfo.openingHours || additionalDetails.opening_hours
          };
        }
      } catch (error) {
        console.warn('❌ 추가 상세 정보 가져오기 실패:', error);
      }
    }
  } else if (waypoint.placeId && placesService) {
    try {
      details = await fetchPlaceDetails(waypoint.placeId);
    } catch (error) {
      console.error('❌ 기존 방식 실패:', error);
    }
  }

  if (!details) {
    details = buildDetailsFromWaypoint(waypoint);
  }

  if (!details) {
    showToast({ message: "경유지 정보를 불러올 수 없습니다.", type: "warning" });
    return;
  }

  const position =
    toLatLngLiteral(details?.geometry?.location) ??
    waypoint.location ??
    null;

  if (position) {
    showPreviewMarker({ position, label: details?.name ?? waypoint.label ?? "경유지" });
  }

  try {
    // 현재 상태에서 tripMeta와 waypoints 정보 가져오기
    const currentState = getState();
    const waypointIndex = currentState.waypoints.findIndex(w => w === waypoint);
    
    const result = await openPlaceModal({
      details,
      defaultStayMinutes: waypoint.stayMinutes ?? 60,
      tripMeta: currentState.tripMeta,
      waypoints: currentState.waypoints,
      waypointIndex: waypointIndex >= 0 ? waypointIndex : 0,
    });

    if (result?.confirmed) {
      let updatedWaypoint = null;
      updateState((draft) => {
        const target = draft.waypoints[index];
        if (!target) return;

        const fallback = { ...target, name: target.label ?? target.address ?? "" };
        const enriched = buildWaypointFromDetails(details, result.stayMinutes, fallback);
        updatedWaypoint = enriched;

        draft.waypoints[index] = {
          ...target,
          ...enriched,
          stayMinutes: enriched.stayMinutes,
        };
        resetNavigationDraft(draft);
      });

      setViewMode("planning");

      try {
        await calculateRoute();
      } catch (error) {
        console.error(error);
      }

      if (updatedWaypoint) {
        const label = updatedWaypoint.label ?? waypoint.label ?? "경유지";
        showToast({
          message: `${label} 체류 시간을 업데이트했어요.`,
          type: "success",
        });
      }
    }
  } finally {
    clearPreviewMarker();
  }
}

function buildDetailsFromWaypoint(waypoint) {
  if (!waypoint) return null;

  const details = {
    place_id: waypoint.placeId ?? null,
    name: waypoint.label ?? waypoint.address ?? "",
    formatted_address: waypoint.address ?? "",
    website: waypoint.website ?? null,
    formatted_phone_number: waypoint.phoneNumber ?? null,
    opening_hours: Array.isArray(waypoint.openingHours) ? { weekday_text: waypoint.openingHours } : null,
    rating: waypoint.rating ?? null,
    user_ratings_total: waypoint.userRatingsTotal ?? null,
    reviews: [],
  };

  const locationStub = createLatLngStub(waypoint.location);
  if (locationStub) {
    details.geometry = { location: locationStub };
  } else {
    details.geometry = null;
  }

  details.photos = [];

  return details;
}

function createLatLngStub(literal) {
  if (!literal || typeof literal.lat !== "number" || typeof literal.lng !== "number") {
    return null;
  }
  return {
    lat: () => literal.lat,
    lng: () => literal.lng,
    toJSON: () => ({ lat: literal.lat, lng: literal.lng }),
  };
}

function assertElements(elements) {
  Object.entries(elements).forEach(([key, value]) => {
    if (!(value instanceof HTMLElement || value instanceof HTMLFormElement)) {
      throw new Error(`${key} 요소를 찾을 수 없습니다.`);
    }
  });
}

function updateNavigationOverlay(overlayElement, state, progress) {
  if (!overlayElement) return;
  const active = state.navigation.active && progress && state.routePlan;
  if (!active) {
    overlayElement.hidden = true;
    overlayElement.innerHTML = "";
    return;
  }

  const segment = state.routePlan.segments?.[progress.closestSegmentIndex];
  const leg = segment?.legs?.[progress.closestLegIndex];
  const percent = Math.round((progress.progressRatio ?? 0) * 100);
  const remainingDistanceText = formatDistance(progress.remainingMeters);
  const remainingSeconds = state.routePlan.totalDurationSeconds
    ? Math.max(state.routePlan.totalDurationSeconds * (1 - (progress.progressRatio ?? 0)), 0)
    : null;

  overlayElement.hidden = false;
  overlayElement.innerHTML = "";

  const card = document.createElement("div");
  card.className = "navigation-overlay__card";

  const progressRow = document.createElement("div");
  progressRow.className = "navigation-overlay__progress";

  const progressMeta = document.createElement("p");
  progressMeta.className = "navigation-overlay__text";
  progressMeta.textContent = `진행률 ${percent}% · 남은 거리 ${remainingDistanceText}`;

  const progressBar = document.createElement("div");
  progressBar.className = "navigation-overlay__progress-bar";
  const progressFill = document.createElement("div");
  progressFill.className = "navigation-overlay__progress-fill";
  progressFill.style.width = `${percent}%`;
  progressBar.append(progressFill);

  progressRow.append(progressMeta, progressBar);
  card.append(progressRow);

  if (remainingSeconds != null) {
    const remainingTime = document.createElement("p");
    remainingTime.className = "navigation-overlay__text";
    remainingTime.textContent = `남은 시간 ${formatDuration(remainingSeconds)}`;
    card.append(remainingTime);
  }

  if (leg) {
    const nextStep = document.createElement("p");
    nextStep.className = "navigation-overlay__text";
    const nextText = leg.details ? `${leg.modeLabel} · ${leg.details}` : leg.modeLabel;
    const distanceHint = progress.distanceToLegMeters != null
      ? ` (${formatDistance(progress.distanceToLegMeters)} 이내)`
      : "";
    nextStep.textContent = `다음 안내: ${nextText}${distanceHint}`;
    card.append(nextStep);
  }

  overlayElement.append(card);
}

function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return "-";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "-";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  }
  return `${minutes}분`;
}

bootstrap();






async function fetchPlaceDetails(placeId) {
  if (!placesService) {
    throw new Error('Places service is not initialized.');
  }
  return new Promise((resolve, reject) => {
    placesService.getDetails(
      {
        placeId,
        language: 'ko',
        fields: [
          'place_id',
          'name',
          'formatted_address',
          'geometry',
          'website',
          'formatted_phone_number',
          'opening_hours',
          'photos',
          'rating',
          'user_ratings_total',
          'reviews',
        ],
      },
      (result, status) => {
        if (status === googleMaps.maps.places.PlacesServiceStatus.OK && result) {
          resolve(result);
        } else {
          reject(new Error(`Failed to load place details: ${status}`));
        }
      }
    );
  });
}

function buildWaypointFromDetails(details, stayMinutes, fallback) {
  const location = toLatLngLiteral(details.geometry?.location) ?? fallback.location ?? null;
  return {
    label: details.name ?? fallback.name ?? fallback.address ?? "경유지",
    address: details.formatted_address ?? fallback.address ?? fallback.name ?? "",
    location,
    placeId: details.place_id ?? fallback.placeId ?? null,
    stayMinutes,
    website: details.website ?? null,
    phoneNumber: details.formatted_phone_number ?? null,
    rating: details.rating ?? null,
    userRatingsTotal: details.user_ratings_total ?? null,
    openingHours: details.opening_hours?.weekday_text ?? null,
  };
}

function toLatLngLiteral(latLng) {
  if (!latLng) return null;
  return latLng.toJSON ? latLng.toJSON() : latLng;
}

// Get country code from location coordinates
function getCountryCodeFromLocation(location) {
  const { lat, lng } = location;
  
  // Major airport locations and their country codes
  const airportRegions = [
    // Korea
    { lat: 37.4602, lng: 126.4407, country: "kr", name: "Incheon" },
    { lat: 37.5583, lng: 126.7906, country: "kr", name: "Gimpo" },
    
    // Singapore
    { lat: 1.3644, lng: 103.9915, country: "sg", name: "Changi" },
    
    // Japan
    { lat: 35.7720, lng: 140.3928, country: "jp", name: "Narita" },
    { lat: 35.5494, lng: 139.7798, country: "jp", name: "Haneda" },
    
    // Thailand
    { lat: 13.6900, lng: 100.7501, country: "th", name: "Suvarnabhumi" },
    
    // Hong Kong
    { lat: 22.3080, lng: 113.9185, country: "hk", name: "Hong Kong" },
    
    // Taiwan
    { lat: 25.0777, lng: 121.2328, country: "tw", name: "Taoyuan" },
    
    // China
    { lat: 31.1434, lng: 121.8052, country: "cn", name: "Pudong" },
    { lat: 31.1979, lng: 121.3363, country: "cn", name: "Hongqiao" },
    
    // Vietnam
    { lat: 10.8185, lng: 106.6520, country: "vn", name: "Tan Son Nhat" },
    
    // Philippines
    { lat: 14.5086, lng: 121.0196, country: "ph", name: "Ninoy Aquino" },
    
    // Malaysia
    { lat: 2.7456, lng: 101.7099, country: "my", name: "Kuala Lumpur" },
    
    // Indonesia
    { lat: -6.1256, lng: 106.6558, country: "id", name: "Soekarno-Hatta" },
    
    // Australia
    { lat: -33.9399, lng: 151.1753, country: "au", name: "Sydney" },
    { lat: -37.6733, lng: 144.8433, country: "au", name: "Melbourne" },
    
    // USA
    { lat: 40.6413, lng: -73.7781, country: "us", name: "JFK" },
    { lat: 40.6895, lng: -74.1745, country: "us", name: "Newark" },
    { lat: 33.9425, lng: -118.4081, country: "us", name: "LAX" },
    
    // Europe
    { lat: 51.4700, lng: -0.4543, country: "gb", name: "Heathrow" },
    { lat: 52.3105, lng: 4.7683, country: "nl", name: "Schiphol" },
    { lat: 48.3538, lng: 11.7861, country: "de", name: "Munich" },
    { lat: 50.0379, lng: 8.5622, country: "de", name: "Frankfurt" },
  ];
  
  // Find closest airport region
  let closestRegion = null;
  let minDistance = Infinity;
  
  for (const region of airportRegions) {
    const distance = Math.sqrt(
      Math.pow(lat - region.lat, 2) + Math.pow(lng - region.lng, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestRegion = region;
    }
  }
  
  // If within reasonable distance (about 50km), use that country
  if (closestRegion && minDistance < 0.5) {
    return closestRegion.country;
  }
  
  // Fallback: determine by coordinates
  if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) return "kr"; // Korea
  if (lat >= 1 && lat <= 2 && lng >= 103 && lng <= 105) return "sg"; // Singapore
  if (lat >= 30 && lat <= 46 && lng >= 129 && lng <= 146) return "jp"; // Japan
  if (lat >= 5 && lat <= 21 && lng >= 97 && lng <= 106) return "th"; // Thailand
  if (lat >= 22 && lat <= 23 && lng >= 113 && lng <= 115) return "hk"; // Hong Kong
  if (lat >= 22 && lat <= 25 && lng >= 120 && lng <= 122) return "tw"; // Taiwan
  if (lat >= 18 && lng >= 73 && lng <= 135) return "cn"; // China (broad)
  
  return "kr"; // Default to Korea
}

function updateNavigationExitButton(isActive) {
  // PC에서만 표시 (모바일은 기존 버튼 사용)
  if (window.innerWidth <= 768) return;
  
  let exitContainer = document.querySelector('.navigation-exit-container');
  
  if (isActive) {
    if (!exitContainer) {
      exitContainer = document.createElement('div');
      exitContainer.className = 'navigation-exit-container';
      
      const exitButton = document.createElement('button');
      exitButton.type = 'button';
      exitButton.className = 'btn';
      exitButton.textContent = '네비게이션 종료';
      exitButton.addEventListener('click', () => {
        updateState((draft) => {
          draft.navigation.active = false;
          draft.navigation.startedAt = null;
          draft.navigation.currentPosition = null;
          draft.navigation.lastUpdatedAt = null;
          draft.navigation.error = null;
        });
        setViewMode("planning");
        showToast({ message: "네비게이션을 종료했습니다.", type: "success" });
      });
      
      exitContainer.append(exitButton);
      document.body.append(exitContainer);
    }
    exitContainer.style.display = 'block';
  } else {
    if (exitContainer) {
      exitContainer.style.display = 'none';
    }
  }
}








