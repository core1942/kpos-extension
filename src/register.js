const params = new URLSearchParams(window.location.search);
const targetUrl = params.get("target") || "";
const entryId = params.get("entryId") || "";
const reason = params.get("reason") || "";

const els = {
  typeBadge: document.querySelector("#typeBadge"),
  reasonText: document.querySelector("#reasonText"),
  registerForm: document.querySelector("#registerForm"),
  clientNameInput: document.querySelector("#clientNameInput"),
  snInput: document.querySelector("#snInput"),
  areaSelect: document.querySelector("#areaSelect"),
  targetText: document.querySelector("#targetText"),
  feedback: document.querySelector("#feedback"),
  optionsButton: document.querySelector("#optionsButton"),
  submitButton: document.querySelector("#submitButton")
};

let prepared = null;

document.addEventListener("DOMContentLoaded", init);
els.registerForm.addEventListener("submit", submitRegistration);
els.optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

async function init() {
  if (!targetUrl || !entryId) {
    showFatal("注册上下文缺失，请重新访问目标页面。");
    return;
  }

  const response = await sendMessage({
    type: "prepareRegistration",
    targetUrl,
    entryId,
    reason
  });

  if (!response.ok) {
    showFatal(response.error || "授权检测失败。");
    return;
  }

  prepared = response;
  els.typeBadge.textContent = `Type ${prepared.type}`;
  els.clientNameInput.value = prepared.defaultClientName || "";
  els.snInput.value = prepared.sn || "";
  els.targetText.textContent = prepared.targetUrl;
  renderAreas(prepared.areas || []);

  if (prepared.bound) {
    els.reasonText.textContent = "设备已注册，正在进入目标页面...";
    const resumed = await sendMessage({
      type: "resumeTarget",
      targetUrl: prepared.targetUrl,
      entryId: prepared.entryId
    });
    if (resumed.ok) {
      window.location.replace(resumed.targetUrl);
      return;
    }
    showFatal(resumed.error || "进入目标页面失败。");
    return;
  }

  els.reasonText.textContent = prepared.reason || "当前设备未绑定，请完成注册后进入页面。";
  els.registerForm.hidden = false;
  els.clientNameInput.focus();
}

function renderAreas(areas) {
  for (const area of areas) {
    const option = document.createElement("option");
    option.value = String(area.id);
    option.textContent = area.name || `区域 ${area.id}`;
    els.areaSelect.appendChild(option);
  }
}

async function submitRegistration(event) {
  event.preventDefault();

  const clientName = els.clientNameInput.value.trim();
  const sn = els.snInput.value.trim();
  const areaId = els.areaSelect.value;

  if (!clientName || !sn) {
    showFeedback("设备名称和设备序列号不能为空。", "error");
    return;
  }

  els.submitButton.disabled = true;
  showFeedback("正在注册设备...", "muted");

  const result = await sendMessage({
    type: "registerClient",
    targetUrl: prepared.targetUrl,
    entryId: prepared.entryId,
    clientName,
    sn,
    areaId
  });

  els.submitButton.disabled = false;

  if (!result.ok) {
    showFeedback(result.error || "注册失败，请检查后重试。", "error");
    return;
  }

  showFeedback("注册成功，正在进入目标页面...", "success");
  window.location.replace(result.targetUrl);
}

function showFatal(message) {
  els.reasonText.textContent = message;
  els.reasonText.className = "reason error";
  els.registerForm.hidden = true;
}

function showFeedback(message, type) {
  els.feedback.textContent = message;
  els.feedback.className = `feedback ${type || ""}`;
}

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      resolve(response || { ok: false, error: chrome.runtime.lastError?.message || "扩展通信失败。" });
    });
  });
}
