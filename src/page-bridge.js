(function installPageBridge() {
  "use strict";

  if (window.__PTA_COMPANION_PAGE_BRIDGE_V1__) return;
  Object.defineProperty(window, "__PTA_COMPANION_PAGE_BRIDGE_V1__", {
    value: true,
    configurable: false,
    enumerable: false
  });

  const protocol = window.PTACompanionProtocol;
  if (!protocol) return;

  const SOURCE = "pta-companion-page";
  const xhrState = new WeakMap();

  function parseJson(text) {
    if (typeof text !== "string" || !text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function readHeader(headers, name) {
    if (!headers) return "";
    try {
      return String(headers.get(name) || "");
    } catch {
      return "";
    }
  }

  function pickForwardHeaders(headers) {
    return {
      "x-lollipop": readHeader(headers, "x-lollipop"),
      "x-marshmallow": readHeader(headers, "x-marshmallow")
    };
  }

  function emit(url, method, headers, status, payload) {
    const classification = protocol.classifyApiUrl(url, window.location.href);
    if (!classification || payload === null) return;

    window.postMessage(
      {
        source: SOURCE,
        type: "api-response",
        payload: {
          url: String(url),
          method: String(method || "GET").toUpperCase(),
          status: Number(status) || 0,
          headers: pickForwardHeaders(headers),
          body: payload,
          classification
        }
      },
      window.location.origin
    );
  }

  const originalFetch = window.fetch;
  window.fetch = function ptaCompanionFetch(input, init) {
    let url = "";
    let method = "GET";
    let headers = new Headers();

    try {
      if (typeof Request !== "undefined" && input instanceof Request) {
        url = input.url;
        method = input.method || "GET";
        headers = new Headers(input.headers);
      } else {
        url = String(input);
        method = (init && init.method) || "GET";
      }
      if (init && init.headers) {
        new Headers(init.headers).forEach((value, name) => headers.set(name, value));
      }
    } catch {
      // Request metadata is optional; forwarding must never affect the original request.
    }

    const responsePromise = originalFetch.apply(this, arguments);
    const relevant = protocol.isRelevantApiUrl(url, window.location.href);
    if (!relevant) return responsePromise;

    responsePromise
      .then((response) => {
        response
          .clone()
          .text()
          .then((text) => emit(url, method, headers, response.status, parseJson(text)))
          .catch(() => {});
      })
      .catch(() => {});

    return responsePromise;
  };

  const xhrPrototype = XMLHttpRequest.prototype;
  const originalOpen = xhrPrototype.open;
  const originalSetRequestHeader = xhrPrototype.setRequestHeader;
  const originalSend = xhrPrototype.send;

  xhrPrototype.open = function ptaCompanionOpen(method, url) {
    xhrState.set(this, {
      method: String(method || "GET").toUpperCase(),
      url: String(url),
      headers: new Headers(),
      listening: false
    });
    return originalOpen.apply(this, arguments);
  };

  xhrPrototype.setRequestHeader = function ptaCompanionSetRequestHeader(name, value) {
    const state = xhrState.get(this);
    if (state) {
      try {
        state.headers.set(name, value);
      } catch {
        // Ignore malformed headers and continue with the original implementation.
      }
    }
    return originalSetRequestHeader.apply(this, arguments);
  };

  xhrPrototype.send = function ptaCompanionSend() {
    const xhr = this;
    const state = xhrState.get(xhr);
    if (
      state &&
      !state.listening &&
      protocol.isRelevantApiUrl(state.url, window.location.href)
    ) {
      state.listening = true;
      xhr.addEventListener("loadend", function onLoadEnd() {
        let text = "";
        try {
          if (xhr.responseType === "" || xhr.responseType === "text") {
            text = xhr.responseText;
          }
        } catch {
          return;
        }
        emit(state.url, state.method, state.headers, xhr.status, parseJson(text));
      });
    }
    return originalSend.apply(this, arguments);
  };
})();
