// scripts/supabaseClient.js
// Supabase 클라이언트 초기화 및 헬퍼 함수

/**
 * Supabase 클라이언트 생성
 * CDN 방식으로 Supabase JS 라이브러리 로드
 */
let supabaseClient = null;
let isSupabaseLoading = false;

/**
 * Supabase JS 라이브러리 로드
 */
async function loadSupabaseSDK() {
  return new Promise((resolve, reject) => {
    // 이미 로드되어 있는지 확인
    if (window.supabase) {
      resolve();
      return;
    }

    // CDN에서 Supabase JS 로드
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
    script.type = 'module';
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Supabase SDK 로드 실패'));
    };
    document.head.appendChild(script);
  });
}

/**
 * 환경 변수에서 Supabase 설정 가져오기
 */
function getSupabaseConfig() {
  // HTML meta 태그에서 읽기 (빌드 시 주입됨)
  const urlMeta = document.querySelector('meta[name="supabase-url"]');
  const keyMeta = document.querySelector('meta[name="supabase-anon-key"]');
  
  const url = urlMeta?.getAttribute('content') || 
              window.SUPABASE_URL || 
              'https://qghwyrdxxlsigtputuyj.supabase.co';
  
  const anonKey = keyMeta?.getAttribute('content') || 
                  window.SUPABASE_ANON_KEY || 
                  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnaHd5cmR4eGxzaWd0cHV0dXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MjIyNzIsImV4cCI6MjA3OTA5ODI3Mn0.8Ia_UCE-HYjZy2XX0VYEAKY2zGaN1QlvcTUlPPK8mxY';
  
  return { url, anonKey };
}

/**
 * Supabase 클라이언트 초기화
 */
export async function initSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (isSupabaseLoading) {
    // 이미 로딩 중이면 대기
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (supabaseClient) {
          clearInterval(checkInterval);
          resolve(supabaseClient);
        }
      }, 100);
    });
  }

  isSupabaseLoading = true;

  try {
    // Supabase SDK 로드
    await loadSupabaseSDK();
    
    // 동적 import로 createClient 가져오기
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    
    // 설정 가져오기
    const { url, anonKey } = getSupabaseConfig();
    
    // 클라이언트 생성
    supabaseClient = createClient(url, anonKey);
    
    console.log('✅ Supabase 클라이언트 초기화 완료');
    return supabaseClient;
  } catch (error) {
    console.error('❌ Supabase 초기화 실패:', error);
    throw error;
  } finally {
    isSupabaseLoading = false;
  }
}

/**
 * Supabase 클라이언트 인스턴스 가져오기
 */
export async function getSupabase() {
  if (!supabaseClient) {
    await initSupabase();
  }
  return supabaseClient;
}

/**
 * Auth0 사용자 ID를 Supabase 프로필과 매핑
 * @param {string} auth0UserId - Auth0 사용자 ID
 * @returns {Promise<UUID>} Supabase 프로필 ID
 */
export async function getSupabaseUserId(auth0UserId) {
  if (!auth0UserId) {
    throw new Error('Auth0 사용자 ID가 필요합니다.');
  }

  const supabase = await getSupabase();
  
  // 기존 프로필 조회
  const { data: existingProfile, error: selectError } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth0_id', auth0UserId)
    .single();
  
  // 프로필이 있으면 반환
  if (existingProfile && !selectError) {
    return existingProfile.id;
  }
  
  // 프로필이 없으면 생성
  const { data: newProfile, error: insertError } = await supabase
    .from('profiles')
    .insert({ auth0_id: auth0UserId })
    .select('id')
    .single();
  
  if (insertError) {
    console.error('프로필 생성 실패:', insertError);
    throw insertError;
  }
  
  console.log('✅ 새 프로필 생성됨:', newProfile.id);
  return newProfile.id;
}

/**
 * Auth0 사용자 정보로 Supabase 세션 설정
 * RLS 정책을 위해 현재 사용자 컨텍스트 설정
 * @param {string} auth0UserId - Auth0 사용자 ID
 */
export async function setSupabaseUserContext(auth0UserId) {
  if (!auth0UserId) {
    return;
  }

  const supabase = await getSupabase();
  
  // Supabase는 기본적으로 자체 인증을 사용하지만,
  // Auth0를 사용하는 경우 RLS 정책에서 사용할 수 있도록
  // PostgreSQL 세션 변수에 Auth0 사용자 ID 설정
  // 이는 Edge Function이나 Database Function을 통해 처리해야 함
  
  // 임시 해결책: RLS 정책을 수정하여 직접 auth0_id 비교
  // (이 부분은 나중에 개선 필요)
}

// 전역으로 노출 (디버깅용)
window.getSupabase = getSupabase;
window.getSupabaseUserId = getSupabaseUserId;
window.initSupabase = initSupabase;

/**
 * Supabase 연결 테스트 함수
 */
export async function testSupabaseConnection() {
  try {
    console.log('🔍 Supabase 연결 테스트 시작...');
    
    const supabase = await initSupabase();
    
    // 간단한 쿼리 테스트 (profiles 테이블 조회)
    const { data, error, count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase 연결 실패:', error);
      return { success: false, error };
    }
    
    console.log('✅ Supabase 연결 성공!');
    console.log('📊 프로필 개수:', count || 0);
    return { success: true, count: count || 0 };
  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    return { success: false, error };
  }
}

// 전역으로 노출
window.testSupabaseConnection = testSupabaseConnection;

export default {
  initSupabase,
  getSupabase,
  getSupabaseUserId,
  setSupabaseUserContext
};