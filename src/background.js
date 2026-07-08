const STORAGE_KEY = "posLicenseSettings";
const SESSION_RULE_BASE = 100000;
const PATH_RULE_BASE = 200000;
const PATH_RULE_LIMIT = 1000;
const API_PATH_PREFIX = "/kpos/api";
const OVERVIEW_PATH = "/kpos/api/client/overview";
const REGISTER_PATH = "/kpos/api/client/register";
const UNBIND_PATH = "/kpos/api/client/unbind";
const UNAUTHORIZED_CODE = 40103;
const DEVICE_ID_LENGTH = 16;
const DEVICE_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SHORT_DEVICE_ID_PATTERN = /^[A-Za-z0-9]{16}$/;

const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "other"
];

const activeTabs = new Map();
const lastNavigationChecks = new Map();
const lastUnauthorizedRedirects = new Map();
let defaultConfigPromise;
let settingsPromise;

chrome.runtime.onInstalled.addListener(() => {
  initialize().catch(logError);
});

chrome.runtime.onStartup.addListener(() => {
  initialize().catch(logError);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || (changeInfo.status === "loading" ? tab.url : "");
  if (!url) {
    return;
  }
  scheduleNavigationCheck(tabId, url).catch(logError);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || !details.url) {
    return;
  }
  scheduleNavigationCheck(details.tabId, details.url).catch(logError);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
  lastNavigationChecks.delete(tabId);
  lastUnauthorizedRedirects.delete(tabId);
  removeSessionRule(tabId).catch(logError);
});

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0 || details.statusCode !== 401) {
      return;
    }

    const active = activeTabs.get(details.tabId);
    if (!active || active.mode !== "client") {
      return;
    }

    const requestUrl = tryParseUrl(details.url);
    if (!requestUrl || !requestUrl.pathname.startsWith(API_PATH_PREFIX)) {
      return;
    }

    const lastRedirectedAt = lastUnauthorizedRedirects.get(details.tabId) || 0;
    if (Date.now() - lastRedirectedAt < 3000) {
      return;
    }

    lastUnauthorizedRedirects.set(details.tabId, Date.now());
    redirectActiveTabToRegistration(details.tabId, "服务器返回 401，需要重新注册。").catch(logError);
  },
  { urls: ["<all_urls>"] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      logError(error);
      sendResponse({ ok: false, error: error.message || String(error) });
    });
  return true;
});

async function initialize() {
  const settings = await getSettings();
  await clearPathHeaderRules();
  await scanOpenTabsForMatches(settings);
}

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "getSettings":
      return { ok: true, settings: await getSettings() };

    case "saveSettings":
      return saveSettings(message.settings);

    case "resetSettings":
      return resetSettings();

    case "getPopupStatus":
      return getPopupStatus(message.tabId);

    case "prepareRegistration":
      return prepareRegistration(message.targetUrl, message.entryId, message.reason);

    case "registerClient":
      return registerClient({
        targetUrl: message.targetUrl,
        entryId: message.entryId,
        clientName: message.clientName,
        sn: message.sn,
        areaId: message.areaId,
        tabId: sender.tab?.id
      });

    case "connectRegistrationSn":
      return connectRegistrationSn({
        targetUrl: message.targetUrl,
        entryId: message.entryId,
        sn: message.sn,
        tabId: sender.tab?.id
      });

    case "resumeTarget":
      return resumeTarget(message.targetUrl, message.entryId, sender.tab?.id);

    case "unbindClient":
      return unbindClient(message.tabId);

    case "authorizationFailed":
      return handleAuthorizationFailure(sender, message);

    default:
      return { ok: false, error: "Unknown message type." };
  }
}

async function getSettings() {
  if (!settingsPromise) {
    settingsPromise = loadSettings();
  }
  return settingsPromise;
}

async function loadSettings() {
  const stored = await storageGet(STORAGE_KEY);
  let settings = stored[STORAGE_KEY];

  if (!settings) {
    settings = await createInitialSettings();
    await storageSet({ [STORAGE_KEY]: settings });
    return settings;
  }

  const normalized = await normalizeSettings(settings);
  if (JSON.stringify(normalized) !== JSON.stringify(settings)) {
    await storageSet({ [STORAGE_KEY]: normalized });
  }
  return normalized;
}

async function createInitialSettings(existingDevice) {
  const defaults = await getDefaultConfig();
  const deviceId = existingDevice?.deviceId || createDeviceId();
  const browserType = detectBrowserType();
  const generatedSn = buildGeneratedSn(deviceId, browserType);

  return {
    version: 1,
    mode: defaults.defaultMode === "operation" ? "operation" : "client",
    operationSn: defaults.operationSn || "device001",
    deviceId,
    browserType,
    generatedSn,
    defaultClientName: buildDefaultClientName(defaults.clientNamePrefix, browserType, deviceId),
    domainPathSns: {},
    paths: defaults.paths.map((item, index) => ({
      id: createEntryId(item.path, index),
      path: normalizePath(item.path),
      type: String(item.type ?? "")
    }))
  };
}

async function normalizeSettings(settings) {
  const defaults = await getDefaultConfig();
  const deviceId = settings.deviceId || createDeviceId();
  const browserType = settings.browserType || detectBrowserType();
  const generatedSn = normalizeGeneratedSn(settings.generatedSn, deviceId, browserType);
  const paths = Array.isArray(settings.paths) ? settings.paths : [];
  const fallbackClientName = buildDefaultClientName(defaults.clientNamePrefix, browserType, deviceId);
  const domainPathSns = normalizeDomainPathSns(settings.domainPathSns);

  return {
    version: 1,
    mode: settings.mode === "operation" ? "operation" : "client",
    operationSn: stringOr(settings.operationSn, defaults.operationSn || "device001"),
    deviceId,
    browserType,
    generatedSn,
    defaultClientName:
      settings.defaultClientName === undefined || settings.defaultClientName === null
        ? fallbackClientName
        : String(settings.defaultClientName).trim(),
    domainPathSns,
    paths: paths.map((item, index) => ({
      id: item.id || createEntryId(item.path, index),
      path: normalizePath(item.path),
      type: String(item.type ?? "").trim()
    }))
  };
}

async function getDefaultConfig() {
  if (!defaultConfigPromise) {
    defaultConfigPromise = fetch(chrome.runtime.getURL("config/defaults.json"))
      .then((response) => response.json())
      .catch(() => ({
        defaultMode: "client",
        operationSn: "device001",
        clientNamePrefix: "POS License Client",
        paths: [
          { path: "/kpos/front/myhome.html", type: "0" },
          { path: "/kpos/emenu/index.html", type: "1" },
          { path: "/kpos/kiosklite", type: "14" }
        ]
      }));
  }
  return defaultConfigPromise;
}

async function saveSettings(draft) {
  const current = await getSettings();
  const next = await normalizeSettings({
    ...draft,
    deviceId: current.deviceId,
    browserType: current.browserType,
    generatedSn: current.generatedSn,
    domainPathSns: current.domainPathSns,
    defaultClientName: draft?.defaultClientName ?? current.defaultClientName
  });
  const errors = validateSettings(next);

  if (errors.length) {
    return { ok: false, error: errors.join("\n") };
  }

  settingsPromise = Promise.resolve(next);
  await storageSet({ [STORAGE_KEY]: next });
  await clearPathHeaderRules();
  await refreshOpenTabs(next);
  return { ok: true, settings: next };
}

async function resetSettings() {
  const current = await getSettings();
  const existingDevice = isShortDeviceId(current.deviceId) ? { deviceId: current.deviceId } : undefined;
  const next = await createInitialSettings(existingDevice);

  settingsPromise = Promise.resolve(next);
  await storageSet({ [STORAGE_KEY]: next });
  await clearPathHeaderRules();
  await refreshOpenTabs(next);
  return { ok: true, settings: next };
}

function validateSettings(settings) {
  const errors = [];
  const seenPaths = new Set();

  if (!["client", "operation"].includes(settings.mode)) {
    errors.push("模式必须是客户端模式或运维模式。");
  }

  if (settings.mode === "operation" && !settings.operationSn.trim()) {
    errors.push("运维模式 SN 不能为空。");
  }
  if (settings.mode === "operation" && settings.operationSn.includes("_")) {
    errors.push("运维模式 SN 不能包含下划线。");
  }

  if (!settings.defaultClientName.trim()) {
    errors.push("默认设备名称不能为空。");
  }

  if (!settings.generatedSn.trim()) {
    errors.push("默认 SN 不能为空。");
  }
  if (settings.generatedSn.includes("_")) {
    errors.push("默认 SN 不能包含下划线。");
  }

  if (!settings.paths.length) {
    errors.push("至少需要配置一个可激活插件的 path。");
  }

  settings.paths.forEach((entry, index) => {
    const row = `第 ${index + 1} 行`;
    if (!entry.path || !entry.path.startsWith("/")) {
      errors.push(`${row} path 必须以 / 开头。`);
    }
    if (seenPaths.has(entry.path)) {
      errors.push(`${row} path 与其他配置重复。`);
    }
    seenPaths.add(entry.path);
    if (!/^\d+$/.test(entry.type)) {
      errors.push(`${row} type 必须是数字。`);
    }
  });

  return errors;
}

async function scheduleNavigationCheck(tabId, url) {
  if (isExtensionUrl(url)) {
    return;
  }

  const parsedUrl = tryParseUrl(url);
  if (!parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) {
    await deactivateTab(tabId);
    return;
  }

  const key = `${url}`;
  const last = lastNavigationChecks.get(tabId);
  if (last?.key === key && Date.now() - last.at < 750) {
    return;
  }

  lastNavigationChecks.set(tabId, { key, at: Date.now() });
  await handleNavigation(tabId, parsedUrl.href);
}

async function handleNavigation(tabId, url) {
  const settings = await getSettings();
  const entry = findPathEntry(url, settings);
  const parsedUrl = tryParseUrl(url);

  if (!entry || !parsedUrl) {
    await deactivateTab(tabId);
    return;
  }

  const headerConfig = getHeaderConfig(settings, entry, parsedUrl);
  if (!headerConfig.type || !headerConfig.sn) {
    await deactivateTab(tabId);
    return;
  }

  if (settings.mode === "operation") {
    await activateTab(tabId, url, entry, headerConfig, settings.mode);
    return;
  }

  const overview = await fetchOverview(parsedUrl.origin, headerConfig);
  if (overview.bound) {
    await updateDomainPathSn(settings, parsedUrl, entry, headerConfig.sn);
    await activateTab(tabId, url, entry, headerConfig, settings.mode, overview.client);
    return;
  }

  await deactivateTab(tabId);
  await openRegistrationGate(tabId, url, entry.id, overview.message || "设备未注册或授权检测失败。");
}

async function fetchOverview(origin, headerConfig) {
  const url = new URL(OVERVIEW_PATH, origin);
  url.searchParams.set("sn", headerConfig.sn);
  url.searchParams.set("type", headerConfig.type);

  try {
    const response = await fetch(url.href, {
      credentials: "include",
      cache: "no-store"
    });
    const body = await safeJson(response);
    const data = body?.data || {};
    const success = response.ok && (body?.code === 0 || body?.code === undefined);

    return {
      ok: success,
      httpStatus: response.status,
      body,
      bound: success && data.bound === true,
      client: normalizeOverviewClient(data.client),
      areas: Array.isArray(data.areas) ? data.areas : [],
      message: success ? body?.msg : body?.msg || `授权检测失败：HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      body: null,
      bound: false,
      client: null,
      areas: [],
      message: error.message || "授权检测接口异常。"
    };
  }
}

async function fetchRegister(origin, payload) {
  const response = await fetch(new URL(REGISTER_PATH, origin).href, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await safeJson(response);

  return {
    ok: response.status === 200 && (body?.code === 0 || body?.code === undefined),
    httpStatus: response.status,
    body,
    message: body?.msg || `注册失败：HTTP ${response.status}`
  };
}

async function fetchUnbind(origin, sn, type) {
  const response = await fetch(new URL(UNBIND_PATH, origin).href, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "X-Client-Sn": sn,
      "X-Client-Type": String(type)
    }
  });
  const body = await safeJson(response);

  return {
    ok: response.ok && (body?.code === 0 || body?.code === undefined),
    httpStatus: response.status,
    body,
    message: body?.msg || `解绑失败：HTTP ${response.status}`
  };
}

async function prepareRegistration(targetUrl, entryId, reason) {
  const settings = await getSettings();
  const entry = getEntryById(settings, entryId);
  const parsedUrl = tryParseUrl(targetUrl);

  if (!entry || !parsedUrl) {
    return { ok: false, error: "注册上下文无效，请从目标页面重新进入。" };
  }

  const headerConfig = getHeaderConfig(settings, entry, parsedUrl);
  const overview = await fetchOverview(parsedUrl.origin, headerConfig);
  if (overview.bound) {
    await updateDomainPathSn(settings, parsedUrl, entry, headerConfig.sn);
  }
  return {
    ok: true,
    targetUrl: parsedUrl.href,
    entryId: entry.id,
    path: entry.path,
    sn: headerConfig.sn,
    type: entry.type,
    defaultClientName: settings.defaultClientName,
    areas: overview.areas,
    bound: overview.bound,
    reason: reason || overview.message || "",
    overviewMessage: overview.message || ""
  };
}

async function registerClient({ targetUrl, entryId, clientName, sn, areaId, tabId }) {
  const parsedUrl = tryParseUrl(targetUrl);
  if (!parsedUrl || !tabId) {
    return { ok: false, error: "注册上下文无效。" };
  }

  const settings = await getSettings();
  const entry = getEntryById(settings, entryId);
  if (!entry) {
    return { ok: false, error: "未找到当前 path 配置。" };
  }

  const normalizedSn = String(sn || "").trim();
  const normalizedClientName = String(clientName || "").trim();

  if (!normalizedClientName) {
    return { ok: false, error: "设备名称不能为空。" };
  }
  if (!normalizedSn) {
    return { ok: false, error: "设备序列号不能为空。" };
  }

  if (normalizedSn.includes("_")) {
    return { ok: false, error: "设备序列号不能包含下划线。" };
  }

  const payload = {
    sn: normalizedSn,
    clientName: normalizedClientName,
    type: Number(entry.type)
  };

  if (areaId !== "" && areaId !== null && areaId !== undefined) {
    payload.areaId = Number(areaId);
  }

  const result = await fetchRegister(parsedUrl.origin, payload);
  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  const registeredSn = String(result.body?.data?.sn || normalizedSn).trim();
  const next = await updateDomainPathSn(settings, parsedUrl, entry, registeredSn);
  const updatedEntry = getEntryById(next, entry.id) || entry;
  await clearPathHeaderRules();
  await activateTab(
    tabId,
    parsedUrl.href,
    updatedEntry,
    getHeaderConfig(next, updatedEntry, parsedUrl),
    next.mode,
    result.body?.data || null
  );

  return {
    ok: true,
    targetUrl: parsedUrl.href,
    client: result.body?.data || null
  };
}

async function connectRegistrationSn({ targetUrl, entryId, sn, tabId }) {
  const parsedUrl = tryParseUrl(targetUrl);
  if (!parsedUrl || !tabId) {
    return { ok: false, error: "连接上下文无效。" };
  }

  const settings = await getSettings();
  const entry = getEntryById(settings, entryId);
  if (!entry) {
    return { ok: false, error: "未找到当前 path 配置。" };
  }

  const normalizedSn = String(sn || "").trim();
  if (!normalizedSn) {
    return { ok: false, error: "设备序列号不能为空。" };
  }
  if (normalizedSn.includes("_")) {
    return { ok: false, error: "设备序列号不能包含下划线。" };
  }

  const overview = await fetchOverview(parsedUrl.origin, {
    sn: normalizedSn,
    type: String(entry.type ?? "").trim()
  });

  if (!overview.ok) {
    return { ok: false, error: overview.message || "连接失败，请检查 SN 后重试。" };
  }
  if (!overview.bound) {
    return { ok: false, error: "当前 SN 未绑定该类型，无法连接。" };
  }

  const connectedSn = String(overview.client?.sn || normalizedSn).trim();
  const next = await updateDomainPathSn(settings, parsedUrl, entry, connectedSn);
  const updatedEntry = getEntryById(next, entry.id) || entry;
  await clearPathHeaderRules();
  await activateTab(
    tabId,
    parsedUrl.href,
    updatedEntry,
    getHeaderConfig(next, updatedEntry, parsedUrl),
    next.mode,
    overview.client
  );

  return {
    ok: true,
    targetUrl: parsedUrl.href,
    client: overview.client
  };
}

async function resumeTarget(targetUrl, entryId, tabId) {
  const parsedUrl = tryParseUrl(targetUrl);
  if (!parsedUrl || !tabId) {
    return { ok: false, error: "无法进入目标页面。" };
  }

  const settings = await getSettings();
  const entry = getEntryById(settings, entryId);
  if (!entry) {
    return { ok: false, error: "未找到当前 path 配置。" };
  }

  await activateTab(tabId, parsedUrl.href, entry, getHeaderConfig(settings, entry, parsedUrl), settings.mode);
  return { ok: true, targetUrl: parsedUrl.href };
}

async function unbindClient(tabId) {
  if (!tabId) {
    return { ok: false, error: "未找到当前标签页。" };
  }

  const tab = await tabsGet(tabId);
  const parsedUrl = tryParseUrl(tab?.url);
  const active = activeTabs.get(tabId);

  if (!parsedUrl || !active) {
    return { ok: false, error: "当前页面未激活 POS License 插件。" };
  }

  const result = await fetchUnbind(parsedUrl.origin, active.sn, active.type);
  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  await deactivateTab(tabId);
  return { ok: true, message: "解绑成功。" };
}

async function handleAuthorizationFailure(sender, message) {
  const tabId = sender.tab?.id;
  if (!tabId) {
    return { ok: false, error: "无法定位当前标签页。" };
  }

  if (message.httpStatus !== 401 || message.code !== UNAUTHORIZED_CODE) {
    return { ok: true, ignored: true };
  }

  await redirectActiveTabToRegistration(tabId, "客户端授权失效，需要重新注册。");
  return { ok: true };
}

async function redirectActiveTabToRegistration(tabId, reason) {
  const tab = await tabsGet(tabId);
  const url = tab?.url;
  if (!url || isExtensionUrl(url)) {
    return;
  }

  const settings = await getSettings();
  const active = activeTabs.get(tabId);
  const entry = active ? getEntryById(settings, active.entryId) : findPathEntry(url, settings);
  if (!entry || settings.mode !== "client") {
    return;
  }

  await deactivateTab(tabId);
  await openRegistrationGate(tabId, url, entry.id, reason);
}

async function openRegistrationGate(tabId, targetUrl, entryId, reason) {
  const registrationUrl = new URL(chrome.runtime.getURL("src/register.html"));
  registrationUrl.searchParams.set("target", targetUrl);
  registrationUrl.searchParams.set("entryId", entryId);
  if (reason) {
    registrationUrl.searchParams.set("reason", reason);
  }
  await tabsUpdate(tabId, { url: registrationUrl.href });
}

async function getPopupStatus(tabId) {
  if (!tabId) {
    return { ok: false, error: "未找到当前标签页。" };
  }

  const settings = await getSettings();
  const tab = await tabsGet(tabId);
  const entry = tab?.url ? findPathEntry(tab.url, settings) : null;
  const active = activeTabs.get(tabId);
  const headerConfig = entry ? getHeaderConfig(settings, entry, tab.url) : null;
  const isActive = Boolean(entry && active && active.entryId === entry.id);
  const client = isActive ? active.client : null;

  return {
    ok: true,
    mode: settings.mode,
    matched: Boolean(entry),
    active: isActive,
    path: entry?.path || "",
    clientName: client?.clientName || "",
    sn: isActive ? active.sn || headerConfig?.sn || "" : "",
    type: isActive ? active.type || headerConfig?.type || "" : "",
    areaName: client?.areaName || "",
    targetUrl: tab?.url || ""
  };
}

async function refreshOpenTabs(settings) {
  const tabs = await tabsQuery({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url || isExtensionUrl(tab.url)) {
        return;
      }
      const entry = findPathEntry(tab.url, settings);
      if (!entry) {
        await deactivateTab(tab.id);
        return;
      }
      if (settings.mode === "operation") {
        await activateTab(tab.id, tab.url, entry, getHeaderConfig(settings, entry, tab.url), settings.mode);
        return;
      }
      if (activeTabs.has(tab.id)) {
        const active = activeTabs.get(tab.id);
        const headerConfig = getHeaderConfig(settings, entry, tab.url);
        const client = active.sn === headerConfig.sn && active.type === headerConfig.type ? active.client : null;
        await activateTab(tab.id, tab.url, entry, headerConfig, settings.mode, client);
      }
    })
  );
}

async function scanOpenTabsForMatches(settings) {
  const tabs = await tabsQuery({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url || isExtensionUrl(tab.url)) {
        return;
      }
      if (!findPathEntry(tab.url, settings)) {
        await deactivateTab(tab.id);
        return;
      }
      await handleNavigation(tab.id, tab.url);
    })
  );
}

async function activateTab(tabId, url, entry, headerConfig, mode, client = null) {
  activeTabs.set(tabId, {
    entryId: entry.id,
    path: entry.path,
    sn: headerConfig.sn,
    type: headerConfig.type,
    client: normalizeOverviewClient(client),
    mode,
    targetUrl: url,
    activatedAt: Date.now()
  });

  await updateSessionRules({
    removeRuleIds: [sessionRuleId(tabId)],
    addRules: [
      {
        id: sessionRuleId(tabId),
        priority: 1000,
        action: {
          type: "modifyHeaders",
          requestHeaders: buildHeaderMutations(headerConfig.sn, headerConfig.type)
        },
        condition: {
          regexFilter: buildApiRegex(),
          tabIds: [tabId],
          resourceTypes: RESOURCE_TYPES
        }
      }
    ]
  });
}

async function deactivateTab(tabId) {
  activeTabs.delete(tabId);
  await removeSessionRule(tabId);
}

async function removeSessionRule(tabId) {
  await updateSessionRules({ removeRuleIds: [sessionRuleId(tabId)] });
}

async function clearPathHeaderRules() {
  const existingRules = await getDynamicRules();
  const staleRuleIds = existingRules
    .map((rule) => rule.id)
    .filter((id) => id >= PATH_RULE_BASE && id < PATH_RULE_BASE + PATH_RULE_LIMIT);

  await updateDynamicRules({
    removeRuleIds: staleRuleIds
  });
}

function buildHeaderMutations(sn, type) {
  return [
    {
      header: "X-Client-Sn",
      operation: "set",
      value: String(sn)
    },
    {
      header: "X-Client-Type",
      operation: "set",
      value: String(type)
    }
  ];
}

function getHeaderConfig(settings, entry, url) {
  const parsedUrl = typeof url === "string" ? tryParseUrl(url) : url;
  return {
    sn: settings.mode === "operation" ? settings.operationSn || "device001" : getDomainPathSn(settings, parsedUrl, entry),
    type: String(entry.type ?? "").trim()
  };
}

function getDomainPathSn(settings, parsedUrl, entry) {
  const key = getDomainPathKey(parsedUrl, entry);
  const rememberedSn = key ? settings.domainPathSns?.[key] : "";
  return String(rememberedSn || settings.generatedSn || "").trim();
}

function getDomainPathKey(parsedUrl, entry) {
  const host = String(parsedUrl?.host || "").toLowerCase();
  const path = normalizePath(entry?.path);
  return host && path ? `${host}${path}` : "";
}

async function updateDomainPathSn(settings, parsedUrl, entry, sn) {
  const key = getDomainPathKey(parsedUrl, entry);
  const normalizedSn = String(sn || "").trim();
  if (!key || !normalizedSn || settings.mode !== "client") {
    return settings;
  }
  if (settings.domainPathSns?.[key] === normalizedSn) {
    return settings;
  }

  const next = {
    ...settings,
    domainPathSns: {
      ...(settings.domainPathSns || {}),
      [key]: normalizedSn
    }
  };
  settingsPromise = Promise.resolve(next);
  await storageSet({ [STORAGE_KEY]: next });
  return next;
}

function normalizeOverviewClient(client) {
  if (!client || typeof client !== "object") {
    return null;
  }

  return {
    clientName: String(client.clientName ?? "").trim(),
    sn: String(client.sn ?? "").trim(),
    typeName: String(client.typeName ?? "").trim(),
    areaName: String(client.areaName ?? "").trim()
  };
}

function findPathEntry(url, settings) {
  const parsed = tryParseUrl(url);
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    return null;
  }

  const pathname = parsed.pathname;
  return [...settings.paths]
    .sort((a, b) => b.path.length - a.path.length)
    .find((entry) => pathMatches(pathname, entry.path)) || null;
}

function pathMatches(pathname, configuredPath) {
  const normalized = normalizePath(configuredPath);
  if (pathname === normalized) {
    return true;
  }
  if (normalized.endsWith("/")) {
    return pathname.startsWith(normalized);
  }
  return pathname.startsWith(`${normalized}/`);
}

function buildApiRegex() {
  return `^https?://[^/]+${escapeRegex(API_PATH_PREFIX)}(?:[/?#].*)?$`;
}

function normalizePath(path) {
  const trimmed = String(path || "").trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeDomainPathSns(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, sn]) => [String(key || "").trim(), String(sn || "").trim()])
      .filter(([key, sn]) => key && sn)
  );
}

function getEntryById(settings, entryId) {
  return settings.paths.find((entry) => entry.id === entryId) || null;
}

function createEntryId(path, index) {
  const source = `${path || "path"}:${index}:${Math.random().toString(36).slice(2)}`;
  return `path-${simpleHash(source)}`;
}

function createDeviceId() {
  if (crypto.getRandomValues) {
    return createRandomDeviceId();
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    .replace(/[^A-Za-z0-9]/g, "")
    .padEnd(DEVICE_ID_LENGTH, "0")
    .slice(0, DEVICE_ID_LENGTH);
}

function createRandomDeviceId() {
  const chars = [];
  const maxByte = Math.floor(256 / DEVICE_ID_ALPHABET.length) * DEVICE_ID_ALPHABET.length;

  while (chars.length < DEVICE_ID_LENGTH) {
    const bytes = new Uint8Array(DEVICE_ID_LENGTH - chars.length);
    crypto.getRandomValues(bytes);

    bytes.forEach((byte) => {
      if (byte < maxByte && chars.length < DEVICE_ID_LENGTH) {
        chars.push(DEVICE_ID_ALPHABET[byte % DEVICE_ID_ALPHABET.length]);
      }
    });
  }

  return chars.join("");
}

function isShortDeviceId(deviceId) {
  return SHORT_DEVICE_ID_PATTERN.test(String(deviceId || ""));
}

function detectBrowserType() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("edg/")) {
    return "edge";
  }
  if (ua.includes("chrome/") || ua.includes("chromium/")) {
    return "chrome";
  }
  return "browser";
}

function buildGeneratedSn(deviceId, browserType) {
  return `B-${deviceId}-${browserCode(browserType)}`;
}

function normalizeGeneratedSn(value, deviceId, browserType) {
  const generated = buildGeneratedSn(deviceId, browserType);
  if (value === undefined || value === null) {
    return generated;
  }

  const normalized = String(value).trim();
  return normalized === buildLegacyGeneratedSn(deviceId, browserType) ? generated : normalized;
}

function buildLegacyGeneratedSn(deviceId, browserType) {
  return `B-${deviceId}-${browserType}`;
}

function browserCode(browserType) {
  switch (browserType) {
    case "edge":
      return "e";
    case "chrome":
      return "c";
    default:
      return "b";
  }
}

function buildDefaultClientName(prefix, browserType, deviceId) {
  return `${browserType}-${deviceId}`;
}

function simpleHash(source) {
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tryParseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isExtensionUrl(url) {
  return String(url || "").startsWith(chrome.runtime.getURL(""));
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { msg: text };
  }
}

function stringOr(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function sessionRuleId(tabId) {
  return SESSION_RULE_BASE + tabId;
}

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, resolve);
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function updateSessionRules(options) {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.updateSessionRules(options, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function updateDynamicRules(options) {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.updateDynamicRules(options, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function getDynamicRules() {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(rules || []);
    });
  });
}

function tabsGet(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}

function tabsUpdate(tabId, properties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, properties, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}

function tabsQuery(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs || []);
    });
  });
}

function logError(error) {
  console.error("[POS License]", error);
}
