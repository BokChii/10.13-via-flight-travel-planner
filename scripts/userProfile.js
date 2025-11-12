/**
 * User Profile Management
 * 사용자 프로필 관리 모듈
 * IndexedDB를 사용하여 사용자 정보 저장
 */

const DB_NAME = 'ViaFlightStorage';
const DB_VERSION = 3; // user_schedules 추가로 3으로 업그레이드
const STORE_NAME = 'user_profiles';

// 랜덤 닉네임 생성용 데이터
const ACTIONS = [
  '하품하는', '째려보는', '웃고있는', '졸고있는', '뛰어다니는', '날아다니는',
  '춤추는', '노래하는', '읽고있는', '쓰고있는', '그리는', '먹고있는',
  '마시는', '자고있는', '놀고있는', '공부하는', '운동하는', '걷고있는',
  '달리는', '수영하는', '등산하는', '여행하는', '쇼핑하는', '요리하는'
];

const ANIMALS = [
  '하마', '오소리', '펭귄', '코끼리', '기린', '사자', '호랑이', '곰',
  '팬더', '강아지', '고양이', '토끼', '햄스터', '다람쥐', '여우', '늑대',
  '사슴', '돼지', '소', '양', '염소', '말', '닭', '오리', '거북이',
  '악어', '뱀', '도마뱀', '개구리', '물고기', '새', '올빼미', '독수리'
];

/**
 * 사용자 ID 기반으로 고정 닉네임 생성
 */
function generateNickname(userId) {
  if (!userId) return null;
  
  // userId를 숫자로 변환 (문자열 해시)
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit 정수로 변환
  }
  
  // 양수로 변환
  const positiveHash = Math.abs(hash);
  
  // 동작과 동물 선택
  const actionIndex = positiveHash % ACTIONS.length;
  const animalIndex = (positiveHash >> 8) % ANIMALS.length;
  
  return `${ACTIONS[actionIndex]} ${ANIMALS[animalIndex]}`;
}

/**
 * IndexedDB 초기화
 */
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // 기존 databases store 유지
      if (!db.objectStoreNames.contains('databases')) {
        db.createObjectStore('databases');
      }
      
      // user_profiles store 생성
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
      
      // user_schedules store 생성
      if (!db.objectStoreNames.contains('user_schedules')) {
        const store = db.createObjectStore('user_schedules', { keyPath: 'scheduleId' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * 사용자 프로필 가져오기
 */
export async function getUserProfile(userId) {
  if (!userId) return null;
  
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(userId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const profile = request.result;
        if (profile) {
          resolve(profile);
        } else {
          // 프로필이 없으면 기본 닉네임으로 생성
          const defaultNickname = generateNickname(userId);
          resolve({
            userId,
            nickname: defaultNickname,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('사용자 프로필 가져오기 실패:', error);
    return null;
  }
}

/**
 * 사용자 닉네임 가져오기 (프로필이 없으면 자동 생성)
 */
export async function getUserNickname(userId) {
  if (!userId) return null;
  
  const profile = await getUserProfile(userId);
  return profile?.nickname || generateNickname(userId);
}

/**
 * 사용자 닉네임 업데이트
 */
export async function updateUserNickname(userId, newNickname) {
  if (!userId || !newNickname || newNickname.trim().length === 0) {
    throw new Error('사용자 ID와 닉네임이 필요합니다.');
  }
  
  if (newNickname.trim().length > 20) {
    throw new Error('닉네임은 20자 이하여야 합니다.');
  }
  
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // 기존 프로필 가져오기
    const existingProfile = await getUserProfile(userId);
    
    const profile = {
      userId,
      nickname: newNickname.trim(),
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const request = store.put(profile);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('✅ 사용자 닉네임 업데이트 완료:', profile);
        resolve(profile);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('사용자 닉네임 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 현재 로그인한 사용자의 닉네임 가져오기
 */
export async function getCurrentUserNickname() {
  try {
    const userId = await window.getUserId();
    if (!userId) return null;
    return await getUserNickname(userId);
  } catch (error) {
    console.error('현재 사용자 닉네임 가져오기 실패:', error);
    return null;
  }
}

// 전역 함수로 노출
window.getUserNickname = getUserNickname;
window.getCurrentUserNickname = getCurrentUserNickname;
window.updateUserNickname = updateUserNickname;

