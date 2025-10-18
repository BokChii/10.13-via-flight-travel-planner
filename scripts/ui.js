﻿// Handles DOM interactions for forms, waypoint list, and user-triggered events.
import { showToast } from './toast.js';
import { 
  getPOIInfo, 
  searchPOIByName, 
  getCategoryInfo, 
  checkBusinessStatus,
  createCurrentTravelTimeInfo,
  createTravelTimeFromTripMeta 
} from './poiManager.js';

const selectors = {
  form: "#route-form",
  origin: "#origin-input",
  destination: "#destination-input",
  waypointInput: "#waypoint-input",
  waypointList: "#waypoint-list",
  addWaypoint: "#add-waypoint",
  clearButton: "#clear-route",
  startNavigation: "#start-navigation",
  exitNavigation: "#exit-navigation",
  saveTrip: "#save-trip",
  copyTrip: "#copy-trip",
  importTrip: "#import-trip",
  importTripInput: "#import-trip-input",
  emergencyReturn: "#emergency-return",
  summaryOutput: "#summary-output",
  navigationStatus: "#navigation-status",
  navigationOverlay: "#navigation-overlay",
};

export function getElements() {
  return Object.fromEntries(
    Object.entries(selectors).map(([key, selector]) => [key, document.querySelector(selector)])
  );
}

/**
 * 영업 종료인 경유지들을 감지합니다
 * @param {Array} waypoints - 경유지 목록
 * @param {Object} tripMeta - 여행 메타데이터
 * @returns {Array} 영업 종료인 경유지 목록
 */
export async function hasClosedWaypoints(waypoints, tripMeta) {
  // 모든 경유지에 대해 POI 정보를 병렬로 가져오기
  const waypointPromises = waypoints.map(async (waypoint, index) => {
    let poiInfo = null;
    if (waypoint.placeId) {
      poiInfo = await getPOIInfo(waypoint.placeId);
    } else if (waypoint.label) {
      poiInfo = await searchPOIByName(waypoint.label);
    }
    
    if (poiInfo) {
      // 실제 여행 시간 기반으로 계산
      const travelTime = tripMeta 
        ? await createTravelTimeFromTripMeta(tripMeta, waypoints, index, waypoint?.stayMinutes || 60)
        : createCurrentTravelTimeInfo(waypoint?.stayMinutes || 60);
      
      const businessStatus = checkBusinessStatus(poiInfo, travelTime);
      
      if (businessStatus.status === 'CLOSED') {
        return {
          index,
          name: waypoint.label || waypoint.address || `경유지 ${index + 1}`,
          businessStatus,
          poiInfo
        };
      }
    }
    
    return null;
  });
  
  const results = await Promise.all(waypointPromises);
  return results.filter(result => result !== null);
}

export async function renderWaypoints(listElement, waypoints, { onRemove, onMoveUp, onMoveDown, onShowDetails, onUpdateStayTime } = {}, tripMeta = null) {
  listElement.innerHTML = "";

  if (!waypoints.length) {
    const empty = document.createElement("li");
    empty.className = "placeholder";
    empty.textContent = "추가된 경유지가 없습니다.";
    listElement.append(empty);
    return;
  }

  // 모든 경유지에 대해 POI 정보를 병렬로 가져오기
  const waypointPromises = waypoints.map(async (entry, index) => {
    const waypoint = typeof entry === "string" ? { label: entry } : entry;
    
    // POI 정보 가져오기
    let poiInfo = null;
    if (waypoint.placeId) {
      poiInfo = await getPOIInfo(waypoint.placeId);
    } else if (waypoint.label) {
      poiInfo = await searchPOIByName(waypoint.label);
    }
    
    // 영업 상태 계산을 위한 travelTime 정보도 미리 계산
    let travelTime = null;
    if (poiInfo) {
      travelTime = tripMeta 
        ? await createTravelTimeFromTripMeta(tripMeta, waypoints, index, waypoint?.stayMinutes || 60)
        : createCurrentTravelTimeInfo(waypoint?.stayMinutes || 60);
    }
    
    return { waypoint, poiInfo, travelTime, index };
  });

  const waypointData = await Promise.all(waypointPromises);

  waypointData.forEach(({ waypoint, poiInfo, travelTime, index }) => {
    const item = document.createElement("li");
    item.className = "waypoint-item";

    const info = document.createElement("div");
    info.className = "waypoint-item__info";

    // 카테고리 아이콘과 라벨 추가
    const categoryInfo = poiInfo?.category || getCategoryInfo('default');
    const categoryIcon = document.createElement("span");
    categoryIcon.className = "waypoint-item__category";
    categoryIcon.textContent = categoryInfo.icon;
    categoryIcon.title = categoryInfo.label;

    const name = document.createElement("span");
    name.className = "waypoint-item__label";
    name.textContent = waypoint.label ?? waypoint.address ?? `경유지 ${index + 1}`;
    
    info.append(categoryIcon, name);

    if (waypoint?.stayMinutes || poiInfo?.address || waypoint?.address) {
      const meta = document.createElement("span");
      meta.className = "waypoint-item__meta";
      const parts = [];
      if (waypoint?.stayMinutes) parts.push(`체류 ${waypoint.stayMinutes}분`);
      if (poiInfo?.address) parts.push(poiInfo.address);
      else if (waypoint?.address) parts.push(waypoint.address);
      meta.textContent = parts.join(" · ");
      info.append(meta);
    }

    // 영업 상태 표시 추가
    if (poiInfo && travelTime) {
      const businessStatus = checkBusinessStatus(poiInfo, travelTime);
      
      const statusElement = document.createElement("span");
      statusElement.className = "waypoint-item__status";
      statusElement.innerHTML = `${businessStatus.icon} ${businessStatus.label}`;
      statusElement.title = `영업 상태: ${businessStatus.label}`;
      
      // 상태에 따른 스타일 적용
      if (businessStatus.status === 'OPEN') {
        statusElement.style.color = '#4caf50';
        statusElement.style.fontWeight = '600';
      } else if (businessStatus.status === 'CLOSED') {
        statusElement.style.color = '#f44336';
        statusElement.style.fontWeight = '600';
      } else {
        statusElement.style.color = '#9e9e9e';
      }
      
      info.append(statusElement);
    }

    // 체류 시간 수정 기능 추가 (컴팩트하게)
    const stayTimeContainer = document.createElement("div");
    stayTimeContainer.className = "waypoint-item__stay-time";
    
    const stayTimeInput = document.createElement("input");
    stayTimeInput.type = "number";
    stayTimeInput.className = "waypoint-item__stay-input";
    stayTimeInput.value = waypoint.stayMinutes || 60;
    stayTimeInput.min = "10";
    stayTimeInput.max = "600";
    stayTimeInput.step = "5";
    stayTimeInput.placeholder = "분";
    stayTimeInput.title = "체류 시간 (분)";
    stayTimeInput.addEventListener("change", (e) => {
      const newStayMinutes = parseInt(e.target.value);
      if (newStayMinutes >= 10 && newStayMinutes <= 600) {
        onUpdateStayTime?.(index, newStayMinutes);
      } else {
        e.target.value = waypoint.stayMinutes || 60;
        showToast({ message: "체류 시간은 10분에서 600분 사이로 설정해주세요.", type: "warning" });
      }
    });
    
    stayTimeContainer.append(stayTimeInput);
    info.append(stayTimeContainer);

    // 버튼들을 아래에 가로로 배치
    const actions = document.createElement("div");
    actions.className = "waypoint-item__actions";

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "btn btn--ghost btn--small";
    detailsButton.textContent = "상세";
    detailsButton.addEventListener("click", () => onShowDetails?.(waypoint, poiInfo));

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "btn btn--ghost btn--small";
    upButton.textContent = "▲";
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => onMoveUp(index));

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "btn btn--ghost btn--small";
    downButton.textContent = "▼";
    downButton.disabled = index === waypoints.length - 1;
    downButton.addEventListener("click", () => onMoveDown(index));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn--ghost btn--small";
    removeButton.textContent = "삭제";
    removeButton.addEventListener("click", () => onRemove(index));

    actions.append(detailsButton, upButton, downButton, removeButton);
    item.append(info, actions);
    listElement.append(item);
  });
}
