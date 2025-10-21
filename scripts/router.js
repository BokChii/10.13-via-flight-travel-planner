// Via Flight Router
// 페이지 간 라우팅 및 상태 관리 시스템

class ViaFlightRouter {
  constructor() {
    this.routes = {
      '/': 'landing.html',
      '/landing': 'landing.html',
      '/transfer-info': 'transfer-info.html',
      '/airport-main': 'airport-main.html',
      '/airport-only': 'airport-only.html',
      '/airport-external': 'airport-external.html',
      '/navigation': 'navigation.html'
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
    
    console.log('Via Flight Router 초기화 완료');
  }
  
  detectCurrentPage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop();
    
    this.currentPage = filename || 'landing.html';
    console.log('현재 페이지:', this.currentPage);
  }
  
  restoreState() {
    // 세션 스토리지에서 상태 복원
    const savedState = sessionStorage.getItem('viaFlightState');
    if (savedState) {
      try {
        this.state = { ...this.state, ...JSON.parse(savedState) };
        console.log('상태 복원 완료:', this.state);
      } catch (error) {
        console.error('상태 복원 실패:', error);
      }
    }
  }
  
  saveState() {
    // 현재 상태를 세션 스토리지에 저장
    sessionStorage.setItem('viaFlightState', JSON.stringify(this.state));
    console.log('상태 저장 완료:', this.state);
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
    console.log(`페이지 이동: ${this.currentPage} → ${page}`);
    
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
      console.log('환승 정보 업데이트:', data.transferInfo);
    }
    
    // Airport Main 페이지에서 선택할 때
    if (data.userChoice) {
      console.log('사용자 선택 업데이트:', data.userChoice);
    }
    
    // POI 선택 완료 시
    if (data.selectedPois) {
      console.log('선택된 POI 업데이트:', data.selectedPois);
    }
  }
  
  // 뒤로가기 처리
  goBack() {
    const backRoutes = {
      'transfer-info.html': 'landing.html',
      'airport-main.html': 'transfer-info.html',
      'airport-only.html': 'airport-main.html',
      'airport-external.html': 'airport-main.html',
      'navigation.html': 'landing.html'
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
    this.navigate('/landing');
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
      'navigation.html': ['schedule']
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
  if (!state.transferInfo || state.userChoice !== 'airport-only') {
    console.warn('잘못된 접근입니다. Airport Main 페이지로 이동합니다.');
    window.viaFlightRouter.navigate('/airport-main');
    return;
  }
};

window.initNavigationPage = () => {
  console.log('Navigation Page 초기화');
  const state = window.viaFlightRouter.getState();
  if (!state.schedule) {
    console.warn('일정 정보가 없습니다. 홈으로 이동합니다.');
    window.viaFlightRouter.goHome();
    return;
  }
};

// 페이지 로드 시 자동 초기화
document.addEventListener('DOMContentLoaded', function() {
  const currentPage = window.location.pathname.split('/').pop();
  
  switch (currentPage) {
    case 'landing.html':
      window.initLandingPage();
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
    case 'navigation.html':
      window.initNavigationPage();
      break;
    default:
      console.log('알 수 없는 페이지:', currentPage);
  }
});

export default ViaFlightRouter;
