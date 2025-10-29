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
  if (!modalEl) {
    console.error('❌ initPlaceModal: place-modal 요소를 찾을 수 없습니다. navigation.html에 모달이 있는지 확인하세요.');
    return;
  }

  console.log('✅ place-modal 요소 찾음:', modalEl);
  
  closeBtn = modalEl.querySelector("[data-modal-close]");
  cancelBtn = modalEl.querySelector("[data-modal-cancel]");
  confirmBtn = modalEl.querySelector("[data-modal-confirm]");
  stayInput = modalEl.querySelector("[data-stay-input]");
  photoEl = modalEl.querySelector("[data-modal-photo]");
  reviewsEl = modalEl.querySelector("[data-modal-reviews]");
  const backdrop = modalEl.querySelector(".modal__backdrop");

  // 필수 요소 확인
  const titleEl = modalEl.querySelector("[data-modal-title]");
  
  // 디버깅: 찾은 요소들 확인
  console.log('✅ 모달 요소 초기화:', {
    titleEl: !!titleEl,
    closeBtn: !!closeBtn,
    cancelBtn: !!cancelBtn,
    confirmBtn: !!confirmBtn,
    stayInput: !!stayInput,
    photoEl: !!photoEl,
    reviewsEl: !!reviewsEl,
    backdrop: !!backdrop
  });

  // 필수 요소 확인
  if (!titleEl) {
    console.error('❌ [data-modal-title] 요소를 찾을 수 없습니다.');
  }

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

export async function openPlaceModal({ details, defaultStayMinutes = 60, tripMeta = null, waypoints = [], waypointIndex = 0 }) {
  if (!modalEl) {
    initPlaceModal();
  }
  
  if (!modalEl) {
    console.error('❌ place-modal 요소를 찾을 수 없습니다. navigation.html에 모달이 있는지 확인하세요.');
    return Promise.resolve({ confirmed: false });
  }

  // 모달 요소들이 있는지 확인
  const titleEl = modalEl.querySelector("[data-modal-title]");
  if (!titleEl) {
    console.error('❌ 모달 요소 [data-modal-title]를 찾을 수 없습니다. navigation.html의 모달 구조를 확인하세요.');
    console.log('현재 modalEl:', modalEl);
    console.log('modalEl.innerHTML (일부):', modalEl.innerHTML?.substring(0, 200));
    return Promise.resolve({ confirmed: false });
  }

  await fillModalContent(details, defaultStayMinutes, tripMeta, waypoints, waypointIndex);
  
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

async function fillModalContent(details = {}, defaultStayMinutes, tripMeta = null, waypoints = [], waypointIndex = 0) {
  if (!modalEl) {
    console.error('❌ fillModalContent: modalEl이 없습니다.');
    return;
  }

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

  // 모달 요소들이 있는지 확인하며 설정
  const titleEl = modalEl.querySelector("[data-modal-title]");
  if (titleEl) {
    titleEl.textContent = name ?? "장소 정보";
  } else {
    console.error('❌ [data-modal-title] 요소를 찾을 수 없습니다.');
  }

  const addressEl = modalEl.querySelector("[data-modal-address]");
  if (addressEl) {
    addressEl.textContent = formatted_address ?? "주소 정보가 없습니다.";
  } else {
    console.error('❌ [data-modal-address] 요소를 찾을 수 없습니다.');
  }

  const websiteLink = modalEl.querySelector("[data-modal-website]");
  if (websiteLink) {
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
  } else {
    console.warn('⚠️ [data-modal-website] 요소를 찾을 수 없습니다.');
  }

  const phoneSpan = modalEl.querySelector("[data-modal-phone]");
  if (phoneSpan) {
    const phoneRow = phoneSpan.parentElement;
    if (formatted_phone_number) {
      phoneSpan.textContent = formatted_phone_number;
      phoneRow.hidden = false;
    } else {
      phoneSpan.textContent = "";
      phoneRow.hidden = true;
    }
  } else {
    console.warn('⚠️ [data-modal-phone] 요소를 찾을 수 없습니다.');
  }

  const hoursList = modalEl.querySelector("[data-modal-hours]");
  if (hoursList) {
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
  } else {
    console.warn('⚠️ [data-modal-hours] 요소를 찾을 수 없습니다.');
  }

  if (stayInput) {
    stayInput.value = defaultStayMinutes;
  } else {
    console.error('❌ [data-stay-input] 요소를 찾을 수 없습니다.');
  }

  // 영업 상태 표시 추가
  const businessStatusElement = modalEl.querySelector("[data-modal-business-status]");
  if (!businessStatusElement) {
    console.error('❌ [data-modal-business-status] 요소를 찾을 수 없습니다.');
  }
  if (businessStatusElement) {
    // 실제 여행 시간 기반으로 계산 (tripMeta가 있으면 사용, 없으면 현재 시간 사용)
    const travelTime = tripMeta 
      ? await createTravelTimeFromTripMeta(tripMeta, waypoints, waypointIndex, defaultStayMinutes)
      : createCurrentTravelTimeInfo(defaultStayMinutes);
    
    const businessStatus = checkBusinessStatus(details, travelTime);
    
    businessStatusElement.innerHTML = `${businessStatus.icon} ${businessStatus.label}`;
    businessStatusElement.title = `영업 상태: ${businessStatus.label}`;
    
    // 상태에 따른 스타일 적용
    if (businessStatus.status === 'OPEN') {
      businessStatusElement.style.color = '#4caf50';
      businessStatusElement.style.fontWeight = '600';
    } else if (businessStatus.status === 'CLOSED') {
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
  if (ratingSpan) {
    const ratingRow = ratingSpan.parentElement;
    if (rating) {
      ratingSpan.textContent = `${rating.toFixed(1)}점 (${user_ratings_total ?? 0}명)`;
      ratingRow.hidden = false;
    } else {
      ratingSpan.textContent = "";
      ratingRow.hidden = true;
    }
  } else {
    console.warn('⚠️ [data-modal-rating] 요소를 찾을 수 없습니다.');
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
