import { showToast } from './toast.js';
import { loadGoogleMapsSdk } from './api.js';
import { getGoogleMapsApiKey } from './config.js';
import { PLANNER_CONFIG, CATEGORY_STAY_TIMES, LOCATIONS } from './config.js';
import { checkBusinessStatus, createTravelTimeFromTripMeta } from './poiManager.js';

const CATEGORY_CONFIGS = {
  food: {
    key: 'food',
    label: '미식 & 로컬 맛집',
    queries: ['서울 맛집', '서울 인기 음식점', '서울 전통 음식'],
    type: 'restaurant',
    fallbackStayMinutes: CATEGORY_STAY_TIMES.food,
  },
  shopping: {
    key: 'shopping',
    label: '쇼핑 & 기념품',
    queries: ['서울 쇼핑몰', '서울 쇼핑 명소', '서울 기념품 거리'],
    type: 'shopping_mall',
    fallbackStayMinutes: CATEGORY_STAY_TIMES.shopping,
  },
  culture: {
    key: 'culture',
    label: '문화 & 역사',
    queries: ['서울 문화 관광', '서울 역사 명소', '서울 박물관'],
    type: 'tourist_attraction',
    fallbackStayMinutes: CATEGORY_STAY_TIMES.culture,
  },
  nature: {
    key: 'nature',
    label: '자연 & 정원',
    queries: ['서울 공원', '서울 자연 명소', '서울 한강 공원'],
    type: 'park',
    fallbackStayMinutes: CATEGORY_STAY_TIMES.nature,
  },
  view: {
    key: 'view',
    label: '전망 & 야경',
    queries: ['서울 전망대', '서울 야경 명소', '서울 야간 관광'],
    type: 'tourist_attraction',
    fallbackStayMinutes: CATEGORY_STAY_TIMES.view,
  },
};

const AIRPORT_ANCHOR = LOCATIONS.DEFAULT_AIRPORT;

let plannerServices = {
  googleMaps: null,
  placesService: null,
  map: null,
};

let plannerHandlers = {
  onPlanGenerated: null,
  onSkip: null,
};

let plannerElements = null;
let currentStep = 1;
let isGenerating = false;
let defaultGenerateLabel = null;

// Planner-scoped airport anchors and toggle state
let selectedArriveAnchor = null; // { label, address, location, placeId }
let selectedReturnAnchor = null; // same shape
let sameAirportChecked = false;

function setDefaultDateTime() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentHour = now.getHours().toString().padStart(2, '0');
  const currentMinute = Math.floor(now.getMinutes() / 15) * 15; // Round to nearest 15 minutes
  const minuteStr = currentMinute.toString().padStart(2, '0');
  
  // Set default arrival time (today, current time)
  if (plannerElements.arrivalDateInput) {
    plannerElements.arrivalDateInput.value = today;
  }
  if (plannerElements.arrivalHourSelect) {
    plannerElements.arrivalHourSelect.value = currentHour;
  }
  if (plannerElements.arrivalMinuteSelect) {
    plannerElements.arrivalMinuteSelect.value = minuteStr;
  }
  
  // Set default departure time (today + 12 hours)
  const departureTime = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const departureHour = departureTime.getHours().toString().padStart(2, '0');
  const departureMinute = Math.floor(departureTime.getMinutes() / 15) * 15;
  const departureMinuteStr = departureMinute.toString().padStart(2, '0');
  
  if (plannerElements.departureDateInput) {
    plannerElements.departureDateInput.value = today;
  }
  if (plannerElements.departureHourSelect) {
    plannerElements.departureHourSelect.value = departureHour;
  }
  if (plannerElements.departureMinuteSelect) {
    plannerElements.departureMinuteSelect.value = departureMinuteStr;
  }
}

export function initPlannerWizard({ onPlanGenerated, onSkip } = {}) {
  const form = document.getElementById('planner-form');
  if (!form) {
    console.error('Planner form not found');
    return;
  }

  plannerHandlers.onPlanGenerated = typeof onPlanGenerated === 'function' ? onPlanGenerated : null;
  plannerHandlers.onSkip = typeof onSkip === 'function' ? onSkip : null;
  plannerElements = collectPlannerElements(form);
  
  if (!defaultGenerateLabel && plannerElements.generateButton) {
    defaultGenerateLabel = plannerElements.generateButton.textContent || '일정 생성';
  }

  // Planner is now a separate page, no need to ensure visibility
  attachEventListeners();
  updateCategoryLimits();
  setDefaultDateTime(); // Set default date and time values
  goToStep(1, readFormValues());
  updateGenerateAvailability();
  // Ensure planner airport inputs have Autocomplete once UI is ready
  try { initPlannerAutocomplete(); } catch {}
}

export function attachPlannerServices({ googleMaps, placesService, map } = {}) {
  plannerServices = {
    googleMaps: window.google ?? googleMaps ?? plannerServices.googleMaps,
    placesService: placesService ?? plannerServices.placesService,
    map: map ?? plannerServices.map,
  };
  updateGenerateAvailability();
  // SDK ready: wire airport autocompletes
  try { 
    // 자동완성 초기화를 약간 지연시켜 DOM이 완전히 준비되도록 함
    setTimeout(() => {
      initPlannerAutocomplete(); 
      console.log('Planner autocomplete initialized successfully');
    }, 200);
  } catch (error) {
    console.error('Failed to initialize planner autocomplete:', error);
  }
}

// 전역 함수로 노출 (HTML에서 호출하기 위해)
window.attachPlannerServices = attachPlannerServices;
window.initPlannerAutocomplete = initPlannerAutocomplete; // 디버깅용

function collectPlannerElements(form) {
  return {
    form,
    steps: Array.from(document.querySelectorAll('.planner-step')),
    stepIndicators: Array.from(document.querySelectorAll('.planner__step')),
    generateButton: document.querySelector('#planner-generate'),
    arrivalDateInput: document.querySelector('#planner-arrival-date'),
    arrivalHourSelect: document.querySelector('#planner-arrival-hour'),
    arrivalMinuteSelect: document.querySelector('#planner-arrival-minute'),
    departureDateInput: document.querySelector('#planner-departure-date'),
    departureHourSelect: document.querySelector('#planner-departure-hour'),
    departureMinuteSelect: document.querySelector('#planner-departure-minute'),
    entryBufferInput: document.querySelector('#planner-entry-buffer'),
    returnBufferInput: document.querySelector('#planner-return-buffer'),
    defaultStayInput: document.querySelector('#planner-default-stay'),
    categoryInputs: Array.from(document.querySelectorAll('input[name="planner-category"]')),
    airportArriveInput: document.querySelector('#planner-airport-arrive'),
    airportReturnInput: document.querySelector('#planner-airport-return'),
    sameAirportCheckbox: document.querySelector('#planner-same-airport'),
    airportArriveSelect: document.querySelector('#planner-airport-arrive-select'),
    airportReturnSelect: document.querySelector('#planner-airport-return-select'),
  };
}

function attachEventListeners() {
  if (!plannerElements) return;

  // 각 단계별 버튼에 이벤트 리스너 연결
  document.getElementById('planner-next-1')?.addEventListener('click', handleNextStep);
  document.getElementById('planner-next-2')?.addEventListener('click', handleNextStep);
  document.getElementById('planner-prev-2')?.addEventListener('click', handlePreviousStep);
  document.getElementById('planner-prev-3')?.addEventListener('click', handlePreviousStep);
  plannerElements.generateButton?.addEventListener('click', handleGeneratePlan);
  // Backdrop removed - planner is now a separate page
  plannerElements.form?.addEventListener('submit', (event) => event.preventDefault());

  // Clear error states when user interacts with fields
  const clearErrorOnInput = (element) => {
    if (element) {
      element.addEventListener('input', () => {
        const fieldElement = element.closest('.planner-field');
        if (fieldElement) {
          fieldElement.classList.remove('planner-field--error');
        }
      });
      element.addEventListener('change', () => {
        const fieldElement = element.closest('.planner-field');
        if (fieldElement) {
          fieldElement.classList.remove('planner-field--error');
        }
      });
    }
  };

  // Apply error clearing to all form inputs
  clearErrorOnInput(plannerElements.airportArriveSelect);
  clearErrorOnInput(plannerElements.airportReturnSelect);
  clearErrorOnInput(plannerElements.airportArriveInput);
  clearErrorOnInput(plannerElements.airportReturnInput);
  clearErrorOnInput(plannerElements.arrivalDateInput);
  clearErrorOnInput(plannerElements.arrivalHourSelect);
  clearErrorOnInput(plannerElements.arrivalMinuteSelect);
  clearErrorOnInput(plannerElements.departureDateInput);
  clearErrorOnInput(plannerElements.departureHourSelect);
  clearErrorOnInput(plannerElements.departureMinuteSelect);
  clearErrorOnInput(plannerElements.entryBufferInput);
  clearErrorOnInput(plannerElements.returnBufferInput);
  clearErrorOnInput(plannerElements.defaultStayInput);

  plannerElements.categoryInputs.forEach((input) => {
    input.addEventListener('change', () => {
      updateCategoryLimits();
      if (currentStep === 3) {
        updateSummaryPreview(readFormValues());
      }
      updateGenerateAvailability();
      
      // Clear error state for category cards
      const categoryCard = input.closest('.category-card');
      if (categoryCard) {
        categoryCard.classList.remove('category-card--error');
      }
    });
  });

  // Stay time slider and number input synchronization
  const staySlider = document.querySelector('.stay-slider');
  const stayNumber = document.querySelector('.stay-number');
  
  if (staySlider && stayNumber) {
    staySlider.addEventListener('input', () => {
      stayNumber.value = staySlider.value;
      updateGenerateAvailability();
    });
    
    stayNumber.addEventListener('input', () => {
      const value = Math.max(20, Math.min(240, parseInt(stayNumber.value) || 60));
      staySlider.value = value;
      stayNumber.value = value;
      updateGenerateAvailability();
    });
  }

  const timingInputs = [
    plannerElements.arrivalInput,
    plannerElements.departureInput,
    plannerElements.entryBufferInput,
    plannerElements.returnBufferInput,
    plannerElements.defaultStayInput,
  ].filter(Boolean);

  timingInputs.forEach((element) => {
    element.addEventListener('change', () => {
      if (currentStep === 3) {
        updateSummaryPreview(readFormValues());
      }
      updateGenerateAvailability();
    });
  });

  // Same-airport toggle and input sync
  plannerElements.sameAirportCheckbox?.addEventListener('change', () => {
    sameAirportChecked = !!plannerElements.sameAirportCheckbox.checked;
    if (sameAirportChecked && plannerElements.airportReturnInput) {
      plannerElements.airportReturnInput.value = plannerElements.airportArriveInput?.value ?? '';
      selectedReturnAnchor = selectedArriveAnchor ? { ...selectedArriveAnchor } : null;
    }
  });
  plannerElements.airportArriveInput?.addEventListener('input', () => {
    if (sameAirportChecked && plannerElements.airportReturnInput) {
      plannerElements.airportReturnInput.value = plannerElements.airportArriveInput.value;
      selectedReturnAnchor = selectedArriveAnchor ? { ...selectedArriveAnchor } : null;
    }
  });

  // Airport selection mode toggle
  // Airport select change handlers for hybrid UI
  plannerElements.airportArriveSelect?.addEventListener('change', () => {
    const value = plannerElements.airportArriveSelect.value;
    if (value === 'custom') {
      // Show text input, hide select
      plannerElements.airportArriveInput.style.display = '';
      plannerElements.airportArriveSelect.style.display = 'none';
      plannerElements.airportArriveInput.focus();
    } else {
      // Hide text input, show select
      plannerElements.airportArriveInput.style.display = 'none';
      plannerElements.airportArriveSelect.style.display = '';
    }
  });

  plannerElements.airportReturnSelect?.addEventListener('change', () => {
    const value = plannerElements.airportReturnSelect.value;
    if (value === 'custom') {
      // Show text input, hide select
      plannerElements.airportReturnInput.style.display = '';
      plannerElements.airportReturnSelect.style.display = 'none';
      plannerElements.airportReturnInput.focus();
    } else {
      // Hide text input, show select
      plannerElements.airportReturnInput.style.display = 'none';
      plannerElements.airportReturnSelect.style.display = '';
    }
  });

  // Preset selects -> anchors
  const presetMap = {
    ICN: { label: '인천국제공항', address: 'Incheon International Airport', location: { lat: 37.4602, lng: 126.4407 }, placeId: null },
    SIN: { label: '싱가포르 창이국제공항', address: 'Singapore Changi Airport', location: { lat: 1.3644, lng: 103.9915 }, placeId: null },
    HND: { label: '도쿄 하네다공항', address: 'Tokyo Haneda Airport', location: { lat: 35.5494, lng: 139.7798 }, placeId: null },
    NRT: { label: '도쿄 나리타공항', address: 'Narita International Airport', location: { lat: 35.7719, lng: 140.3929 }, placeId: null },
    HKG: { label: '홍콩국제공항', address: 'Hong Kong International Airport', location: { lat: 22.3080, lng: 113.9185 }, placeId: null },
  };

  plannerElements.airportArriveSelect?.addEventListener('change', () => {
    const code = plannerElements.airportArriveSelect.value;
    selectedArriveAnchor = presetMap[code] ? { ...presetMap[code] } : null;
    if (sameAirportChecked) {
      selectedReturnAnchor = selectedArriveAnchor ? { ...selectedArriveAnchor } : null;
      if (plannerElements.airportReturnSelect && code) {
        plannerElements.airportReturnSelect.value = code;
      }
    }
  });

  plannerElements.airportReturnSelect?.addEventListener('change', () => {
    const code = plannerElements.airportReturnSelect.value;
    selectedReturnAnchor = presetMap[code] ? { ...presetMap[code] } : null;
  });
}

// Attach Google Places Autocomplete to airport inputs (all places allowed)
function initPlannerAutocomplete() {
  const g = plannerServices.googleMaps;
  if (!g || !plannerElements) {
    console.warn('Google Maps or planner elements not available:', { g: !!g, plannerElements: !!plannerElements });
    return;
  }

  // Google Maps Places API가 로드되었는지 확인
  if (!g.maps || !g.maps.places) {
    console.warn('Google Maps Places API not loaded yet');
    return;
  }

  console.log('Initializing autocomplete for inputs:', {
    arriveInput: !!plannerElements.airportArriveInput,
    returnInput: !!plannerElements.airportReturnInput
  });

  const attach = (input, onPick) => {
    if (!input) {
      console.warn('Input element not found');
      return;
    }
    
    console.log('Attaching autocomplete to input:', input.id);
    
    const ac = new g.maps.places.Autocomplete(input, {
      fields: ['formatted_address', 'geometry', 'place_id', 'name', 'types'],
      types: ['establishment', 'geocode'], // 모든 장소 타입 허용
    });
    
    ac.addListener('place_changed', () => {
      const p = ac.getPlace();
      console.log('Place selected:', p);
      
      if (!p?.geometry || !p.formatted_address) {
        console.warn('Invalid place selected:', p);
        return;
      }
      
      const place = {
        label: p.name ?? p.formatted_address,
        address: p.formatted_address,
        location: p.geometry.location?.toJSON?.() ?? null,
        placeId: p.place_id ?? null,
      };
      
      console.log('Processed place:', place);
      onPick(place);
    });
  };

  attach(plannerElements.airportArriveInput, (place) => {
    selectedArriveAnchor = place;
    if (sameAirportChecked) {
      selectedReturnAnchor = { ...place };
      if (plannerElements.airportReturnInput) {
        plannerElements.airportReturnInput.value = plannerElements.airportArriveInput?.value ?? '';
      }
    }
  });

  attach(plannerElements.airportReturnInput, (place) => {
    selectedReturnAnchor = place;
  });
}

function handleNextStep() {
  const values = readFormValues();
  
  // 각 단계별 검증 수행
  if (currentStep === 1) {
    if (!validateStep1(values)) {
      return;
    }
    goToStep(2, values);
  } else if (currentStep === 2) {
    if (!validateStep2(values)) {
      return;
    }
    goToStep(3, values);
  } else if (currentStep === 3) {
    // 3단계에서는 생성 버튼이 별도로 처리됨
    return;
  }
}

function handlePreviousStep() {
  goToStep(Math.max(currentStep - 1, 1), readFormValues());
}

function goToStep(step, values) {
  currentStep = step;
  
  // 모든 단계 섹션 숨기기
  plannerElements.steps.forEach((section) => {
    const sectionStep = Number(section.dataset.step ?? '1');
    section.hidden = sectionStep !== step;
  });

  // 스크롤을 최상단으로 이동
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 단계 표시기 업데이트
  updateStepIndicator(step);

  // 3단계에서 요약 미리보기 업데이트
  if (step === 3) {
    updateSummaryPreview(values ?? readFormValues());
  }

  // 생성 버튼 가용성 업데이트
  updateGenerateAvailability();
}

function updateStepIndicator(activeStep) {
  plannerElements.stepIndicators.forEach((indicator) => {
    const stepIndex = Number(indicator.dataset.stepIndex ?? '0');
    const stepIndicator = indicator.querySelector('.step-indicator');
    
    if (stepIndicator) {
      // Remove all state classes
      stepIndicator.classList.remove('active', 'completed');
      
      if (stepIndex === activeStep) {
        stepIndicator.classList.add('active');
        stepIndicator.setAttribute('aria-current', 'step');
      } else if (stepIndex < activeStep) {
        stepIndicator.classList.add('completed');
        stepIndicator.setAttribute('aria-current', 'false');
      } else {
        stepIndicator.setAttribute('aria-current', 'false');
      }
    }
  });
}

function combineDateTime(dateValue, hourValue, minuteValue) {
  if (!dateValue || !hourValue || !minuteValue) {
    return null;
  }
  
  const date = new Date(dateValue);
  date.setHours(parseInt(hourValue, 10));
  date.setMinutes(parseInt(minuteValue, 10));
  date.setSeconds(0);
  date.setMilliseconds(0);
  
  return date;
}

function readFormValues() {
  // Read date and time from separate inputs
  const arrivalDate = plannerElements.arrivalDateInput?.value ?? '';
  const arrivalHour = plannerElements.arrivalHourSelect?.value ?? '';
  const arrivalMinute = plannerElements.arrivalMinuteSelect?.value ?? '';
  const departureDate = plannerElements.departureDateInput?.value ?? '';
  const departureHour = plannerElements.departureHourSelect?.value ?? '';
  const departureMinute = plannerElements.departureMinuteSelect?.value ?? '';
  
  // Combine date and time into Date objects
  const arrival = combineDateTime(arrivalDate, arrivalHour, arrivalMinute);
  const departure = combineDateTime(departureDate, departureHour, departureMinute);
  
  const entryBufferMinutes = parseInt(plannerElements.entryBufferInput?.value ?? '90', 10);
  const returnBufferMinutes = parseInt(plannerElements.returnBufferInput?.value ?? '120', 10);
  const defaultStayMinutes = parseInt(plannerElements.defaultStayInput?.value ?? '60', 10);

  const categories = plannerElements.categoryInputs
    .filter((input) => input.checked)
    .map((input) => input.value);

  return {
    arrivalRaw: `${arrivalDate}T${arrivalHour}:${arrivalMinute}`,
    departureRaw: `${departureDate}T${departureHour}:${departureMinute}`,
    arrival,
    departure,
    entryBufferMinutes: Number.isFinite(entryBufferMinutes) ? entryBufferMinutes : 90,
    returnBufferMinutes: Number.isFinite(returnBufferMinutes) ? returnBufferMinutes : 120,
    defaultStayMinutes: Number.isFinite(defaultStayMinutes) ? defaultStayMinutes : 60,
    categories,
    arriveAnchor: selectedArriveAnchor,
    returnAnchor: selectedReturnAnchor ?? selectedArriveAnchor,
  };
}

function clearFieldErrors() {
  // Clear all error states
  document.querySelectorAll('.planner-field--error').forEach(el => {
    el.classList.remove('planner-field--error');
  });
  document.querySelectorAll('.category-card--error').forEach(el => {
    el.classList.remove('category-card--error');
  });
  document.querySelectorAll('.fieldset--error').forEach(el => {
    el.classList.remove('fieldset--error');
  });
  document.querySelectorAll('.datetime-card--error').forEach(el => {
    el.classList.remove('datetime-card--error');
  });
}

function highlightFieldError(selector, message) {
  const element = document.querySelector(selector);
  if (element) {
    // Find the parent datetime-card, planner-field, or fieldset
    const cardElement = element.closest('.datetime-card');
    const fieldElement = element.closest('.planner-field') || element.closest('.planner-fieldset') || element;
    
    // Add error class to card if it's a datetime field
    if (cardElement) {
      cardElement.classList.add('datetime-card--error');
    }
    
    // Add error class to field
    fieldElement.classList.add('planner-field--error');
    
    // Scroll to the field
    const scrollTarget = cardElement || fieldElement;
    scrollTarget.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center',
      inline: 'nearest'
    });
    
    // Focus the input if it's focusable
    if (element.focus && typeof element.focus === 'function') {
      setTimeout(() => element.focus(), 300);
    }
    
    // Show toast if message provided
    if (message) {
      showToast({ message, type: 'warning' });
    }
    
    return fieldElement;
  }
  return null;
}

function validateStep1(values) {
  clearFieldErrors();
  
  // 공항 검증
  if (!values.arriveAnchor) {
    highlightFieldError('#planner-airport-arrive-select');
    showToast({ message: '도착 공항을 선택해주세요.', type: 'warning' });
    return false;
  }
  
  if (!values.returnAnchor) {
    highlightFieldError('#planner-airport-return-select');
    showToast({ message: '복귀 공항을 선택해주세요.', type: 'warning' });
    return false;
  }
  
  // 시간 검증
  if (!values.arrival || !values.departure) {
    if (!values.arrival) {
      highlightFieldError('#planner-arrival-date');
    } else {
      highlightFieldError('#planner-departure-date');
    }
    showToast({ message: '도착 및 출발 날짜와 시간을 모두 입력해주세요.', type: 'warning' });
    return false;
  }

  if (values.arrival >= values.departure) {
    highlightFieldError('#planner-departure-date');
    showToast({ message: '출발 시각은 도착 시각 이후여야 합니다.', type: 'warning' });
    return false;
  }

  const start = values.arrival.getTime() + values.entryBufferMinutes * 60_000;
  const end = values.departure.getTime() - values.returnBufferMinutes * 60_000;
  if (start >= end) {
    highlightFieldError('#planner-entry-buffer');
    showToast({ message: '체류 가능한 시간이 너무 짧습니다. 버퍼 시간을 조정해주세요.', type: 'warning' });
    return false;
  }

  return true;
}

function validateStep2(values) {
  clearFieldErrors();
  
  if (!values.categories.length) {
    // Highlight the first category card
    const firstCategoryCard = document.querySelector('.category-card');
    if (firstCategoryCard) {
      firstCategoryCard.classList.add('category-card--error');
      firstCategoryCard.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'nearest'
      });
    }
    showToast({ message: '관심 있는 카테고리를 하나 이상 선택해주세요.', type: 'warning' });
    return false;
  }
  
  return true;
}

function updateSummaryPreview(values) {
  // Update airport information
  const arriveAirportEl = document.querySelector('[data-summary-arrive-airport]');
  const returnAirportEl = document.querySelector('[data-summary-return-airport]');
  
  if (arriveAirportEl) {
    arriveAirportEl.textContent = values.arriveAnchor?.label || '-';
  }
  if (returnAirportEl) {
    returnAirportEl.textContent = values.returnAnchor?.label || '-';
  }

  // Update timing information
  const arrivalTimeEl = document.querySelector('[data-summary-arrival-time]');
  const departureTimeEl = document.querySelector('[data-summary-departure-time]');
  const stayDurationEl = document.querySelector('[data-summary-stay-duration]');
  
  if (arrivalTimeEl) {
    arrivalTimeEl.textContent = values.arrival ? formatDateTime(values.arrival) : '-';
  }
  if (departureTimeEl) {
    departureTimeEl.textContent = values.departure ? formatDateTime(values.departure) : '-';
  }
  
  if (stayDurationEl) {
    const start = values.arrival?.getTime()
      ? new Date(values.arrival.getTime() + values.entryBufferMinutes * 60_000)
      : null;
    const end = values.departure?.getTime()
      ? new Date(values.departure.getTime() - values.returnBufferMinutes * 60_000)
      : null;
    const availableMinutes = start && end ? Math.max((end - start) / 60_000, 0) : null;
    
    stayDurationEl.textContent = availableMinutes != null ? formatDurationFromMinutes(availableMinutes) : '-';
  }

  // Update preferences
  const categoriesEl = document.querySelector('[data-summary-categories]');
  const stayTimeEl = document.querySelector('[data-summary-stay-time]');
  
  if (categoriesEl) {
    if (values.categories.length > 0) {
      categoriesEl.innerHTML = '<div class="summary-categories">' +
        values.categories.map((key) => {
          const config = CATEGORY_CONFIGS[key];
          return `<span class="summary-category-tag">${config?.label || key}</span>`;
        }).join('') + '</div>';
    } else {
      categoriesEl.textContent = '선택 없음';
    }
  }
  
  if (stayTimeEl) {
    stayTimeEl.textContent = `${values.defaultStayMinutes}분`;
  }
}

function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '--';
  }
  try {
    return new Intl.DateTimeFormat('ko', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch (error) {
    return date.toLocaleString();
  }
}

function formatDurationFromMinutes(minutes) {
  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remain = totalMinutes % 60;
  if (hours > 0) {
    return remain > 0 ? `${hours}시간 ${remain}분` : `${hours}시간`;
  }
  return `${remain}분`;
}

function handleSkipPlanner() {
  // Skip to main page
  window.location.href = 'navigation.html';
  plannerHandlers.onSkip?.();
}

function ensurePlannerVisible() {
  // Planner is now a separate page, no visibility management needed
}

function hidePlannerOverlay() {
  // Planner is now a separate page, navigate to main page instead
  window.location.href = 'navigation.html';
}

function updateCategoryLimits() {
  if (!plannerElements?.categoryInputs) return;
  const selected = plannerElements.categoryInputs.filter((input) => input.checked);
  const limitReached = selected.length >= PLANNER_CONFIG.MAX_CATEGORY_SELECTION;
  plannerElements.categoryInputs.forEach((input) => {
    if (input.checked) return;
    input.disabled = limitReached;
  });
}

function updateGenerateAvailability() {
  if (!plannerElements?.generateButton) return;
  
  const values = readFormValues();
  const anchorsReady = Boolean(selectedArriveAnchor && (selectedReturnAnchor || sameAirportChecked));
  const categoriesSelected = values.categories.length > 0;
  const readyForGeneration = Boolean(
    plannerServices.placesService && 
    plannerServices.googleMaps && 
    currentStep === 3 && 
    anchorsReady && 
    categoriesSelected
  );
  
  plannerElements.generateButton.disabled = !readyForGeneration || isGenerating;
}

function setGenerateButtonLoading(loading) {
  const button = plannerElements?.generateButton;
  if (!button) return;
  if (loading) {
    if (!defaultGenerateLabel) {
      defaultGenerateLabel = button.textContent || '일정 생성';
    }
    button.textContent = '일정 생성 중...';
    button.classList.add('is-loading');
  } else {
    button.textContent = defaultGenerateLabel ?? '일정 생성';
    button.classList.remove('is-loading');
  }
}

async function handleGeneratePlan() {
  if (!plannerElements?.generateButton || plannerElements.generateButton.disabled) {
    return;
  }

  const values = readFormValues();
  // 모든 단계 검증 수행
  if (!validateStep1(values) || !validateStep2(values)) {
    return;
  }

  if (!plannerServices.placesService || !plannerServices.googleMaps) {
    showToast({
      message: '지금은 일정 생성을 진행할 수 없습니다. 지도가 준비된 뒤 다시 시도해주세요.',
      type: 'warning',
    });
    return;
  }

  try {
    isGenerating = true;
    setGenerateButtonLoading(true);
    updateGenerateAvailability();

    const plan = await createLayoverPlan(values);
    
    // Store plan data in sessionStorage for main page
    sessionStorage.setItem('plannerResult', JSON.stringify(plan));
    
    // Navigate to main page
    window.location.href = 'navigation.html';
    
    plannerHandlers.onPlanGenerated?.(plan);
  } catch (error) {
    console.error(error);
    if (error?.message === 'NO_RECOMMENDATIONS') {
      showToast({ message: '추천할 장소를 찾지 못했습니다. 카테고리를 바꿔 다시 시도해주세요.', type: 'warning' });
    } else {
      showToast({ message: '일정 생성 중 오류가 발생했습니다. 다시 시도해주세요.', type: 'warning' });
    }
  } finally {
    isGenerating = false;
    setGenerateButtonLoading(false);
    updateGenerateAvailability();
  }
}

async function createLayoverPlan(values) {
  const startWindow = new Date(values.arrival.getTime() + values.entryBufferMinutes * 60_000);
  const endWindow = new Date(values.departure.getTime() - values.returnBufferMinutes * 60_000);
  const availableMinutes = Math.max((endWindow.getTime() - startWindow.getTime()) / 60_000, 0);

  const desiredStops = determineStopCount(availableMinutes, values.defaultStayMinutes);
  const categoryOrder = buildCategorySequence(values.categories, desiredStops);
  const usedPlaceIds = new Set();
  const waypoints = [];

  // tripMeta 생성 (영업 상태 확인을 위해)
  const tripMeta = {
    arrival: values.arrival.toISOString(),
    departure: values.departure.toISOString(),
    entryBufferMinutes: values.entryBufferMinutes,
    returnBufferMinutes: values.returnBufferMinutes,
  };

  for (const categoryKey of categoryOrder) {
    if (waypoints.length >= desiredStops) break;
    const place = await fetchPlaceForCategory(categoryKey, usedPlaceIds, values.defaultStayMinutes, tripMeta, waypoints);
    if (place) {
      waypoints.push(place);
      const uniqueId = place.placeId ?? place.address ?? place.label;
      if (uniqueId) {
        usedPlaceIds.add(uniqueId);
      }
    }
  }

  if (!waypoints.length) {
    throw new Error('NO_RECOMMENDATIONS');
  }

  balanceStayMinutes(waypoints, availableMinutes);

  const originAnchor = values.arriveAnchor ?? buildAirportAnchor('도착 공항');
  const returnAnchor = values.returnAnchor ?? values.arriveAnchor ?? buildAirportAnchor('복귀 공항');

  return {
    origin: originAnchor ? { ...originAnchor, label: originAnchor.label || '도착 공항' } : buildAirportAnchor('도착 공항'),
    destination: returnAnchor ? { ...returnAnchor, label: returnAnchor.label || '복귀 공항' } : buildAirportAnchor('복귀 공항'),
    waypoints,
    meta: {
      arrival: values.arrival.toISOString(),
      departure: values.departure.toISOString(),
      entryBufferMinutes: values.entryBufferMinutes,
      returnBufferMinutes: values.returnBufferMinutes,
      exploreWindow: {
        start: startWindow.toISOString(),
        end: endWindow.toISOString(),
        availableMinutes: Math.round(availableMinutes),
      },
      categoriesUsed: waypoints.map((wp) => wp.categoryKey),
      cityText: originAnchor?.address ?? originAnchor?.label ?? null,
    },
  };
}

function determineStopCount(availableMinutes, userDefaultStay) {
  const baselineStay = clamp(Number.isFinite(userDefaultStay) ? userDefaultStay : 60, 40, 120);
  if (availableMinutes <= 0) {
    return 1;
  }
  const roughCount = Math.max(1, Math.round(availableMinutes / (baselineStay + 30)));
  return clamp(roughCount, 1, PLANNER_CONFIG.MAX_RECOMMENDED_STOPS);
}

function buildCategorySequence(selectedKeys, desiredStops) {
  const base = Array.isArray(selectedKeys) && selectedKeys.length
    ? selectedKeys.slice(0, PLANNER_CONFIG.MAX_RECOMMENDED_STOPS)
    : PLANNER_CONFIG.DEFAULT_CATEGORY_PRESET.slice(0, PLANNER_CONFIG.MAX_RECOMMENDED_STOPS);
  const sequence = [];
  const pool = [...base, ...PLANNER_CONFIG.DEFAULT_CATEGORY_PRESET, ...Object.keys(CATEGORY_CONFIGS)];
  pool.forEach((key) => {
    if (CATEGORY_CONFIGS[key] && !sequence.includes(key)) {
      sequence.push(key);
    }
  });
  const minNeeded = Math.min(Math.max(desiredStops, 1) + 2, sequence.length);
  return sequence.slice(0, minNeeded);
}

async function fetchPlaceForCategory(categoryKey, usedIds, userDefaultStay, tripMeta = null, waypoints = []) {
  const config = CATEGORY_CONFIGS[categoryKey];
  if (!config) return null;

  // 1) NearbySearch by type around selected airport center
  try {
    const near = await executeNearbySearch({ type: config.type });
    const picked = pickCandidate(near, usedIds, tripMeta, waypoints);
    if (picked) return normalizePlaceResult(picked, config, userDefaultStay);
  } catch (e) {
    console.warn('[planner] nearbySearch failed', categoryKey, e);
  }

  // 2) TextSearch fallback using anchor label + category label
  const anchorLabel = selectedArriveAnchor?.label ?? selectedArriveAnchor?.address ?? '';
  const query = anchorLabel ? `${anchorLabel} ${config.label}` : config.label;
  try {
    const results = await executeTextSearch({ query, type: config.type });
    const picked = pickCandidate(results, usedIds, tripMeta, waypoints);
    if (picked) return normalizePlaceResult(picked, config, userDefaultStay);
  } catch (e) {
    console.warn('[planner] textSearch failed', categoryKey, query, e);
  }

  return null;
}

function executeTextSearch({ query, type }) {
  const { googleMaps, placesService } = plannerServices;
  if (!googleMaps || !placesService) {
    return Promise.resolve([]);
  }

  const center = getSearchCenter();
  const request = {
    query,
    language: 'ko',
    region: 'kr',
    location: new window.google.maps.LatLng(center.lat, center.lng),
    radius: PLANNER_CONFIG.DEFAULT_SEARCH_RADIUS_METERS,
  };
  if (type) {
    request.type = type;
  }

  return new Promise((resolve, reject) => {
    placesService.textSearch(request, (results, status) => {
      const statusEnum = window.google.maps.places.PlacesServiceStatus;
      if (status === statusEnum.OK || status === statusEnum.ZERO_RESULTS) {
        resolve(results ?? []);
      } else {
        reject(new Error(status));
      }
    });
  });
}

function executeNearbySearch({ type }) {
  const { googleMaps, placesService } = plannerServices;
  if (!googleMaps || !placesService) {
    return Promise.resolve([]);
  }

  const center = getSearchCenter();
  const request = {
    location: new window.google.maps.LatLng(center.lat, center.lng),
    radius: PLANNER_CONFIG.DEFAULT_SEARCH_RADIUS_METERS,
  };
  if (type) {
    request.type = type; // use string as required by Places NearbySearch
  }

  return new Promise((resolve, reject) => {
    placesService.nearbySearch(request, (results, status) => {
      const statusEnum = window.google.maps.places.PlacesServiceStatus;
      if (status === statusEnum.OK || status === statusEnum.ZERO_RESULTS) {
        resolve(results ?? []);
      } else {
        reject(new Error(status));
      }
    });
  });
}

function getSearchCenter() {
  if (selectedArriveAnchor?.location) return selectedArriveAnchor.location;
  const mapCenter = plannerServices.map?.getCenter?.();
  if (mapCenter) {
    return { lat: mapCenter.lat(), lng: mapCenter.lng() };
  }
  return LOCATIONS.DEFAULT_CITY_CENTER;
}

function pickCandidate(results, usedIds, tripMeta = null, waypoints = []) {
  if (!Array.isArray(results)) return null;
  
  console.log('🔍 [PLANNER DEBUG] pickCandidate 호출됨');
  console.log('📊 [PLANNER DEBUG] tripMeta:', tripMeta);
  console.log('📍 [PLANNER DEBUG] waypoints.length:', waypoints.length);
  console.log('📋 [PLANNER DEBUG] results.length:', results.length);
  
  // 영업 상태 확인을 위한 travelTime 계산
  const travelTime = tripMeta 
    ? createTravelTimeFromTripMeta(tripMeta, waypoints, waypoints.length, 60)
    : null;
  
  console.log('🕐 [PLANNER DEBUG] 계산된 travelTime:', travelTime);
  
  const filtered = results.filter((item) => {
    const identifier = item.place_id ?? item.formatted_address ?? item.name;
    if (!identifier) return false;
    if (usedIds.has(identifier)) return false;
    if (item.business_status === 'CLOSED_TEMPORARILY') return false;
    
    // 영업 상태 확인 (travelTime이 있을 때만)
    if (travelTime) {
      console.log(`🔍 [PLANNER DEBUG] ${item.name} 영업 상태 확인 중...`);
      console.log('📋 [PLANNER DEBUG] item.opening_hours:', item.opening_hours);
      
      const businessStatus = checkBusinessStatus(item, travelTime);
      console.log(`📊 [PLANNER DEBUG] ${item.name} 결과:`, businessStatus);
      
      if (businessStatus.status === 'CLOSED') {
        console.log(`🚫 [PLANNER] ${item.name} - 영업 종료로 제외됨`);
        return false;
      }
    }
    
    return true;
  });

  console.log(`✅ [PLANNER DEBUG] 필터링 후 남은 POI 수: ${filtered.length}`);
  filtered.sort((a, b) => computePlaceScore(b) - computePlaceScore(a));
  return filtered[0] ?? null;
}

function computePlaceScore(place) {
  const rating = place.rating ?? 0;
  const reviews = Math.min(place.user_ratings_total ?? 0, 3000);
  return rating * 10 + reviews / 200;
}

function normalizePlaceResult(place, config, userDefaultStay) {
  const location = place.geometry?.location?.toJSON?.() ?? place.geometry?.location ?? null;
  return {
    label: place.name ?? config.label ?? '추천 장소',
    address: place.formatted_address ?? place.vicinity ?? '',
    location,
    placeId: place.place_id ?? null,
    stayMinutes: determineStayMinutes(userDefaultStay, config.fallbackStayMinutes),
    rating: place.rating ?? null,
    userRatingsTotal: place.user_ratings_total ?? null,
    categoryKey: config.key,
    categoryLabel: config.label,
  };
}

function determineStayMinutes(userDefaultStay, fallback) {
  const candidate = Number.isFinite(userDefaultStay) && userDefaultStay > 0
    ? userDefaultStay
    : fallback ?? 60;
  return clamp(Math.round(candidate), PLANNER_CONFIG.MIN_STAY_MINUTES, PLANNER_CONFIG.MAX_STAY_MINUTES);
}

function balanceStayMinutes(waypoints, availableMinutes) {
  if (!Number.isFinite(availableMinutes) || availableMinutes <= 0) return;
  const totalPlanned = waypoints.reduce((sum, wp) => sum + (wp.stayMinutes ?? 0), 0);
  if (totalPlanned <= 0 || totalPlanned <= availableMinutes) return;
  const scale = availableMinutes / totalPlanned;
  waypoints.forEach((wp) => {
    const adjusted = clamp(Math.round((wp.stayMinutes ?? PLANNER_CONFIG.MIN_STAY_MINUTES) * scale), PLANNER_CONFIG.MIN_STAY_MINUTES, PLANNER_CONFIG.MAX_STAY_MINUTES);
    wp.stayMinutes = adjusted;
  });
}

function buildAirportAnchor(label) {
  return {
    label,
    address: AIRPORT_ANCHOR.address,
    location: AIRPORT_ANCHOR.location,
    placeId: AIRPORT_ANCHOR.placeId,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Auto-initialize when DOM is ready (only on planner page)
document.addEventListener('DOMContentLoaded', async () => {
  const form = document.querySelector('#planner-form');
  
  if (form) {
    try {
      // Google Maps API 로드
      const apiKey = getGoogleMapsApiKey();
      if (!apiKey) {
        console.error('Google Maps API 키가 설정되지 않았습니다.');
        return;
      }

      const googleMaps = await loadGoogleMapsSdk({
        apiKey,
        libraries: ['places']
      });

      // Places Service 초기화 (googleMaps는 window.google 객체)
      const placesService = new window.google.maps.places.PlacesService(document.createElement('div'));
      
      // planner.js의 attachPlannerServices 함수 호출
      attachPlannerServices({
        googleMaps: window.google.maps,
        placesService,
        map: null // planner에서는 지도가 필요 없음
      });

      // Only initialize on index.html page (planner)
      initPlannerWizard({
        onPlanGenerated: (plan) => {
          // Store plan data and navigate to main page
          sessionStorage.setItem('plannerResult', JSON.stringify(plan));
          window.location.href = 'navigation.html';
        },
        onSkip: () => {
          // Navigate to main page without plan
          window.location.href = 'navigation.html';
        }
      });
    } catch (error) {
      console.error('Google Maps API 로드 실패:', error);
      showToast('Google Maps API를 로드할 수 없습니다. 페이지를 새로고침해주세요.', 'error');
    }
  }
  // On navigation.html, do nothing (no planner form exists)
});

