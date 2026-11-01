"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

function isLocalFile(reference) {
  return /^[A-Za-z0-9_./-]+$/.test(reference) && !reference.startsWith("/");
}

test("uses a valid MV3 manifest with local script files", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "PTA Companion");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest.background, {
    service_worker: "src/background.js"
  });
  assert.equal(fs.existsSync(path.join(root, manifest.background.service_worker)), true);

  for (const entry of manifest.content_scripts) {
    assert.ok(entry.matches.includes("https://pintia.cn/*"));
    assert.equal(entry.run_at, "document_start");
    for (const script of entry.js) {
      assert.equal(isLocalFile(script), true);
      assert.equal(fs.existsSync(path.join(root, script)), true, script);
    }
  }

  for (const iconPath of Object.values(manifest.icons)) {
    assert.equal(isLocalFile(iconPath), true);
    assert.equal(fs.existsSync(path.join(root, iconPath)), true, iconPath);
  }
});

test("injects an isolated controller and a main-world network bridge", () => {
  assert.equal(manifest.content_scripts.length, 2);
  assert.equal(manifest.content_scripts[0].world, "MAIN");
  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/protocol.js",
    "src/page-bridge.js"
  ]);
  assert.equal(manifest.content_scripts[1].world, "ISOLATED");
  assert.deepEqual(manifest.content_scripts[1].js, [
    "src/protocol.js",
    "src/content.js"
  ]);
});

test("mounts the shadow root without Element-only insertion methods", () => {
  const source = fs.readFileSync(path.join(root, "src", "content.js"), "utf8");
  assert.doesNotMatch(source, /shadow\.insertAdjacentHTML/);
  assert.match(source, /shadow\.innerHTML\s*=\s*template\(\)/);
});

test("does not treat allowSubmitExam as a per-submission blocker", () => {
  const source = fs.readFileSync(path.join(root, "src", "content.js"), "utf8");
  assert.doesNotMatch(source, /settings\.allowSubmitExam/);
});

test("injects the companion when the toolbar action is clicked", () => {
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting"]);
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.action.default_title, "Start PTA Companion");

  const source = fs.readFileSync(
    path.join(root, manifest.background.service_worker),
    "utf8"
  );
  assert.match(source, /chrome\.action\.onClicked/);
  assert.match(source, /chrome\.scripting\.executeScript/);
});

test("declares only local, page-scoped web-accessible resources", () => {
  assert.equal(manifest.web_accessible_resources.length, 1);
  const resource = manifest.web_accessible_resources[0];
  assert.deepEqual(resource.resources, ["src/content.css"]);
  assert.equal(fs.existsSync(path.join(root, resource.resources[0])), true);
  assert.ok(resource.matches.every((match) => match.startsWith("https://")));
});

test("avoids remote code and unrelated privileged browser APIs", () => {
  assert.ok(manifest.host_permissions.every((permission) => permission.startsWith("https://")));
  for (const permission of ["tabs", "cookies", "webRequest", "history"]) {
    assert.equal(manifest.permissions.includes(permission), false);
  }

  const scripts = manifest.content_scripts.flatMap((entry) => entry.js);
  scripts.push(manifest.background.service_worker);
  for (const script of scripts) {
    const source = fs.readFileSync(path.join(root, script), "utf8");
    assert.doesNotMatch(source, /<script\s+[^>]*src=["']https?:/i);
    assert.doesNotMatch(source, /eval\s*\(/);
  }
});
