const els = {
  saveButton: document.querySelector("#saveButton"),
  resetButton: document.querySelector("#resetButton"),
  addPathButton: document.querySelector("#addPathButton"),
  operationSnInput: document.querySelector("#operationSnInput"),
  deviceIdInput: document.querySelector("#deviceIdInput"),
  browserTypeInput: document.querySelector("#browserTypeInput"),
  generatedSnInput: document.querySelector("#generatedSnInput"),
  pathsBody: document.querySelector("#pathsBody"),
  feedback: document.querySelector("#feedback")
};

let settings = null;

document.addEventListener("DOMContentLoaded", init);
els.saveButton.addEventListener("click", save);
els.resetButton.addEventListener("click", reset);
els.addPathButton.addEventListener("click", addPath);

async function init() {
  const response = await sendMessage({ type: "getSettings" });
  if (!response.ok) {
    showFeedback(response.error || "读取配置失败。", "error");
    return;
  }

  settings = response.settings;
  render();
}

function render() {
  document.querySelectorAll("input[name='mode']").forEach((input) => {
    input.checked = input.value === settings.mode;
  });
  els.operationSnInput.value = settings.operationSn || "";
  els.deviceIdInput.value = settings.deviceId || "";
  els.browserTypeInput.value = settings.browserType || "";
  els.generatedSnInput.value = settings.generatedSn || "";
  renderPaths();
}

function renderPaths() {
  els.pathsBody.textContent = "";

  settings.paths.forEach((entry) => {
    const row = document.createElement("tr");
    row.dataset.id = entry.id;
    row.innerHTML = `
      <td><input class="path-input" type="text" value="${escapeAttr(entry.path)}" aria-label="Path"></td>
      <td><input class="sn-input" type="text" value="${escapeAttr(entry.sn)}" aria-label="SN"></td>
      <td><input class="type-input" type="number" min="0" step="1" value="${escapeAttr(entry.type)}" aria-label="Type"></td>
      <td><button class="icon-button remove-button" type="button" title="删除">删除</button></td>
    `;
    row.querySelector(".remove-button").addEventListener("click", () => removePath(entry.id));
    els.pathsBody.appendChild(row);
  });
}

function collectDraft() {
  return {
    ...settings,
    mode: document.querySelector("input[name='mode']:checked")?.value || "client",
    operationSn: els.operationSnInput.value.trim(),
    paths: [...els.pathsBody.querySelectorAll("tr")].map((row) => ({
      id: row.dataset.id,
      path: row.querySelector(".path-input").value.trim(),
      sn: row.querySelector(".sn-input").value.trim(),
      type: row.querySelector(".type-input").value.trim()
    }))
  };
}

async function save() {
  showFeedback("正在保存...", "muted");
  els.saveButton.disabled = true;

  const result = await sendMessage({ type: "saveSettings", settings: collectDraft() });
  els.saveButton.disabled = false;

  if (!result.ok) {
    showFeedback(result.error || "保存失败。", "error");
    return;
  }

  settings = result.settings;
  render();
  showFeedback("配置已保存。", "success");
}

async function reset() {
  const confirmed = window.confirm("确定要恢复默认配置吗？当前 path、SN 和模式设置会被覆盖。");
  if (!confirmed) {
    return;
  }

  const result = await sendMessage({ type: "resetSettings" });
  if (!result.ok) {
    showFeedback(result.error || "恢复默认失败。", "error");
    return;
  }

  settings = result.settings;
  render();
  showFeedback("已恢复默认配置。", "success");
}

function addPath() {
  settings.paths.push({
    id: `path-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    path: "",
    sn: "",
    type: ""
  });
  renderPaths();
  const lastRow = els.pathsBody.querySelector("tr:last-child");
  lastRow?.querySelector(".path-input")?.focus();
}

function removePath(id) {
  settings.paths = settings.paths.filter((entry) => entry.id !== id);
  renderPaths();
}

function showFeedback(message, type) {
  els.feedback.textContent = message;
  els.feedback.className = `feedback ${type || ""}`;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      resolve(response || { ok: false, error: chrome.runtime.lastError?.message || "扩展通信失败。" });
    });
  });
}
