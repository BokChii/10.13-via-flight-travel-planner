/**
 * 커스텀 알림 모달 유틸리티
 * alert() 대신 사용하는 서비스 스타일 알림창
 */

/**
 * 알림 모달 표시
 * @param {Object} options - 모달 옵션
 * @param {string} options.message - 메시지 텍스트
 * @param {string} options.type - 타입: 'success', 'error', 'warning', 'info' (기본: 'info')
 * @param {Function} options.onConfirm - 확인 버튼 클릭 시 콜백 (선택)
 * @param {string} options.title - 제목 (선택, 기본: 타입에 따라 자동 설정)
 */
function showModal(options) {
  const {
    message,
    type = 'info',
    onConfirm,
    title
  } = options;

  // 기존 모달이 있으면 제거
  const existingModal = document.getElementById('custom-alert-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // 타입별 기본 설정
  const typeConfig = {
    success: {
      icon: '✅',
      defaultTitle: '성공',
      color: '#4caf50'
    },
    error: {
      icon: '❌',
      defaultTitle: '오류',
      color: '#f44336'
    },
    warning: {
      icon: '⚠️',
      defaultTitle: '경고',
      color: '#ff9800'
    },
    info: {
      icon: 'ℹ️',
      defaultTitle: '알림',
      color: '#2196f3'
    }
  };

  const config = typeConfig[type] || typeConfig.info;
  const modalTitle = title || config.defaultTitle;

  // HTML 이스케이프 헬퍼
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 모달 HTML 생성
  const modalHTML = `
    <div id="custom-alert-modal" class="custom-alert-overlay">
      <div class="custom-alert-content">
        <div class="custom-alert-icon" style="color: ${config.color};">
          ${config.icon}
        </div>
        <h3 class="custom-alert-title">${escapeHtml(modalTitle)}</h3>
        <p class="custom-alert-message">${escapeHtml(message)}</p>
        <button class="custom-alert-button" style="background-color: ${config.color};">
          확인
        </button>
      </div>
    </div>
  `;

  // 모달 추가
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modal = document.getElementById('custom-alert-modal');
  const button = modal.querySelector('.custom-alert-button');

  // 확인 버튼 클릭 이벤트
  const handleConfirm = () => {
    modal.remove();
    if (onConfirm && typeof onConfirm === 'function') {
      onConfirm();
    }
  };

  button.addEventListener('click', handleConfirm);

  // ESC 키로 닫기
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      handleConfirm();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // 오버레이 클릭으로 닫기 (선택적)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      handleConfirm();
    }
  });

  // 포커스 설정
  button.focus();
}

/**
 * 확인/취소 모달 표시 (confirm() 대체)
 * @param {Object} options - 모달 옵션
 * @param {string} options.message - 메시지 텍스트
 * @param {string} options.title - 제목 (선택, 기본: '확인')
 * @param {string} options.confirmText - 확인 버튼 텍스트 (기본: '확인')
 * @param {string} options.cancelText - 취소 버튼 텍스트 (기본: '취소')
 * @param {string} options.type - 타입: 'warning', 'danger', 'info' (기본: 'warning')
 * @returns {Promise<boolean>} - 확인 시 true, 취소 시 false
 */
function showConfirmModal(options) {
  return new Promise((resolve) => {
    const {
      message,
      title = '확인',
      confirmText = '확인',
      cancelText = '취소',
      type = 'warning'
    } = options;

    // 기존 모달이 있으면 제거
    const existingModal = document.getElementById('custom-confirm-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // 타입별 설정
    const typeConfig = {
      warning: {
        icon: '⚠️',
        confirmColor: '#ff9800',
        titleColor: '#ff9800'
      },
      danger: {
        icon: '🗑️',
        confirmColor: '#f44336',
        titleColor: '#f44336'
      },
      info: {
        icon: 'ℹ️',
        confirmColor: '#2196f3',
        titleColor: '#2196f3'
      }
    };

    const config = typeConfig[type] || typeConfig.warning;

    // HTML 이스케이프 헬퍼
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // 모달 HTML 생성
    const modalHTML = `
      <div id="custom-confirm-modal" class="custom-alert-overlay">
        <div class="custom-confirm-content">
          <div class="custom-confirm-icon" style="color: ${config.titleColor};">
            ${config.icon}
          </div>
          <h3 class="custom-confirm-title" style="color: ${config.titleColor};">
            ${escapeHtml(title)}
          </h3>
          <p class="custom-confirm-message">${escapeHtml(message)}</p>
          <div class="custom-confirm-buttons">
            <button class="custom-confirm-button cancel" style="background-color: #666;">
              ${escapeHtml(cancelText)}
            </button>
            <button class="custom-confirm-button confirm" style="background-color: ${config.confirmColor};">
              ${escapeHtml(confirmText)}
            </button>
          </div>
        </div>
      </div>
    `;

    // 모달 추가
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('custom-confirm-modal');
    const confirmBtn = modal.querySelector('.custom-confirm-button.confirm');
    const cancelBtn = modal.querySelector('.custom-confirm-button.cancel');

    // 확인 버튼 클릭
    const handleConfirm = () => {
      modal.remove();
      resolve(true);
    };

    // 취소 버튼 클릭
    const handleCancel = () => {
      modal.remove();
      resolve(false);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);

    // ESC 키로 취소
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleCancel();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // 오버레이 클릭으로 취소
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    });

    // 확인 버튼에 포커스
    confirmBtn.focus();
  });
}

// 전역으로 노출
if (typeof window !== 'undefined') {
  window.showModal = showModal;
  window.showConfirmModal = showConfirmModal;
}

