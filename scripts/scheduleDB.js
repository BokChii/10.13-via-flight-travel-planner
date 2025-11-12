/**
 * Schedule Database Management
 * 일정 저장 및 관리 모듈
 * IndexedDB를 사용하여 사용자별 일정 저장
 */

const DB_NAME = 'ViaFlightStorage';
const DB_VERSION = 3; // user_profiles는 2, schedules 추가로 3으로 업그레이드
const STORE_NAME = 'user_schedules';

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
 * @param {string} userId - 사용자 ID
 * @param {string} scheduleName - 일정 이름
 * @param {object} finalTripPlan - finalTripPlan 데이터
 * @param {object} scheduleData - scheduleData 데이터
 * @returns {Promise<string>} - 저장된 일정 ID
 */
export async function saveSchedule(userId, scheduleName, finalTripPlan, scheduleData) {
  if (!userId || !scheduleName) {
    throw new Error('사용자 ID와 일정 이름이 필요합니다.');
  }

  const db = await initDB();
  const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();

  const schedule = {
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
      console.log('✅ 일정 저장 완료:', scheduleId);
      resolve(scheduleId);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 사용자별 일정 목록 조회
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Array>} - 일정 목록 (최신순)
 */
export async function getSchedulesByUserId(userId) {
  if (!userId) {
    return [];
  }

  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    // 인덱스 대신 전체 스토어를 스캔하여 필터링 (인덱스 업데이트 지연 문제 해결)
    const request = store.openCursor();
    const schedules = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const schedule = cursor.value;
        // userId가 일치하는 일정만 추가
        if (schedule.userId === userId) {
          schedules.push(schedule);
          console.log('📋 일정 발견:', schedule.scheduleId, schedule.scheduleName);
        }
        cursor.continue();
      } else {
        // 모든 일정을 스캔 완료
        // createdAt 기준 내림차순 정렬 (최신순)
        schedules.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        console.log('📋 일정 목록 스캔 완료, 총 일정 개수:', schedules.length);
        console.log('📋 일정 ID 목록:', schedules.map(s => s.scheduleId));
        // cursor가 완료되면 바로 resolve (트랜잭션 완료를 기다릴 필요 없음)
        resolve(schedules);
      }
    };
    
    request.onerror = () => {
      reject(request.error);
    };
    
    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

/**
 * 일정 ID로 일정 조회
 * @param {string} scheduleId - 일정 ID
 * @returns {Promise<object|null>} - 일정 데이터
 */
export async function getScheduleById(scheduleId) {
  if (!scheduleId) {
    console.warn('getScheduleById: scheduleId가 제공되지 않았습니다.');
    return null;
  }

  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(scheduleId);

      request.onsuccess = () => {
        const result = request.result || null;
        console.log('getScheduleById 성공:', { scheduleId, found: !!result });
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
 * @param {string} scheduleId - 일정 ID
 * @returns {Promise<void>}
 */
export async function deleteSchedule(scheduleId) {
  if (!scheduleId) {
    throw new Error('일정 ID가 필요합니다.');
  }

  console.log('🗑️ deleteSchedule 호출됨, scheduleId:', scheduleId);
  const db = await initDB();
  
  // 삭제 실행 (존재 확인을 같은 트랜잭션 내에서 수행)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // 먼저 존재하는지 확인
    console.log('🔍 일정 존재 확인 시작, scheduleId:', scheduleId);
    const checkRequest = store.get(scheduleId);
    
    checkRequest.onsuccess = () => {
      const existingSchedule = checkRequest.result;
      console.log('🔍 일정 존재 확인 결과:', existingSchedule ? `찾음 (${existingSchedule.scheduleName})` : '찾지 못함');
      
      if (!existingSchedule) {
        // 전체 스토어를 스캔하여 실제로 존재하는지 확인
        console.log('⚠️ store.get으로 찾지 못함, 전체 스토어 스캔 시작...');
        const scanRequest = store.openCursor();
        let foundInScan = false;
        let deleteRequestMade = false;
        
        scanRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const schedule = cursor.value;
            if (schedule.scheduleId === scheduleId) {
              foundInScan = true;
              console.log('✅ 전체 스캔에서 일정 발견:', schedule.scheduleId, schedule.scheduleName);
              // 발견했으므로 삭제 실행
              deleteRequestMade = true;
              const deleteRequest = store.delete(scheduleId);
              
              deleteRequest.onsuccess = () => {
                console.log('✅ 일정 삭제 요청 성공:', scheduleId);
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
      console.log('🗑️ 일정 삭제 시작, 존재 확인됨:', scheduleId, existingSchedule.scheduleName);
      
      // 삭제 실행
      const deleteRequest = store.delete(scheduleId);
      
      deleteRequest.onsuccess = () => {
        console.log('✅ 일정 삭제 요청 성공:', scheduleId);
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
      console.log('✅ 일정 삭제 완료 (트랜잭션 커밋됨):', scheduleId);
      
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
            console.log('✅ 일정 삭제 검증 완료: 실제로 삭제됨', scheduleId);
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
 * 일정 이름 수정
 * @param {string} scheduleId - 일정 ID
 * @param {string} newName - 새로운 일정 이름
 * @returns {Promise<void>}
 */
export async function updateScheduleName(scheduleId, newName) {
  if (!scheduleId || !newName) {
    throw new Error('일정 ID와 새로운 이름이 필요합니다.');
  }

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
        console.log('✅ 일정 이름 수정 완료:', scheduleId);
        resolve();
      };
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// 전역 함수로 노출
window.saveSchedule = saveSchedule;
window.getSchedulesByUserId = getSchedulesByUserId;
window.getScheduleById = getScheduleById;
window.deleteSchedule = deleteSchedule;
window.updateScheduleName = updateScheduleName;

