"use strict";

const PTA_URL_PATTERN = /^https:\/\/(?:www\.)?pintia\.cn(?:\/|$)/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setActionStatus(tabId, text, color, title) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setTitle({ tabId, title });
}

async function waitForPanel(tabId) {
  let state = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        mounted: Boolean(document.querySelector("#pta-companion-host")),
        marker: Boolean(window.__PTA_COMPANION_CONTENT_V1__),
        protocol: Boolean(globalThis.PTACompanionProtocol),
        readyState: document.readyState,
        path: window.location.pathname
      })
    });
    state = probe?.result || null;
    if (state?.mounted) return;
    await sleep(100);
  }
  throw new Error("PTA Companion panel was not mounted: " + JSON.stringify(state));
}

async function injectCompanion(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/protocol.js", "src/page-bridge.js"],
    world: "MAIN"
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/protocol.js", "src/content.js"]
  });
  await waitForPanel(tabId);
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  if (tab.url && !PTA_URL_PATTERN.test(tab.url)) {
    void setActionStatus(tab.id, "!", "#b42318", "Open a PTA exam page first");
    return;
  }

  void injectCompanion(tab.id)
    .then(() => setActionStatus(tab.id, "ON", "#0f766e", "PTA Companion is running"))
    .catch(async (error) => {
      console.error("PTA Companion injection failed:", error);
      await setActionStatus(
        tab.id,
        "!",
        "#b42318",
        "Startup failed. Refresh the PTA page and try again."
      );
    });
});
