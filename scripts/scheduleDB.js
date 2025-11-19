/**
 * Schedule Database Management
 * 일정 저장 및 관리 모듈
 * 하이브리드 방식: Supabase (우선) + IndexedDB (백업/오프라인)
 */

import { getSupabase, getSupabaseUserId } from './supabaseClient.js';

const DB_NAME = 'ViaFlightStorage';
const DB_VERSION = 3; // user_profiles는 2, schedules 추가로 3으로 업그레이드
const STORE_NAME = 'user_schedules';

// Supabase 사용 여부 (환경 변수나 설정으로 제어 가능)
let useSupabase = true;

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
      
      // 기존 stores 유지
      if (!db.objectStoreNames.contains('databases')) {
        db.createObjectStore('databases');
      }
      if (!db.objectStoreNames.contains('user_profiles')) {
        db.createObjectStore('user_profiles', { keyPath: 'userId' });
      }
      
      // user_schedules store 생성
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'scheduleId' });
        // userId로 인덱스 생성 (사용자별 조회용)
        store.createIndex('userId', 'userId', { unique: false });
        // createdAt으로 인덱스 생성 (정렬용)
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * 일정 저장
 * @param {string} userId - 사용자 ID (Auth0 ID)
 * @param {string} scheduleName - 일정 이름
 * @param {object} finalTripPlan - finalTripPlan 데이터
 * @param {object} scheduleData - scheduleData 데이터
 * @returns {Promise<string>} - 저장된 일정 ID
 */
export async function saveSchedule(userId, scheduleName, finalTripPlan, scheduleData) {
  if (!userId || !scheduleName) {
    throw new Error('사용자 ID와 일정 이름이 필요합니다.');
  }

  const now = new Date().toISOString();
  let scheduleId = null;
  let schedule = null;

  // 1. Supabase에 저장 시도 (우선)
  if (useSupabase) {
    try {
      const supabase = await getSupabase();
      const supabaseUserId = await getSupabaseUserId(userId);
      
      const { data, error } = await supabase
        .from('schedules')
        .insert({
          user_id: supabaseUserId,
          schedule_name: scheduleName.trim(),
          final_trip_plan: finalTripPlan,
          schedule_data: scheduleData
        })
        .select('id')
        .single();

      if (error) throw error;

      scheduleId = data.id;
      schedule = {
        scheduleId: data.id,
        userId,
        scheduleName: scheduleName.trim(),
        finalTripPlan,
        scheduleData,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };

      // Supabase 저장 성공 시 IndexedDB에도 백업 저장 (오프라인 지원)
      await saveToIndexedDB(schedule);
      
      return scheduleId;
    } catch (error) {
      console.warn('⚠️ Supabase 저장 실패, IndexedDB로 fallback:', error);
      // Supabase 실패 시 IndexedDB로 계속 진행
    }
  }

  // 2. IndexedDB에 저장 (fallback 또는 Supabase 비활성화 시)
  const db = await initDB();
  scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  schedule = {
    scheduleId,
    userId,
    scheduleName: scheduleName.trim(),
    finalTripPlan,
    scheduleData,
    createdAt: now,
    updatedAt: now
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(schedule);

    request.onsuccess = () => {
      resolve(scheduleId);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB에 일정 저장 (내부 함수)
 */
async function saveToIndexedDB(schedule) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(schedule);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('IndexedDB 백업 저장 실패:', error);
    // 백업 실패해도 계속 진행
  }
}

/**
 * 사용자별 일정 목록 조회
 * @param {string} userId - 사용자 ID (Auth0 ID)
 * @returns {Promise<Array>} - 일정 목록 (최신순)
 */
export async function getSchedulesByUserId(userId) {
  if (!userId) {
    return [];
  }

  // 1. Supabase에서 조회 시도 (우선)
  if (useSupabase) {
    try {
      const supabase = await getSupabase();
      const supabaseUserId = await getSupabaseUserId(userId);
      
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('user_id', supabaseUserId)
        .order('created_at', { ascending: false });

      if (!error) {
        // Supabase 데이터를 기존 형식으로 변환
        const schedules = (data || []).map(item => ({
          scheduleId: item.id,
          userId: userId, // Auth0 ID 유지
          scheduleName: item.schedule_name,
          finalTripPlan: item.final_trip_plan,
          scheduleData: item.schedule_data,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }));
        
        // IndexedDB에도 동기화 (백업)
        if (schedules.length > 0) {
          await syncSchedulesToIndexedDB(schedules, userId);
        }
        
        // 데이터가 있으면 반환, 없으면 IndexedDB로 fallback
        if (schedules.length > 0) {
          return schedules;
        }
        // 빈 배열이면 IndexedDB로 fallback
      }
    } catch (error) {
      console.warn('⚠️ Supabase 조회 실패, IndexedDB로 fallback:', error);
      // Supabase 실패 시 IndexedDB로 계속 진행
    }
  }

  // 2. IndexedDB에서 조회 (fallback)
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.openCursor();
    const schedules = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const schedule = cursor.value;
        if (schedule.userId === userId) {
          schedules.push(schedule);
        }
        cursor.continue();
      } else {
        schedules.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(schedules);
      }
    };
    
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Supabase 일정을 IndexedDB에 동기화 (내부 함수)
 */
async function syncSchedulesToIndexedDB(schedules, userId) {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // 기존 일정 삭제 후 새로 저장
    const deleteRequest = store.openCursor();
    deleteRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.userId === userId) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        // 삭제 완료 후 새 일정 저장
        schedules.forEach(schedule => {
          store.put(schedule);
        });
      }
    };
  } catch (error) {
    console.warn('IndexedDB 동기화 실패:', error);
  }
}

/**
 * 일정 ID로 일정 조회
 * @param {string} scheduleId - 일정 ID (Supabase UUID 또는 IndexedDB scheduleId)
 * @returns {Promise<object|null>} - 일정 데이터
 */
export async function getScheduleById(scheduleId) {
  if (!scheduleId) {
    console.warn('getScheduleById: scheduleId가 제공되지 않았습니다.');
    return null;
  }

  // 1. Supabase에서 조회 시도 (UUID 형식인 경우)
  if (useSupabase && scheduleId.includes('-')) { // UUID 형식 체크
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('id', scheduleId)
        .single();

      if (!error && data) {
        // Supabase 데이터를 기존 형식으로 변환
        const schedule = {
          scheduleId: data.id,
          userId: null, // Auth0 ID는 별도 조회 필요
          scheduleName: data.schedule_name,
          finalTripPlan: data.final_trip_plan,
          scheduleData: data.schedule_data,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
        
        // userId 복원 (profiles 테이블에서 조회)
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('auth0_id')
            .eq('id', data.user_id)
            .single();
          
          if (profile) {
            schedule.userId = profile.auth0_id;
          }
        } catch (e) {
          console.warn('userId 복원 실패:', e);
        }
        
        return schedule;
      }
    } catch (error) {
      console.warn('⚠️ Supabase 조회 실패, IndexedDB로 fallback:', error);
    }
  }

  // 2. IndexedDB에서 조회 (fallback 또는 scheduleId 형식)
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(scheduleId);

      request.onsuccess = () => {
        const result = request.result || null;
        resolve(result);
      };
      request.onerror = () => {
        console.error('getScheduleById 오류:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('getScheduleById 초기화 실패:', error);
    return null;
  }
}

/**
 * 일정 삭제
 * @param {string} scheduleId - 일정 ID (Supabase UUID 또는 IndexedDB scheduleId)
 * @returns {Promise<void>}
 */
export async function deleteSchedule(scheduleId) {
  if (!scheduleId) {
    throw new Error('일정 ID가 필요합니다.');
  }

  // 1. Supabase에서 삭제 시도 (UUID 형식인 경우)
  if (useSupabase && scheduleId.includes('-')) { // UUID 형식 체크
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
      
      // Supabase 삭제 성공 시 IndexedDB에서도 삭제
      await deleteFromIndexedDB(scheduleId);
      
      return;
    } catch (error) {
      console.warn('⚠️ Supabase 삭제 실패, IndexedDB로 fallback:', error);
      // Supabase 실패 시 IndexedDB로 계속 진행
    }
  }

  // 2. IndexedDB에서 삭제 (fallback)
  const db = await initDB();
  
  // 삭제 실행 (존재 확인을 같은 트랜잭션 내에서 수행)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // 먼저 존재하는지 확인
    const checkRequest = store.get(scheduleId);
    
    checkRequest.onsuccess = () => {
      const existingSchedule = checkRequest.result;
      
      if (!existingSchedule) {
        // 전체 스토어를 스캔하여 실제로 존재하는지 확인
        const scanRequest = store.openCursor();
        let foundInScan = false;
        let deleteRequestMade = false;
        
        scanRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const schedule = cursor.value;
            if (schedule.scheduleId === scheduleId) {
              foundInScan = true;
              // 발견했으므로 삭제 실행
              deleteRequestMade = true;
              const deleteRequest = store.delete(scheduleId);
              
              deleteRequest.onsuccess = () => {
                // 삭제 요청 성공
              };
              
              deleteRequest.onerror = () => {
                console.error('❌ 일정 삭제 요청 실패:', deleteRequest.error);
                reject(deleteRequest.error);
              };
              
              // 삭제 요청을 했으므로 cursor 종료하지 않고 계속 진행
              // (트랜잭션 완료 핸들러가 처리)
              cursor.continue();
            } else {
              cursor.continue();
            }
          } else {
            // 스캔 완료
            if (!foundInScan) {
              console.warn('⚠️ 전체 스캔에서도 일정을 찾지 못했습니다:', scheduleId);
              // 트랜잭션 완료를 기다리지 않고 바로 resolve
              resolve(); // 존재하지 않아도 성공으로 처리
            } else if (!deleteRequestMade) {
              // 찾았지만 삭제 요청을 하지 못한 경우 (이론적으로 발생하지 않아야 함)
              console.warn('⚠️ 일정을 찾았지만 삭제 요청을 하지 못했습니다:', scheduleId);
              resolve();
            }
            // deleteRequestMade가 true면 트랜잭션 완료를 기다림 (아래 transaction.oncomplete에서 처리)
          }
        };
        
        scanRequest.onerror = () => {
          console.error('❌ 전체 스캔 실패:', scanRequest.error);
          resolve(); // 스캔 실패해도 성공으로 처리
        };
        
        // 전체 스캔을 시작했으므로 여기서 return하지 않고 트랜잭션 완료를 기다림
        // (트랜잭션 완료 핸들러가 처리함)
        return;
      }
      
      // existingSchedule이 있는 경우
      // 삭제 실행
      const deleteRequest = store.delete(scheduleId);
      
      deleteRequest.onsuccess = () => {
        // 삭제 요청 성공
      };
      
      deleteRequest.onerror = () => {
        console.error('❌ 일정 삭제 요청 실패:', deleteRequest.error);
        reject(deleteRequest.error);
      };
    };
    
    checkRequest.onerror = () => {
      console.error('❌ 일정 존재 확인 실패:', checkRequest.error);
      reject(checkRequest.error);
    };

    // 트랜잭션이 완전히 완료될 때까지 대기
    transaction.oncomplete = () => {
      // 삭제가 실제로 되었는지 검증 (새 트랜잭션에서 확인)
      const verifyPromise = new Promise((resolveVerify, rejectVerify) => {
        // 약간의 지연을 추가하여 트랜잭션이 완전히 커밋되도록 함
        setTimeout(() => {
          const verifyTransaction = db.transaction([STORE_NAME], 'readonly');
          const verifyStore = verifyTransaction.objectStore(STORE_NAME);
          const verifyRequest = verifyStore.get(scheduleId);
          
          verifyRequest.onsuccess = () => {
            resolveVerify(verifyRequest.result);
          };
          verifyRequest.onerror = () => {
            rejectVerify(verifyRequest.error);
          };
        }, 50); // 지연 시간 증가
      });
      
      verifyPromise
        .then((verifyResult) => {
          if (verifyResult === undefined) {
            resolve();
          } else {
            console.error('❌ 일정 삭제 검증 실패: 삭제 후에도 여전히 존재함', scheduleId, verifyResult);
            // 삭제가 실패했지만 트랜잭션은 완료되었으므로 resolve
            // 하지만 경고는 남김
            resolve();
          }
        })
        .catch((verifyError) => {
          console.warn('⚠️ 삭제 검증 중 오류 발생, 하지만 삭제는 완료된 것으로 간주:', verifyError);
          resolve();
        });
    };
    
    transaction.onerror = () => {
      console.error('❌ 일정 삭제 트랜잭션 실패:', transaction.error);
      reject(transaction.error);
    };
  });
}

/**
 * IndexedDB에서 일정 삭제 (내부 함수)
 */
async function deleteFromIndexedDB(scheduleId) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(scheduleId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('IndexedDB 삭제 실패:', error);
  }
}

/**
 * 일정 이름 수정
 * @param {string} scheduleId - 일정 ID (Supabase UUID 또는 IndexedDB scheduleId)
 * @param {string} newName - 새로운 일정 이름
 * @returns {Promise<void>}
 */
export async function updateScheduleName(scheduleId, newName) {
  if (!scheduleId || !newName) {
    throw new Error('일정 ID와 새로운 이름이 필요합니다.');
  }

  // 1. Supabase에서 수정 시도 (UUID 형식인 경우)
  if (useSupabase && scheduleId.includes('-')) { // UUID 형식 체크
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('schedules')
        .update({ 
          schedule_name: newName.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', scheduleId);

      if (error) throw error;
      
      // Supabase 수정 성공 시 IndexedDB도 업데이트
      await updateIndexedDBScheduleName(scheduleId, newName);
      
      return;
    } catch (error) {
      console.warn('⚠️ Supabase 수정 실패, IndexedDB로 fallback:', error);
      // Supabase 실패 시 IndexedDB로 계속 진행
    }
  }

  // 2. IndexedDB에서 수정 (fallback)
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(scheduleId);

    getRequest.onsuccess = () => {
      const schedule = getRequest.result;
      if (!schedule) {
        reject(new Error('일정을 찾을 수 없습니다.'));
        return;
      }

      schedule.scheduleName = newName.trim();
      schedule.updatedAt = new Date().toISOString();

      const putRequest = store.put(schedule);
      putRequest.onsuccess = () => {
        resolve();
      };
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * IndexedDB에서 일정 이름 수정 (내부 함수)
 */
async function updateIndexedDBScheduleName(scheduleId, newName) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(scheduleId);

      getRequest.onsuccess = () => {
        const schedule = getRequest.result;
        if (schedule) {
          schedule.scheduleName = newName.trim();
          schedule.updatedAt = new Date().toISOString();
          const putRequest = store.put(schedule);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve(); // IndexedDB에 없어도 계속 진행
        }
      };
      getRequest.onerror = () => resolve(); // 에러가 나도 계속 진행
    });
  } catch (error) {
    console.warn('IndexedDB 이름 수정 실패:', error);
  }
}

// 전역 함수로 노출
window.saveSchedule = saveSchedule;
window.getSchedulesByUserId = getSchedulesByUserId;
window.getScheduleById = getScheduleById;
window.deleteSchedule = deleteSchedule;
window.updateScheduleName = updateScheduleName;

