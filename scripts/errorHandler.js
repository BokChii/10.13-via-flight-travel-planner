/**
 * 공통 에러 처리 유틸리티
 * 애플리케이션 전반에서 일관된 에러 처리를 제공합니다.
 */

/**
 * 에러 타입 및 코드 정의
 */
export const ErrorCodes = {
  // 네트워크 관련
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_KEY_MISSING: 'API_KEY_MISSING',
  API_REQUEST_FAILED: 'API_REQUEST_FAILED',
  
  // 데이터 관련
  INVALID_DATA: 'INVALID_DATA',
  PARSE_ERROR: 'PARSE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  
  // 플래너 관련
  NO_RECOMMENDATIONS: 'NO_RECOMMENDATIONS',
  PLAN_GENERATION_FAILED: 'PLAN_GENERATION_FAILED',
  
  // 지도 관련
  MAP_LOAD_FAILED: 'MAP_LOAD_FAILED',
  DIRECTIONS_FAILED: 'DIRECTIONS_FAILED',
  
  // 기타
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

/**
 * 에러 메시지 매핑 (사용자 친화적)
 */
const ERROR_MESSAGES = {
  [ErrorCodes.NETWORK_ERROR]: '네트워크 연결을 확인해주세요.',
  [ErrorCodes.API_KEY_MISSING]: '지도 서비스를 불러올 수 없습니다. API 키를 확인해주세요.',
  [ErrorCodes.API_REQUEST_FAILED]: '서비스 요청에 실패했습니다. 잠시 후 다시 시도해주세요.',
  [ErrorCodes.INVALID_DATA]: '데이터 형식이 올바르지 않습니다.',
  [ErrorCodes.PARSE_ERROR]: '데이터를 처리하는 중 오류가 발생했습니다.',
  [ErrorCodes.VALIDATION_ERROR]: '입력 데이터를 확인해주세요.',
  [ErrorCodes.NO_RECOMMENDATIONS]: '추천할 장소를 찾지 못했습니다. 카테고리를 바꿔 다시 시도해주세요.',
  [ErrorCodes.PLAN_GENERATION_FAILED]: '일정 생성 중 오류가 발생했습니다. 다시 시도해주세요.',
  [ErrorCodes.MAP_LOAD_FAILED]: '지도를 불러오지 못했습니다. API 키를 확인하세요.',
  [ErrorCodes.DIRECTIONS_FAILED]: '경로를 불러오는 중 문제가 발생했습니다.',
  [ErrorCodes.UNKNOWN_ERROR]: '오류가 발생했습니다. 다시 시도해주세요.',
};

/**
 * 사용자 친화적인 에러 메시지를 가져옵니다.
 * @param {Error|string|object} error - 에러 객체, 메시지, 또는 코드
 * @param {string} context - 에러가 발생한 컨텍스트 (선택적)
 * @returns {string} 사용자 친화적 메시지
 */
function getUserFriendlyMessage(error, context = '') {
  // Error 객체에서 코드 추출
  if (error?.code && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code];
  }
  
  // 문자열 메시지에서 코드 매칭 시도
  if (typeof error === 'string') {
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      if (error.includes(code) || error === code) {
        return message;
      }
    }
  }
  
  // error.message에서 코드 확인
  if (error?.message) {
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      if (error.message.includes(code) || error.message === code) {
        return message;
      }
    }
    
    // 특정 패턴 매칭
    if (error.message.includes('NO_RECOMMENDATIONS')) {
      return ERROR_MESSAGES[ErrorCodes.NO_RECOMMENDATIONS];
    }
    if (error.message.includes('Failed to parse') || error.message.includes('JSON')) {
      return ERROR_MESSAGES[ErrorCodes.PARSE_ERROR];
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return ERROR_MESSAGES[ErrorCodes.NETWORK_ERROR];
    }
  }
  
  // 기본 메시지 (컨텍스트 포함)
  const defaultMessage = ERROR_MESSAGES[ErrorCodes.UNKNOWN_ERROR];
  return context ? `${context}: ${defaultMessage}` : defaultMessage;
}

/**
 * 통합 에러 처리 함수
 * @param {Error|string|object} error - 에러 객체, 메시지, 또는 코드
 * @param {Object} options - 처리 옵션
 * @param {string} options.context - 에러 컨텍스트
 * @param {boolean} options.silent - 로그만 출력 (사용자 알림 없음)
 * @param {boolean} options.showToast - 사용자에게 토스트 표시
 * @param {string} options.toastMessage - 커스텀 토스트 메시지
 * @param {Function} options.fallback - 에러 발생 시 실행할 폴백 함수
 * @param {boolean} options.logToConsole - 콘솔에 로그 출력 (기본값: true)
 * @returns {any} 폴백 함수 반환값 또는 null
 */
export function handleError(error, options = {}) {
  const {
    context = '',
    silent = false,
    showToast = true,
    toastMessage = null,
    fallback = null,
    logToConsole = true,
  } = options;
  
  // 에러 메시지 생성
  const userMessage = toastMessage || getUserFriendlyMessage(error, context);
  
  // 콘솔 로깅 (개발 환경 또는 명시적 요청 시)
  if (logToConsole && !silent) {
    const logContext = context ? `[${context}]` : '';
    if (error instanceof Error) {
      console.error(`${logContext}`, error);
    } else if (typeof error === 'object' && error !== null) {
      console.error(`${logContext}`, error);
    } else {
      console.error(`${logContext}`, error);
    }
  }
  
  // 사용자 알림 (토스트)
  if (showToast && window.showToast && !silent) {
    try {
      window.showToast({
        message: userMessage,
        type: 'error'
      });
    } catch (toastError) {
      // 토스트 표시 실패 시 콘솔에만 로그
      console.warn('Failed to show toast:', toastError);
    }
  }
  
  // 에러 추적 (프로덕션 환경에서 사용 가능)
  if (typeof window !== 'undefined' && window.trackError && !silent) {
    try {
      window.trackError(error, {
        context,
        userMessage,
        timestamp: new Date().toISOString(),
        ...options
      });
    } catch (trackError) {
      // 추적 실패는 무시 (선택적 기능)
      console.debug('Error tracking not available:', trackError);
    }
  }
  
  // 폴백 함수 실행
  if (fallback && typeof fallback === 'function') {
    try {
      return fallback();
    } catch (fallbackError) {
      console.error('Fallback function failed:', fallbackError);
      return null;
    }
  }
  
  return null;
}

/**
 * 비동기 함수 실행을 래핑하여 에러를 자동 처리합니다.
 * @param {Function} asyncFn - 실행할 비동기 함수
 * @param {Object} options - handleError와 동일한 옵션
 * @returns {Promise<any>} 함수 실행 결과 또는 null
 */
export async function safeAsync(asyncFn, options = {}) {
  try {
    return await asyncFn();
  } catch (error) {
    handleError(error, options);
    return null;
  }
}

/**
 * Google Maps Directions API 상태 코드를 사용자 친화적 메시지로 변환합니다.
 * @param {string} status - DirectionsStatus 코드
 * @param {Object} google - Google Maps SDK (optional)
 * @returns {string} 사용자 친화적 메시지
 */
export function getDirectionsErrorMessage(status, google = null) {
  // Google Maps SDK가 있으면 상수 사용
  if (google?.maps?.DirectionsStatus) {
    const statuses = google.maps.DirectionsStatus;
    const messages = {
      [statuses.NOT_FOUND]: '출발지나 도착지를 찾을 수 없습니다. 주소를 다시 확인해주세요.',
      [statuses.ZERO_RESULTS]: '경로를 찾을 수 없습니다. 다른 출발지나 도착지를 시도해보세요.',
      [statuses.REQUEST_DENIED]: '지도 서비스 이용에 문제가 있습니다. 잠시 후 다시 시도해주세요.',
      [statuses.OVER_QUERY_LIMIT]: '서비스 이용량이 초과되었습니다. 잠시 후 다시 시도해주세요.',
      [statuses.INVALID_REQUEST]: '요청 정보가 올바르지 않습니다. 다시 확인해주세요.',
    };
    
    if (messages[status]) {
      return messages[status];
    }
  }
  
  // SDK가 없거나 알 수 없는 상태 코드
  const statusStr = String(status).toUpperCase();
  if (statusStr.includes('NOT_FOUND')) {
    return '출발지나 도착지를 찾을 수 없습니다.';
  }
  if (statusStr.includes('ZERO_RESULTS')) {
    return '경로를 찾을 수 없습니다.';
  }
  if (statusStr.includes('DENIED') || statusStr.includes('REQUEST_DENIED')) {
    return '지도 서비스 이용에 문제가 있습니다.';
  }
  if (statusStr.includes('QUERY_LIMIT') || statusStr.includes('OVER_QUERY_LIMIT')) {
    return '서비스 이용량이 초과되었습니다.';
  }
  
  return '경로를 불러오는 중 문제가 발생했습니다.';
}

/**
 * 에러 객체를 생성합니다 (코드 포함)
 * @param {string} code - 에러 코드
 * @param {string} message - 에러 메시지
 * @param {any} originalError - 원본 에러 (선택적)
 * @returns {Error} 에러 객체
 */
export function createError(code, message, originalError = null) {
  const error = new Error(message);
  error.code = code;
  if (originalError) {
    error.originalError = originalError;
    error.stack = originalError.stack || error.stack;
  }
  return error;
}

