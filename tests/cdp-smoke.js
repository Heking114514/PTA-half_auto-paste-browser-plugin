"use strict";

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { createMockServer, PROBLEM_SET_ID } = require("./mock-server.js");

const root = path.resolve(__dirname, "..");
const artifacts = path.join(__dirname, "artifacts");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pta-companion-smoke-"));
const extensionPath = path.join(runtimeRoot, "extension");
const profilePath = path.join(runtimeRoot, "profile");

let browser = null;
let client = null;
let mock = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findBrowser() {
  if (process.env.PTA_TEST_BROWSER) return process.env.PTA_TEST_BROWSER;
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("No Edge or Chrome executable found.");
  return found;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function prepareExtension() {
  fs.cpSync(root, extensionPath, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source);
      return !relative.startsWith("tests\\artifacts") && !relative.startsWith(".runtime");
    }
  });

  const manifestPath = path.join(extensionPath, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const localMatch = "http://127.0.0.1/*";
  manifest.name = "PTA Companion Test";
  manifest.host_permissions = [localMatch];
  for (const entry of manifest.content_scripts) {
    entry.matches = [localMatch];
  }
  for (const entry of manifest.web_accessible_resources) {
    entry.matches = [localMatch];
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

async function waitForJsonList(endpoint, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return await response.json();
      lastError = new Error("CDP HTTP " + response.status);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error("CDP endpoint did not become ready: " + (lastError?.message || endpoint));
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws = new WebSocket(webSocketUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      if (message.method) {
        for (const handler of this.handlers.get(message.method) || []) {
          handler(message.params);
        }
      }
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // Already closed.
    }
  }
}

async function evaluate(client, expression, userGesture) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: Boolean(userGesture)
  });
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text ||
        "Runtime evaluation failed"
    );
  }
  return response.result ? response.result.value : undefined;
}

async function waitForValue(client, expression, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await evaluate(client, expression);
    if (predicate(lastValue)) return lastValue;
    await sleep(200);
  }
  throw new Error("Timed out waiting for " + label + ". Last value: " + JSON.stringify(lastValue));
}

async function killBrowserTree() {
  if (!browser || !browser.pid) return;
  spawnSync("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true
  });
  browser = null;
}

async function run() {
  fs.mkdirSync(artifacts, { recursive: true });
  prepareExtension();
  mock = await createMockServer({ allowSubmitExam: false });
  const debugPort = await freePort();
  const browserPath = findBrowser();
  const pageUrl = `http://127.0.0.1:${mock.port}/problem-sets/${PROBLEM_SET_ID}/exam/problems/type/PROGRAMMING`;

  browser = spawn(
    browserPath,
    [
      `--user-data-dir=${profilePath}`,
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--remote-debugging-port=${debugPort}`,
      "--remote-allow-origins=*",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-mode",
      "--disable-sync",
      "--disable-background-networking",
      "--window-size=1440,1000",
      pageUrl
    ],
    {
      stdio: "ignore",
      windowsHide: true
    }
  );

  browser.once("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error("Browser exited with code", code);
    }
  });

  const targets = await waitForJsonList(`http://127.0.0.1:${debugPort}/json/list`, 20000);
  const pageTarget = targets.find(
    (target) => target.type === "page" && target.url.startsWith(`http://127.0.0.1:${mock.port}`)
  );
  if (!pageTarget) throw new Error("Mock page target not found in CDP target list.");

  client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.open();
  client.on("Page.javascriptDialogOpening", () => {
    client.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.bringToFront");

  await waitForValue(
    client,
    `(() => {
      const host = document.querySelector('#pta-companion-host');
      return {
        host: Boolean(host),
        shadow: Boolean(host && host.shadowRoot),
        ready: document.readyState,
        mockReady: Boolean(window.mockReady),
        mockError: window.mockError || ''
      };
    })()`,
    (value) => value && value.host && value.shadow,
    20000,
    "extension panel injection"
  );

  const initial = await waitForValue(
    client,
    `(() => {
      const shadow = document.querySelector('#pta-companion-host').shadowRoot;
      return {
        title: shadow.getElementById('problem-title').textContent,
        body: shadow.getElementById('question-body').textContent.replace(/\\s+/g, ' ').trim(),
        policy: shadow.getElementById('policy').textContent,
        submitDisabled: shadow.getElementById('submit').disabled,
        compiler: shadow.getElementById('compiler').value
      };
    })()`,
    (value) => value && value.title === "A+B" && value.body.includes("计算两个整数"),
    15000,
    "automatic problem detection"
  );

  if (initial.policy) {
    throw new Error(
      "forbidPasting=true and allowSubmitExam=false should not add policy messages."
    );
  }

  const codeState = await evaluate(
    client,
    `(() => {
      const shadow = document.querySelector('#pta-companion-host').shadowRoot;
      const code = shadow.getElementById('code');

      const pastedText = new DataTransfer();
      pastedText.setData('text/plain', 'long pasted code');
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(paste, 'clipboardData', { value: pastedText });
      code.dispatchEvent(paste);

      const droppedText = new DataTransfer();
      droppedText.setData('text/plain', 'long dropped code');
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: droppedText });
      code.dispatchEvent(drop);

      code.value = '#include <stdio.h>\\nint main(void){int a,b;scanf("%d%d",&a,&b);printf("%d\\\\n",a+b);return 0;}';
      code.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      return {
        pastePrevented: paste.defaultPrevented,
        dropPrevented: drop.defaultPrevented,
        noticeHidden: shadow.getElementById('notice').hidden,
        notice: shadow.getElementById('notice').textContent,
        codeDisabled: code.disabled,
        submitDisabled: shadow.getElementById('submit').disabled,
        submitTitle: shadow.getElementById('submit').title
      };
    })()`
  );
  if (codeState.pastePrevented || codeState.dropPrevented) {
    throw new Error("forbidPasting=true unexpectedly blocked pasting or dropping.");
  }
  if (!codeState.noticeHidden || codeState.notice) {
    throw new Error("forbidPasting=true unexpectedly showed a restriction notice.");
  }
  if (codeState.codeDisabled || codeState.submitDisabled) {
    throw new Error(
      "allowSubmitExam=false must not block ordinary submission: " +
        JSON.stringify(codeState)
    );
  }

  await evaluate(
    client,
    `document.querySelector('#pta-companion-host').shadowRoot.getElementById('submit').click()`,
    true
  );

  const finalState = await waitForValue(
    client,
    `(() => {
      const shadow = document.querySelector('#pta-companion-host').shadowRoot;
      return {
        result: shadow.getElementById('result-output').textContent,
        badge: shadow.getElementById('result-badge').textContent,
        code: shadow.getElementById('code').value,
        restoreHidden: shadow.getElementById('restore-code').hidden
      };
    })()`,
    (value) => value && value.result.includes("COMPILE_ERROR"),
    12000,
    "compile error result"
  );

  if (finalState.code !== "") throw new Error("Failed judge did not clear the answer area.");
  if (finalState.restoreHidden) throw new Error("Restore action is not available after auto-clear.");
  if (!finalState.result.includes("expected declaration")) {
    throw new Error("Compilation log was not rendered.");
  }

  const serverState = await fetch(`http://127.0.0.1:${mock.port}/__state`).then((response) =>
    response.json()
  );
  const submitted = serverState.lastSubmission;
  if (
    serverState.submissionPosts !== 1 ||
    submitted?.problemType !== "PROGRAMMING" ||
    submitted?.details?.[0]?.problemSetProblemId !== "2101554733056802824" ||
    submitted?.details?.[0]?.programmingSubmissionDetail?.compiler !== "GCC"
  ) {
    throw new Error("Observed submission body mismatch: " + JSON.stringify(submitted));
  }
  if (serverState.pollCalls < 2) throw new Error("Judge polling did not reach the terminal response.");

  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  const screenshotPath = path.join(artifacts, "pta-companion-smoke.png");
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        browser: browserPath,
        pageUrl,
        problemTitle: initial.title,
        compiler: initial.compiler,
        submissionPosts: serverState.submissionPosts,
        pollCalls: serverState.pollCalls,
        finalBadge: finalState.badge,
        codeCleared: finalState.code === "",
        screenshot: screenshotPath
      },
      null,
      2
    )
  );
}

(async () => {
  try {
    await run();
  } finally {
    if (client) client.close();
    await killBrowserTree();
    if (mock) await mock.close();
    try {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    } catch {
      // A still-terminating browser can briefly retain profile files on Windows.
    }
  }
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
