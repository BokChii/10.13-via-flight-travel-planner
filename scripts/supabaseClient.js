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
  // 이미 로드되어 있는지 확인
  if (window.supabaseModule) {
    return window.supabaseModule;
  }

  try {
    // 동적 import만 사용 (스크립트 태그 방식 제거)
    const supabaseModule = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    
    // 전역으로 캐시 (다음 호출 시 재사용)
    window.supabaseModule = supabaseModule;
    
    return supabaseModule;
  } catch (error) {
    console.error('Supabase SDK 로드 실패:', error);
    throw new Error('Supabase SDK 로드 실패: ' + error.message);
  }
}

/**
 * 환경 변수에서 Supabase 설정 가져오기
 */
function getSupabaseConfig() {
  // HTML meta 태그에서 읽기 (빌드 시 주입됨)
  const urlMeta = document.querySelector('meta[name="supabase-url"]');
  const keyMeta = document.querySelector('meta[name="supabase-anon-key"]');
  
  const url = urlMeta?.getAttribute('content') || 
              window.SUPABASE_URL;
  
  const anonKey = keyMeta?.getAttribute('content') || 
                  window.SUPABASE_ANON_KEY;
  
  // 유효성 검사
  if (!url || url === 'YOUR_SUPABASE_URL' || !url.startsWith('http')) {
    console.warn('⚠️ Supabase URL이 유효하지 않습니다:', url);
    return { url: null, anonKey: null };
  }
  
  if (!anonKey || anonKey === 'YOUR_SUPABASE_ANON_KEY' || anonKey.length < 20) {
    console.warn('⚠️ Supabase Anon Key가 유효하지 않습니다.');
    return { url: null, anonKey: null };
  }
  
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
        } else if (!isSupabaseLoading) {
          // 로딩 실패 시 null 반환
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);
    });
  }

  isSupabaseLoading = true;

  try {
    // 설정 가져오기 (먼저 검증)
    const { url, anonKey } = getSupabaseConfig();
    
    if (!url || !anonKey) {
      throw new Error('Supabase URL 또는 Anon Key가 설정되지 않았습니다. meta 태그를 확인해주세요.');
    }
    
    // Supabase SDK 로드
    const supabaseModule = await loadSupabaseSDK();
    
    if (!supabaseModule || !supabaseModule.createClient) {
      throw new Error('Supabase SDK에서 createClient를 가져올 수 없습니다.');
    }
    
    // createClient 가져오기
    const { createClient } = supabaseModule;
    
    // 클라이언트 생성
    supabaseClient = createClient(url, anonKey);
    
    console.log('✅ Supabase 클라이언트 초기화 완료');
    return supabaseClient;
  } catch (error) {
    console.error('❌ Supabase 초기화 실패:', error);
    supabaseClient = null;
    isSupabaseLoading = false; // 에러 발생 시 플래그 리셋
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
    try {
      await initSupabase();
    } catch (error) {
      // 초기화 실패 시 null 반환 (앱이 계속 작동하도록)
      console.warn('⚠️ Supabase를 사용할 수 없습니다:', error.message);
      return null;
    }
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
  
  // Supabase가 초기화되지 않은 경우
  if (!supabase) {
    console.warn('⚠️ Supabase가 초기화되지 않았습니다. 프로필 조회를 건너뜁니다.');
    return null;
  }
  
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

/**
 * html2canvas 라이브러리 로드
 */
async function loadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('html2canvas 로드 실패'));
    document.head.appendChild(script);
  });
}

/**
 * Supabase Storage에 파일 업로드
 * @param {string} bucket - 버킷 이름
 * @param {string} path - 파일 경로 (예: 'reviews/user123/review456.jpg')
 * @param {File|Blob} file - 업로드할 파일
 * @returns {Promise<string>} - 공개 URL
 */
export async function uploadToStorage(bucket, path, file) {
  const supabase = await getSupabase();
  
  try {
    // 파일 업로드
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (error) {
      // 버킷이 없는 경우 더 명확한 오류 메시지
      if (error.message && error.message.includes('Bucket not found')) {
        const errorMsg = `Storage 버킷 '${bucket}'이(가) 생성되지 않았습니다. Supabase 대시보드에서 버킷을 생성해주세요. 자세한 내용은 SUPABASE_STORAGE_SETUP.md 파일을 참고하세요.`;
        console.error('Storage 업로드 실패:', errorMsg);
        throw new Error(errorMsg);
      }
      console.error('Storage 업로드 실패:', error);
      throw error;
    }
    
    // 공개 URL 반환
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    
    console.log('✅ 파일 업로드 완료:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Storage 업로드 실패:', error);
    throw error;
  }
}

/**
 * 지도 스크린샷을 Blob으로 변환
 * @param {HTMLElement} mapElement - 지도 DOM 요소
 * @returns {Promise<Blob>} - 이미지 Blob
 */
export async function captureMapScreenshot(mapElement) {
  if (!mapElement) {
    throw new Error('지도 요소를 찾을 수 없습니다.');
  }
  
  // html2canvas 로드
  if (!window.html2canvas) {
    await loadHtml2Canvas();
  }
  
  // 스크린샷 생성
  const canvas = await window.html2canvas(mapElement, {
    backgroundColor: '#ffffff',
    scale: 1,
    logging: false,
    useCORS: true,
    allowTaint: false
  });
  
  // Blob으로 변환
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Blob 변환 실패'));
      }
    }, 'image/png', 0.9);
  });
}

// 전역으로 노출
window.uploadToStorage = uploadToStorage;
window.captureMapScreenshot = captureMapScreenshot;

export default {
  initSupabase,
  getSupabase,
  getSupabaseUserId,
  setSupabaseUserContext,
  uploadToStorage,
  captureMapScreenshot
};