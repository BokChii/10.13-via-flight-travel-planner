// scripts/auth.js
// Auth0 인증 관리 모듈 (Google 계정 전용)

import { auth0Config } from './auth0-config.js';

let auth0Client = null;
let isLoading = false;
let user = null;

/**
 * Auth0 SDK 로드 (CDN 사용)
 */
async function loadAuth0SDK() {
  return new Promise((resolve, reject) => {
    // 이미 로드되어 있는지 확인
    if (typeof window.createAuth0Client !== 'undefined') {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js';
    script.async = true;
    script.onload = () => {
      // CDN에서 로드된 경우
      if (typeof window.createAuth0Client === 'undefined') {
        // auth0 객체에서 가져오기 시도
        if (window.auth0 && window.auth0.createAuth0Client) {
          window.createAuth0Client = window.auth0.createAuth0Client;
          resolve();
        } else {
          reject(new Error('Auth0 SDK를 로드할 수 없습니다.'));
        }
        return;
      }
      resolve();
    };
    script.onerror = () => reject(new Error('Auth0 SDK 로드 실패'));
    document.head.appendChild(script);
  });
}

/**
 * Auth0 클라이언트 초기화
 */
export async function initAuth() {
  if (isLoading) {
    return;
  }

  isLoading = true;

  try {
    // CDN 사용 시 SDK 로드
    if (typeof window.createAuth0Client === 'undefined') {
      await loadAuth0SDK();
    }

    // createAuth0Client 함수 가져오기
    const createAuth0Client = window.createAuth0Client || window.auth0?.createAuth0Client;
    
    if (!createAuth0Client) {
      throw new Error('createAuth0Client 함수를 찾을 수 없습니다.');
    }

    // Auth0 클라이언트 생성
    auth0Client = await createAuth0Client(auth0Config);

    // 콜백 처리 (리디렉트 후 복귀 시)
    const query = window.location.search;
    if (query.includes('code=') && query.includes('state=')) {
      await auth0Client.handleRedirectCallback();
      // URL 정리
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 사용자 정보 확인
    user = await auth0Client.getUser();

    // 인증 상태 확인
    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated && user) {
      updateAuthUI(user);
      handleAuthStateChange(user);
    } else {
      updateAuthUI(null);
    }

    console.log('Auth0 초기화 완료', { isAuthenticated, user });
    return true;
  } catch (error) {
    console.error('Auth0 초기화 실패:', error);
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Google 로그인
 */
export async function loginWithGoogle() {
  try {
    // auth0Client가 없거나 초기화 중이면 초기화 대기
    if (!auth0Client) {
      await initAuth();
    }
    
    // 초기화 후에도 null이면 에러
    if (!auth0Client) {
      throw new Error('Auth0 클라이언트를 초기화할 수 없습니다.');
    }

    // Google 연결을 사용하여 로그인
    // connection 이름은 Auth0 대시보드에서 확인하세요
    // Authentication → Social → Google에서 연결 이름 확인
    await auth0Client.loginWithRedirect({
      authorizationParams: {
        connection: 'google-oauth2' // Google 연결 이름 (Auth0에서 확인 필요)
      }
    });
  } catch (error) {
    console.error('Google 로그인 실패:', error);
    console.error('에러 상세:', error.message || error);
    
    // 사용자에게 친화적인 에러 메시지 표시
    alert('로그인 중 오류가 발생했습니다.\n\n확인 사항:\n1. Auth0 설정에서 Callback URL이 올바르게 설정되었는지 확인하세요\n2. Google 연결이 활성화되어 있는지 확인하세요\n3. 브라우저 콘솔을 확인하세요');
    throw error;
  }
}

/**
 * 로그아웃
 */
export async function logout() {
  try {
    if (auth0Client) {
      await auth0Client.logout({
        logoutParams: {
          returnTo: window.location.origin
        }
      });
    }
    user = null;
    updateAuthUI(null);
    handleAuthStateChange(null);
  } catch (error) {
    console.error('로그아웃 실패:', error);
  }
}

/**
 * 현재 사용자 정보 가져오기
 */
export async function getCurrentUser() {
  try {
    if (!auth0Client) {
      await initAuth();
    }
    
    // 초기화 후에도 null이면 null 반환
    if (!auth0Client) {
      return null;
    }
    
    if (!user) {
      user = await auth0Client.getUser();
    }
    
    return user;
  } catch (error) {
    console.error('사용자 정보 가져오기 실패:', error);
    return null;
  }
}

/**
 * 인증 상태 확인
 */
export async function isAuthenticated() {
  try {
    if (!auth0Client) {
      await initAuth();
    }
    
    // 초기화 후에도 null이면 false 반환
    if (!auth0Client) {
      return false;
    }
    
    return await auth0Client.isAuthenticated();
  } catch (error) {
    console.warn('인증 상태 확인 실패:', error);
    return false;
  }
}

/**
 * 사용자 ID 가져오기
 */
export async function getUserId() {
  const currentUser = await getCurrentUser();
  return currentUser?.sub || null; // Auth0의 sub는 사용자 고유 ID
}

/**
 * 사용자 이메일 가져오기
 */
export async function getUserEmail() {
  const currentUser = await getCurrentUser();
  return currentUser?.email || null;
}

// 전역 함수로 노출
window.getUserEmail = getUserEmail;

/**
 * 사용자 이름 가져오기
 */
export async function getUserName() {
  const currentUser = await getCurrentUser();
  return currentUser?.name || 
         currentUser?.nickname || 
         currentUser?.email?.split('@')[0] || 
         '사용자';
}

/**
 * 인증 UI 업데이트
 */
async function updateAuthUI(user) {
  const authButtons = document.querySelectorAll('.auth-button');
  const userInfoContainers = document.querySelectorAll('.user-info-container');
  const userInfo = document.querySelectorAll('.user-info');
  const userEmail = document.querySelectorAll('.user-email');
  
  if (user) {
    // 로그인 상태
    authButtons.forEach(btn => {
      if (btn.dataset.action === 'login') {
        btn.style.display = 'none';
      }
      if (btn.dataset.action === 'logout') {
        btn.style.display = 'block';
      }
    });
    
    // 사용자 닉네임 가져오기 (userProfile.js 사용)
    let nickname = null;
    try {
      if (window.getCurrentUserNickname) {
        nickname = await window.getCurrentUserNickname();
      }
    } catch (error) {
      console.warn('닉네임 가져오기 실패, 기본 이름 사용:', error);
    }
    
    const displayName = nickname || await getUserName();
    userInfo.forEach(info => {
      info.textContent = displayName;
      info.style.display = 'block';
    });
    
    const email = await getUserEmail();
    userEmail.forEach(em => {
      em.textContent = email;
      em.style.display = 'block';
    });
    
    // 사용자 정보 컨테이너 표시 및 프로필 이동 이벤트
    userInfoContainers.forEach(container => {
      container.style.display = 'flex';
      // 기존 클릭 이벤트 제거 후 새로 추가
      container.onclick = (e) => {
        e.stopPropagation();
        if (window.navigateTo) {
          window.navigateTo('/profile');
        } else {
          window.location.href = 'profile.html';
        }
      };
    });
  } else {
    // 로그아웃 상태
    authButtons.forEach(btn => {
      if (btn.dataset.action === 'login') {
        btn.style.display = 'block';
      }
      if (btn.dataset.action === 'logout') {
        btn.style.display = 'none';
      }
    });
    
    userInfoContainers.forEach(container => {
      container.style.display = 'none';
    });
    
    userInfo.forEach(info => {
      info.style.display = 'none';
    });
    
    userEmail.forEach(em => {
      em.style.display = 'none';
    });
  }
}

/**
 * 인증 상태 변경 핸들러
 */
async function handleAuthStateChange(user) {
  if (user) {
    const name = await getUserName();
    sessionStorage.setItem('currentUser', JSON.stringify({
      id: user.sub,
      email: user.email,
      name: name
    }));
    
    // Supabase 프로필 동기화 (비동기, 에러가 나도 계속 진행)
    syncAuth0ToSupabase(user).catch(error => {
      console.warn('Supabase 프로필 동기화 실패 (계속 진행):', error);
    });
  } else {
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('supabase_user_id');
  }

  // 커스텀 이벤트 발생
  window.dispatchEvent(new CustomEvent('authStateChanged', {
    detail: { user }
  }));
}

/**
 * Auth0 사용자 정보를 Supabase 프로필과 동기화
 * @param {Object} auth0User - Auth0 사용자 객체
 * @returns {Promise<string|null>} Supabase 프로필 ID (실패 시 null)
 */
async function syncAuth0ToSupabase(auth0User) {
  if (!auth0User || !auth0User.sub) {
    return null;
  }

  try {
    // Supabase 클라이언트 동적 import (순환 참조 방지)
    const { getSupabaseUserId, getSupabase } = await import('./supabaseClient.js');
    
    // Supabase 프로필 ID 가져오기 (없으면 생성)
    const supabaseUserId = await getSupabaseUserId(auth0User.sub);
    
    // 프로필 정보 업데이트 (이메일, 닉네임 등)
    const supabase = await getSupabase();
    const updateData = {
      updated_at: new Date().toISOString()
    };
    
    if (auth0User.email) {
      updateData.email = auth0User.email;
    }
    
    // 닉네임이 있으면 업데이트 (userProfile.js에서 가져온 닉네임)
    try {
      if (window.getCurrentUserNickname) {
        const nickname = await window.getCurrentUserNickname();
        if (nickname) {
          updateData.nickname = nickname;
        }
      }
    } catch (error) {
      // 닉네임 가져오기 실패해도 계속 진행
      console.warn('닉네임 가져오기 실패:', error);
    }
    
    // 프로필 업데이트
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('auth0_id', auth0User.sub);
    
    if (updateError) {
      console.warn('프로필 업데이트 실패:', updateError);
    }
    
    // 세션 스토리지에 Supabase 사용자 ID 저장
    sessionStorage.setItem('supabase_user_id', supabaseUserId);
    
    console.log('✅ Supabase 프로필 동기화 완료:', supabaseUserId);
    return supabaseUserId;
  } catch (error) {
    console.error('❌ Supabase 프로필 동기화 실패:', error);
    return null;
  }
}

/**
 * 보호된 기능 접근 확인
 * @param {string} message - 로그인 필요 시 표시할 메시지
 * @returns {Promise<boolean>} - 인증 여부
 */
export async function requireAuth(message = '이 기능을 사용하려면 로그인이 필요합니다.') {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    // 사용자에게 로그인 안내
    let shouldLogin = false;
    
    if (window.showConfirmModal) {
      shouldLogin = await showConfirmModal({
        message: `${message}\n\nGoogle 계정으로 로그인하시겠습니까?`,
        title: '로그인 필요',
        type: 'info',
        confirmText: '로그인',
        cancelText: '취소'
      });
    } else {
      shouldLogin = confirm(`${message}\n\nGoogle 계정으로 로그인하시겠습니까?`);
    }
    
    if (shouldLogin) {
      await loginWithGoogle();
    }
    return false;
  }
  return true;
}

/**
 * 로그인 필요 기능 실행 (간단한 헬퍼)
 * @param {Function} callback - 로그인 후 실행할 함수
 * @param {string} message - 로그인 필요 메시지
 */
export async function withAuth(callback, message = '이 기능을 사용하려면 로그인이 필요합니다.') {
  const authenticated = await requireAuth(message);
  if (authenticated && callback) {
    return await callback();
  }
  return null;
}

// 전역 함수로 노출
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;
window.getUserId = getUserId;
window.requireAuth = requireAuth;
window.withAuth = withAuth;

