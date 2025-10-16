import { 
  checkBusinessStatus, 
  createCurrentTravelTimeInfo,
  createTravelTimeFromTripMeta 
} from './poiManager.js';

let modalEl;
let closeBtn;
let cancelBtn;
let confirmBtn;
let stayInput;
let photoEl;
let reviewsEl;
let resolveCallback;

export function initPlaceModal() {
  modalEl = document.getElementById("place-modal");
  if (!modalEl) return;

  closeBtn = modalEl.querySelector("[data-modal-close]");
  cancelBtn = modalEl.querySelector("[data-modal-cancel]");
  confirmBtn = modalEl.querySelector("[data-modal-confirm]");
  stayInput = modalEl.querySelector("[data-stay-input]");
  photoEl = modalEl.querySelector("[data-modal-photo]");
  reviewsEl = modalEl.querySelector("[data-modal-reviews]");
  const backdrop = modalEl.querySelector(".modal__backdrop");

  const handleCancel = () => {
    const callback = resolveCallback;
    resolveCallback = null;
    closeModal();
    callback?.({ confirmed: false });
  };

  cancelBtn?.addEventListener("click", handleCancel);
  closeBtn?.addEventListener("click", handleCancel);
  backdrop?.addEventListener("click", handleCancel);
  modalEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      handleCancel();
    }
  });

  confirmBtn?.addEventListener("click", () => {
    const value = parseInt(stayInput.value, 10);
    if (!Number.isFinite(value) || value <= 0) {
      stayInput.classList.add("modal__input--invalid");
      stayInput.focus();
      return;
    }

    stayInput.classList.remove("modal__input--invalid");
    const callback = resolveCallback;
    resolveCallback = null;
    closeModal();
    callback?.({ confirmed: true, stayMinutes: value });
  });
}

export function openPlaceModal({ details, defaultStayMinutes = 60, tripMeta = null, waypoints = [], waypointIndex = 0, businessStatus = null }) {
  if (!modalEl) {
    initPlaceModal();
  }
  
  if (!modalEl) {
    return Promise.resolve({ confirmed: false });
  }

  fillModalContent(details, defaultStayMinutes, tripMeta, waypoints, waypointIndex, businessStatus);
  
  modalEl.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    modalEl.classList.add("modal--visible");
  });

  return new Promise((resolve) => {
    resolveCallback = resolve;
  });
}

function closeModal() {
  if (!modalEl) return;
  modalEl.classList.remove("modal--visible");
  modalEl.hidden = true;
  document.body.style.overflow = "";
  stayInput?.classList.remove("modal__input--invalid");
}

function fillModalContent(details = {}, defaultStayMinutes, tripMeta = null, waypoints = [], waypointIndex = 0, businessStatus = null) {
  const {
    name,
    formatted_address,
    website,
    formatted_phone_number,
    opening_hours,
    photos,
    rating,
    user_ratings_total,
    reviews,
  } = details;

  modalEl.querySelector("[data-modal-title]").textContent = name ?? "장소 정보";
  modalEl.querySelector("[data-modal-address]").textContent = formatted_address ?? "주소 정보가 없습니다.";

  const websiteLink = modalEl.querySelector("[data-modal-website]");
  const websiteRow = websiteLink.parentElement;
  if (website) {
    websiteLink.href = website;
    websiteLink.textContent = website;
    websiteRow.hidden = false;
  } else {
    websiteLink.href = "#";
    websiteLink.textContent = "";
    websiteRow.hidden = true;
  }

  const phoneSpan = modalEl.querySelector("[data-modal-phone]");
  const phoneRow = phoneSpan.parentElement;
  if (formatted_phone_number) {
    phoneSpan.textContent = formatted_phone_number;
    phoneRow.hidden = false;
  } else {
    phoneSpan.textContent = "";
    phoneRow.hidden = true;
  }

  const hoursList = modalEl.querySelector("[data-modal-hours]");
  const hoursSection = hoursList.parentElement;
  hoursList.innerHTML = "";
  if (opening_hours?.weekday_text?.length) {
    opening_hours.weekday_text.forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = entry;
      hoursList.append(li);
    });
    hoursSection.hidden = false;
  } else {
    hoursSection.hidden = true;
  }

  stayInput.value = defaultStayMinutes;

  // 영업 상태 표시 추가
  const businessStatusElement = modalEl.querySelector("[data-modal-business-status]");
  if (businessStatusElement) {
    // 전달받은 businessStatus가 있으면 사용, 없으면 계산
    const finalBusinessStatus = businessStatus || (() => {
      const travelTime = tripMeta 
        ? createTravelTimeFromTripMeta(tripMeta, waypoints, waypointIndex, defaultStayMinutes)
        : createCurrentTravelTimeInfo(defaultStayMinutes);
      return checkBusinessStatus(details, travelTime);
    })();
    
    businessStatusElement.innerHTML = `${finalBusinessStatus.icon} ${finalBusinessStatus.label}`;
    businessStatusElement.title = `영업 상태: ${finalBusinessStatus.label}`;
    
    // 상태에 따른 스타일 적용
    if (finalBusinessStatus.status === 'OPEN') {
      businessStatusElement.style.color = '#4caf50';
      businessStatusElement.style.fontWeight = '600';
    } else if (finalBusinessStatus.status === 'CLOSED') {
      businessStatusElement.style.color = '#f44336';
      businessStatusElement.style.fontWeight = '600';
    } else {
      businessStatusElement.style.color = '#9e9e9e';
    }
    
    businessStatusElement.parentElement.hidden = false;
  }

  const photoWrapper = photoEl?.parentElement;
  
  if (photoEl && photos?.length) {
    try {
      const url = photos[0].getUrl({ maxWidth: 720, maxHeight: 480 });
      photoEl.src = url;
      photoEl.alt = `${name ?? "장소"} 사진`;
      photoWrapper.removeAttribute('hidden'); // hidden 속성 완전 제거
    } catch (error) {
      console.error('❌ 사진 URL 생성 실패:', error);
    }
  } else if (photoEl && details?.geometry?.location) {
    // 사진이 없으면 지도 썸네일 폴백
    const loc = details.geometry.location.toJSON?.() ?? details.geometry.location;
    const { lat, lng } = loc || {};
    if (typeof lat === "number" && typeof lng === "number") {
      const meta = document.querySelector('meta[name="google-maps-api-key"]');
      const key = meta?.content?.trim() ?? "";
      const params = new URLSearchParams({
        key,
        center: `${lat},${lng}`,
        zoom: "16",
        size: "720x360",
        scale: "2",
        maptype: "roadmap",
        markers: `color:red|${lat},${lng}`,
      });
      photoEl.src = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
      photoEl.alt = `${name ?? "장소"} 주변 지도`;
      if (photoWrapper) photoWrapper.hidden = false;
    } else if (photoWrapper) {
      photoWrapper.hidden = true;
      photoEl.src = "";
      photoEl.alt = "";
    }
  } else if (photoWrapper) {
    photoWrapper.hidden = true;
    if (photoEl) {
      photoEl.src = "";
      photoEl.alt = "";
    }
  }

  const ratingSpan = modalEl.querySelector("[data-modal-rating]");
  const ratingRow = ratingSpan.parentElement;
  if (rating) {
    ratingSpan.textContent = `${rating.toFixed(1)}점 (${user_ratings_total ?? 0}명)`;
    ratingRow.hidden = false;
  } else {
    ratingSpan.textContent = "";
    ratingRow.hidden = true;
  }

  if (reviewsEl) {
    reviewsEl.innerHTML = "";
    const reviewsSection = reviewsEl.parentElement;
    if (Array.isArray(reviews) && reviews.length) {
      reviews.slice(0, 5).forEach((review) => {
        const item = document.createElement("article");
        item.className = "modal-review";
        const author = document.createElement("h4");
        author.textContent = `${review.author_name ?? "방문객"} · ${review.rating ?? "?"}점`;
        const text = document.createElement("p");
        text.textContent = review.text ?? "";
        const time = document.createElement("span");
        time.className = "modal-review__time";
        time.textContent = review.relative_time_description ?? "";
        item.append(author, text, time);
        reviewsEl.append(item);
      });
      reviewsSection.hidden = false;
    } else {
      reviewsSection.hidden = true;
    }
  }
}
