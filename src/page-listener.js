(function installPosLicensePageListener() {
  const PAGE_MESSAGE_SOURCE = "pos-license-page-listener";

  if (window.__posLicensePageListenerInstalled) {
    return;
  }
  window.__posLicensePageListenerInstalled = true;

  patchFetch();
  patchXhr();

  function patchFetch() {
    if (!window.fetch) {
      return;
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      inspectFetchResponse(response);
      return response;
    };
  }

  function inspectFetchResponse(response) {
    if (!response || response.status !== 401) {
      return;
    }

    response
      .clone()
      .json()
      .then((body) => {
        if (body?.code === 40103) {
          notifyUnauthorized(401, body.code);
        }
      })
      .catch(() => {});
  }

  function patchXhr() {
    if (!window.XMLHttpRequest) {
      return;
    }

    const originalOpen = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function patchedOpen(...args) {
      if (!this.__posLicenseUnauthorizedWatcher) {
        this.__posLicenseUnauthorizedWatcher = true;
        this.addEventListener("loadend", () => {
          inspectXhrResponse(this);
        });
      }
      return originalOpen.apply(this, args);
    };
  }

  function inspectXhrResponse(xhr) {
    if (xhr.status !== 401) {
      return;
    }

    const body = parseXhrBody(xhr);
    if (body?.code === 40103) {
      notifyUnauthorized(401, body.code);
    }
  }

  function parseXhrBody(xhr) {
    if (xhr.response && typeof xhr.response === "object") {
      return xhr.response;
    }

    try {
      if (!xhr.responseType || xhr.responseType === "text") {
        return JSON.parse(xhr.responseText || "{}");
      }
    } catch {
      // Non-JSON 401 responses are handled by the background webRequest fallback.
    }

    try {
      if (typeof xhr.response === "string") {
        return JSON.parse(xhr.response || "{}");
      }
    } catch {
      // Non-JSON 401 responses are handled by the background webRequest fallback.
    }

    return null;
  }

  function notifyUnauthorized(httpStatus, code) {
    window.postMessage(
      {
        source: PAGE_MESSAGE_SOURCE,
        type: "authorizationFailed",
        httpStatus,
        code,
        url: window.location.href
      },
      "*"
    );
  }
})();
