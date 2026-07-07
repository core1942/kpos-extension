(function bootstrapPosLicenseContentScript() {
  const PAGE_MESSAGE_SOURCE = "pos-license-page-listener";

  if (window.__posLicenseContentScriptInstalled) {
    return;
  }
  window.__posLicenseContentScriptInstalled = true;

  window.addEventListener("message", handlePageMessage);

  function handlePageMessage(event) {
    if (event.source !== window || event.data?.source !== PAGE_MESSAGE_SOURCE) {
      return;
    }

    if (event.data.type !== "authorizationFailed") {
      return;
    }

    chrome.runtime.sendMessage({
      type: "authorizationFailed",
      httpStatus: event.data.httpStatus,
      code: event.data.code,
      url: event.data.url || window.location.href
    });
  }
})();
