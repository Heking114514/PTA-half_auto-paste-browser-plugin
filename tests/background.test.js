"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "background.js"), "utf8");

function createFixture() {
  let clickHandler = null;
  const calls = [];
  const badges = [];
  const chrome = {
    action: {
      onClicked: {
        addListener(handler) {
          clickHandler = handler;
        }
      },
      async setBadgeBackgroundColor(options) {
        calls.push({ api: "setBadgeBackgroundColor", options });
      },
      async setBadgeText(options) {
        badges.push(options);
      },
      async setTitle(options) {
        calls.push({ api: "setTitle", options });
      }
    },
    scripting: {
      async executeScript(options) {
        calls.push({ api: "executeScript", options });
        if (options.func) {
          return [{
            result: {
              mounted: true,
              marker: true,
              protocol: true,
              readyState: "complete",
              path: "/problem-sets/1/exam/problems/type/7"
            }
          }];
        }
        return [];
      }
    }
  };

  vm.runInNewContext(source, {
    chrome,
    console: { error() {} },
    Promise,
    document: undefined
  });

  return {
    calls,
    badges,
    async click(tab) {
      clickHandler(tab);
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
}

test("toolbar action injects the bridge and controller into a PTA page", async () => {
  const fixture = createFixture();
  await fixture.click({
    id: 42,
    url: "https://pintia.cn/problem-sets/1/exam/problems/type/7"
  });

  const injections = fixture.calls.filter((call) => call.api === "executeScript");
  assert.equal(injections.length, 3);
  assert.deepEqual(Array.from(injections[0].options.files), [
    "src/protocol.js",
    "src/page-bridge.js"
  ]);
  assert.equal(injections[0].options.world, "MAIN");
  assert.deepEqual(Array.from(injections[1].options.files), [
    "src/protocol.js",
    "src/content.js"
  ]);
  assert.equal(injections[2].options.target.tabId, 42);
  assert.equal(fixture.badges.at(-1).text, "ON");
});

test("toolbar action rejects non-PTA pages without injecting", async () => {
  const fixture = createFixture();
  await fixture.click({
    id: 7,
    url: "https://example.com/"
  });

  const injections = fixture.calls.filter((call) => call.api === "executeScript");
  assert.equal(injections.length, 0);
  assert.equal(fixture.badges.at(-1).text, "!");
});
