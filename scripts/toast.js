let container;

export function initToasts(root = document.body) {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    root.append(container);
  }
}

export function showToast({ message, timeout = 5000, type = "info" }) {
  initToasts();

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;

  const icon = document.createElement("span");
  icon.className = "toast__icon";
  icon.textContent = toastIcon(type);

  const content = document.createElement("div");
  content.className = "toast__content";
  content.textContent = message;

  toast.append(icon, content);
  container.append(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast--visible");
  });

  const hide = () => {
    toast.classList.remove("toast--visible");
    toast.addEventListener(
      "transitionend",
      () => {
        toast.remove();
      },
      { once: true }
    );
  };

  if (timeout > 0) {
    setTimeout(hide, timeout);
  }

  toast.addEventListener("click", hide);
}

// 전역으로 노출 (airport-only.html, airport-external.html에서 사용 가능하도록)
window.showToast = showToast;

function toastIcon(type) {
  switch (type) {
    case "success":
      return "✅";
    case "warning":
      return "⚠️";
    case "error":
      return "🚫";
    default:
      return "ℹ️";
  }
}
