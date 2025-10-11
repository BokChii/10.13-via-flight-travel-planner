// Handles DOM interactions for forms, waypoint list, and user-triggered events.
import { showToast } from './toast.js';

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
  summaryOutput: "#summary-output",
  navigationStatus: "#navigation-status",
  navigationOverlay: "#navigation-overlay",
};

export function getElements() {
  return Object.fromEntries(
    Object.entries(selectors).map(([key, selector]) => [key, document.querySelector(selector)])
  );
}

export function renderWaypoints(listElement, waypoints, { onRemove, onMoveUp, onMoveDown, onShowDetails, onUpdateStayTime } = {}) {
  listElement.innerHTML = "";

  if (!waypoints.length) {
    const empty = document.createElement("li");
    empty.className = "placeholder";
    empty.textContent = "추가된 경유지가 없습니다.";
    listElement.append(empty);
    return;
  }

  waypoints.forEach((entry, index) => {
    const waypoint = typeof entry === "string" ? { label: entry } : entry;
    const item = document.createElement("li");
    item.className = "waypoint-item";

    const info = document.createElement("div");
    info.className = "waypoint-item__info";

    const name = document.createElement("span");
    name.className = "waypoint-item__label";
    name.textContent = waypoint.label ?? waypoint.address ?? `경유지 ${index + 1}`;
    info.append(name);

    if (waypoint?.stayMinutes || waypoint?.address) {
      const meta = document.createElement("span");
      meta.className = "waypoint-item__meta";
      const parts = [];
      if (waypoint?.stayMinutes) parts.push(`체류 ${waypoint.stayMinutes}분`);
      if (waypoint?.address) parts.push(waypoint.address);
      meta.textContent = parts.join(" · ");
      info.append(meta);
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
    detailsButton.addEventListener("click", () => onShowDetails(index));

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
