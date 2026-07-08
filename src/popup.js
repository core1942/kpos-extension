const els = {
  modeText: document.querySelector("#modeText"),
  statusBadge: document.querySelector("#statusBadge"),
  nameValue: document.querySelector("#nameValue"),
  pathValue: document.querySelector("#pathValue"),
  snValue: document.querySelector("#snValue"),
  typeValue: document.querySelector("#typeValue"),
  areaValue: document.querySelector("#areaValue"),
  messageText: document.querySelector("#messageText"),
  optionsButton: document.querySelector("#optionsButton"),
  unbindButton: document.querySelector("#unbindButton")
};

let currentTabId = null;

document.addEventListener("DOMContentLoaded", init);
els.optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
els.unbindButton.addEventListener("click", unbindCurrentClient);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id || null;

  if (!currentTabId) {
    renderError("未找到当前标签页。");
    return;
  }

  const status = await sendMessage({ type: "getPopupStatus", tabId: currentTabId });
  if (!status.ok) {
    renderError(status.error || "读取状态失败。");
    return;
  }

  renderStatus(status);
}

function renderStatus(status) {
  const modeLabel = status.mode === "operation" ? "运维模式" : "客户端模式";
  els.modeText.textContent = modeLabel;
  els.nameValue.textContent = status.clientName || "-";
  els.pathValue.textContent = status.path || "-";
  els.snValue.textContent = status.sn || "-";
  els.typeValue.textContent = status.type || "-";
  els.areaValue.textContent = status.areaName || "-";
  els.unbindButton.hidden = !status.active;

  if (status.active) {
    els.statusBadge.textContent = "生效中";
    els.statusBadge.className = "badge active";
    els.messageText.textContent = "当前标签页的请求会自动携带授权头。";
    return;
  }

  if (status.matched) {
    els.statusBadge.textContent = "待生效";
    els.statusBadge.className = "badge warning";
    els.messageText.textContent = "当前 path 已匹配，客户端模式可能正在等待授权检测或注册。";
    return;
  }

  els.statusBadge.textContent = "未生效";
  els.statusBadge.className = "badge muted";
  els.messageText.textContent = "当前页面没有命中已配置的 path。";
}

async function unbindCurrentClient() {
  if (!currentTabId) {
    return;
  }

  const confirmed = window.confirm("确定要解绑当前客户端吗？");
  if (!confirmed) {
    return;
  }

  els.unbindButton.disabled = true;
  els.messageText.textContent = "正在解绑...";

  const result = await sendMessage({ type: "unbindClient", tabId: currentTabId });
  els.unbindButton.disabled = false;

  if (!result.ok) {
    els.messageText.textContent = result.error || "解绑失败。";
    return;
  }

  els.messageText.textContent = "解绑成功，刷新目标页面后会重新进入注册流程。";
  els.statusBadge.textContent = "已解绑";
  els.statusBadge.className = "badge warning";
  els.unbindButton.hidden = true;
}

function renderError(message) {
  els.statusBadge.textContent = "异常";
  els.statusBadge.className = "badge danger";
  els.messageText.textContent = message;
}

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      resolve(response || { ok: false, error: chrome.runtime.lastError?.message || "扩展通信失败。" });
    });
  });
}
