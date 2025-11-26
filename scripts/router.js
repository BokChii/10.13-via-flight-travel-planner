// Via Flight Router
// 페이지 간 라우팅 및 상태 관리 시스템
import { isValidRouterState, safeParseFromStorage } from "./validation.js";

class ViaFlightRouter {
  constructor() {
    this.routes = {
      '/': 'index.html',
      '/landing': 'index.html',
      '/transfer-info': 'transfer-info.html',
      '/airport-main': 'airport-main.html',
      '/airport-only': 'airport-only.html',
      '/airport-external': 'airport-external.html',
      '/trip-summary': 'trip-summary.html',
      '/navigation': 'navigation.html',
      '/review-detail': 'review-detail.html',
      '/profile': 'profile.html'
    };
    
    this.currentPage = null;
    this.state = {
      transferInfo: null,
      userChoice: null,
      preferences: null,
      selectedPois: [],
      schedule: null,
      navigationActive: false
    };
    
    this.init();
  }
  
  init() {
    // 페이지 로드 시 현재 페이지 파악
    this.detectCurrentPage();
    
    // 상태 복원
    this.restoreState();
    
    // 이벤트 리스너 등록
    this.setupEventListeners();
  }
  
  detectCurrentPage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop();
    
    this.currentPage = filename || 'index.html';
  }
  
  restoreState() {
    // 세션 스토리지에서 상태를 안전하게 복원
    const savedState = safeParseFromStorage('viaFlightState', isValidRouterState);
    
    if (savedState) {
      try {
        // 검증된 상태를 병합
        this.state = { ...this.state, ...savedState };
      } catch (error) {
        console.error('상태 복원 실패:', error);
        // 에러 발생 시 기본 상태 유지
        this.state = {
          transferInfo: null,
          userChoice: null,
          preferences: null,
          selectedPois: [],
          schedule: null,
          navigationActive: false
        };
      }
    }
  }
  
  saveState() {
    // 현재 상태를 세션 스토리지에 저장
    sessionStorage.setItem('viaFlightState', JSON.stringify(this.state));
  }
  
  setupEventListeners() {
    // 뒤로가기/앞으로가기 처리
    window.addEventListener('popstate', (event) => {
      this.handlePopState(event);
    });
    
    // 페이지 언로드 시 상태 저장
    window.addEventListener('beforeunload', () => {
      this.saveState();
    });
  }
  
  // 페이지 이동
  navigate(page, data = {}) {
    // 데이터 업데이트
    this.updateState(data);
    
    // 페이지 이동
    if (this.routes[page]) {
      window.location.href = this.routes[page];
    } else {
      window.location.href = page;
    }
  }
  
  // 상태 업데이트
  updateState(data) {
    this.state = { ...this.state, ...data };
    this.saveState();
    
    // 특정 페이지별 추가 처리
    this.handlePageSpecificUpdates(data);
  }
  
  handlePageSpecificUpdates(data) {
    // Transfer Info 페이지에서 이동할 때
    if (data.transferInfo) {
      // 환승 정보 업데이트
    }
    
    // Airport Main 페이지에서 선택할 때
    if (data.userChoice) {
      // 사용자 선택 업데이트
    }
    
    // POI 선택 완료 시
    if (data.selectedPois) {
      // 선택된 POI 업데이트
    }
  }
  
  // 뒤로가기 처리
  goBack() {
    const backRoutes = {
      'transfer-info.html': 'index.html',
      'airport-main.html': 'transfer-info.html',
      'airport-only.html': 'airport-main.html',
      'airport-external.html': 'airport-main.html',
      'trip-summary.html': 'index.html',
      'navigation.html': 'trip-summary.html'
    };
    
    const backPage = backRoutes[this.currentPage];
    if (backPage) {
      this.navigate(backPage);
    } else {
      window.history.back();
    }
  }
  
  // 홈으로 이동
  goHome() {
    this.navigate('/');
  }
  
  // 네비게이션 시작
  startNavigation(scheduleData) {
    this.updateState({
      schedule: scheduleData,
      navigationActive: true
    });
    
    this.navigate('/navigation');
  }
  
  // 네비게이션 종료
  exitNavigation() {
    this.updateState({
      navigationActive: false
    });
    
    this.goHome();
  }
  
  // 상태 가져오기
  getState() {
    return { ...this.state };
  }
  
  // 특정 상태 가져오기
  getStateValue(key) {
    return this.state[key];
  }
  
  // 상태 초기화
  resetState() {
    this.state = {
      transferInfo: null,
      userChoice: null,
      preferences: null,
      selectedPois: [],
      schedule: null,
      navigationActive: false
    };
    
    sessionStorage.removeItem('viaFlightState');
    console.log('상태 초기화 완료');
  }
  
  // 페이지별 유효성 검사
  validatePageAccess(page) {
    const requiredStates = {
      'transfer-info.html': [],
      'airport-main.html': ['transferInfo'],
      'airport-only.html': ['transferInfo', 'userChoice'],
      'airport-external.html': ['transferInfo', 'userChoice'],
      'trip-summary.html': [], // schedule 필수 아님 (sessionStorage에서 직접 로드)
      'navigation.html': [] // schedule 필수 아님 (sessionStorage에서 직접 로드)
    };
    
    const required = requiredStates[page] || [];
    
    for (const stateKey of required) {
      if (!this.state[stateKey]) {
        console.warn(`페이지 접근 불가: ${stateKey} 상태가 필요합니다`);
        return false;
      }
    }
    
    return true;
  }
  
  // URL 파라미터 처리
  getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    
    for (const [key, value] of params) {
      result[key] = value;
    }
    
    return result;
  }
  
  // URL 파라미터 설정
  setUrlParams(params) {
    const url = new URL(window.location);
    
    Object.keys(params).forEach(key => {
      url.searchParams.set(key, params[key]);
    });
    
    window.history.pushState({}, '', url);
  }
  
  // 페이지 전환 애니메이션
  animatePageTransition(direction = 'forward') {
    const body = document.body;
    
    if (direction === 'forward') {
      body.style.transform = 'translateX(-100%)';
      body.style.opacity = '0';
      
      setTimeout(() => {
        body.style.transform = 'translateX(0)';
        body.style.opacity = '1';
      }, 100);
    } else {
      body.style.transform = 'translateX(100%)';
      body.style.opacity = '0';
      
      setTimeout(() => {
        body.style.transform = 'translateX(0)';
        body.style.opacity = '1';
      }, 100);
    }
  }
  
  // 에러 처리
  handleError(error, context) {
    console.error(`라우터 에러 [${context}]:`, error);
    
    // 사용자에게 에러 알림
    if (window.showToast) {
      window.showToast({
        message: '페이지 이동 중 오류가 발생했습니다.',
        type: 'error'
      });
    }
    
    // 홈으로 이동
    this.goHome();
  }
  
  // 디버그 정보 출력
  debug() {
    console.log('=== Via Flight Router Debug ===');
    console.log('현재 페이지:', this.currentPage);
    console.log('현재 상태:', this.state);
    console.log('사용 가능한 라우트:', Object.keys(this.routes));
    console.log('세션 스토리지:', sessionStorage.getItem('viaFlightState'));
    console.log('================================');
  }
}

// 전역 라우터 인스턴스 생성
window.viaFlightRouter = new ViaFlightRouter();

// 편의 함수들
window.navigateTo = (page, data) => window.viaFlightRouter.navigate(page, data);
window.goBack = () => window.viaFlightRouter.goBack();
window.goHome = () => window.viaFlightRouter.goHome();
window.getAppState = () => window.viaFlightRouter.getState();
window.updateAppState = (data) => window.viaFlightRouter.updateState(data);

// 페이지별 초기화 함수들
window.initLandingPage = () => {
  console.log('Landing Page 초기화');
};

window.initTransferInfoPage = () => {
  console.log('Transfer Info Page 초기화');
  const state = window.viaFlightRouter.getState();
  if (state.transferInfo) {
    // 기존 환승 정보가 있으면 폼에 채우기
    console.log('기존 환승 정보 복원:', state.transferInfo);
  }
};

window.initAirportMainPage = () => {
  console.log('Airport Main Page 초기화');
  const state = window.viaFlightRouter.getState();
  if (!state.transferInfo) {
    console.warn('환승 정보가 없습니다. Transfer Info 페이지로 이동합니다.');
    window.viaFlightRouter.navigate('/transfer-info');
    return;
  }
};

window.initAirportOnlyPage = () => {
  console.log('Airport Only Page 초기화');
  const state = window.viaFlightRouter.getState();
  
  // AI로 생성된 일정인 경우 리다이렉트하지 않음
  const aiGenerated = sessionStorage.getItem('aiGeneratedPlan');
  if (aiGenerated === 'true') {
    console.log('AI 생성 일정으로 접근 - 리다이렉트 건너뛰기');
    return;
  }
  
  if (!state.transferInfo || state.userChoice !== 'airport-only') {
    console.warn('잘못된 접근입니다. Airport Main 페이지로 이동합니다.');
    window.viaFlightRouter.navigate('/airport-main');
    return;
  }
};

window.initAirportExternalPage = () => {
  console.log('Airport External Page 초기화');
  const state = window.viaFlightRouter.getState();
  
  // AI로 생성된 일정인 경우 리다이렉트하지 않음
  const aiGenerated = sessionStorage.getItem('aiGeneratedPlan');
  if (aiGenerated === 'true') {
    console.log('AI 생성 일정으로 접근 - 리다이렉트 건너뛰기');
    return;
  }
  
  if (!state.transferInfo || state.userChoice !== 'airport-external') {
    console.warn('잘못된 접근입니다. Airport Main 페이지로 이동합니다.');
    window.viaFlightRouter.navigate('/airport-main');
    return;
  }
};

window.initTripSummaryPage = () => {
  console.log('Trip Summary Page 초기화 - sessionStorage에서 데이터 로드하므로 리다이렉트 없음');
  // sessionStorage에서 직접 로드하므로 router state는 필수가 아님
  // 리다이렉트 제거하여 페이지 정상 표시
};

window.initNavigationPage = () => {
  console.log('Navigation Page 초기화 - sessionStorage에서 데이터 로드하므로 리다이렉트 없음');
  // sessionStorage에서 직접 로드하므로 router state는 필수가 아님
  // 리다이렉트 제거하여 페이지 정상 표시
};

// 페이지 로드 시 자동 초기화
document.addEventListener('DOMContentLoaded', function() {
  let currentPage = window.location.pathname.split('/').pop();
  
  // 빈 문자열이거나 경로만 있는 경우 index.html로 처리
  if (!currentPage || currentPage === '') {
    currentPage = 'index.html';
  }
  
  // .html 확장자가 없는 경우 라우터의 routes 맵에서 찾기
  if (!currentPage.endsWith('.html')) {
    const route = window.viaFlightRouter?.routes[`/${currentPage}`];
    if (route) {
      currentPage = route;
    } else {
      // 기본적으로 .html 추가 시도
      currentPage = `${currentPage}.html`;
    }
  }
  
  switch (currentPage) {
    case 'index.html':
    case 'landing.html': // 호환성을 위해 유지
      window.initLandingPage();
      break;
    case 'profile.html':
      // initProfilePage가 정의될 때까지 대기 (모듈 스크립트 로드 대기)
      if (window.initProfilePage) {
        window.initProfilePage();
      } else {
        // 모듈 스크립트 로드를 기다리기 위해 재시도 (최대 20회, 총 1초)
        let retryCount = 0;
        const maxRetries = 20;
        const checkInitProfilePage = () => {
          if (window.initProfilePage) {
            window.initProfilePage();
          } else if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(checkInitProfilePage, 50);
          } else {
            console.error('initProfilePage 함수를 찾을 수 없습니다. profile.html의 스크립트 로드 순서를 확인하세요.');
          }
        };
        setTimeout(checkInitProfilePage, 50);
      }
      break;
    case 'transfer-info.html':
      window.initTransferInfoPage();
      break;
    case 'airport-main.html':
      window.initAirportMainPage();
      break;
    case 'airport-only.html':
      window.initAirportOnlyPage();
      break;
    case 'airport-external.html':
      window.initAirportExternalPage();
      break;
    case 'trip-summary.html':
      window.initTripSummaryPage();
      break;
    case 'navigation.html':
      window.initNavigationPage();
      break;
    case 'review-detail.html':
      // review-detail.html은 자체 스크립트에서 초기화
      break;
    default:
      console.log('알 수 없는 페이지:', currentPage);
  }
});

export default ViaFlightRouter;
