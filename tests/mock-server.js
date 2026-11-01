"use strict";

const http = require("node:http");

const PROBLEM_SET_ID = "2101554732800954368";
const EXAM_ID = "2104393867498209280";
const PROBLEM_SET_PROBLEM_ID = "2101554733056802824";

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json;charset=UTF-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

function createMockServer(options) {
  const allowSubmitExam = options?.allowSubmitExam !== false;
  const state = {
    submissionPosts: 0,
    draftPosts: 0,
    pollCalls: 0,
    lastSubmission: null,
    lastDraft: null
  };

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const path = url.pathname;

    if (request.method === "GET" && path === "/__state") {
      json(response, 200, state);
      return;
    }

    if (request.method === "POST" && path === "/__reset") {
      state.submissionPosts = 0;
      state.draftPosts = 0;
      state.pollCalls = 0;
      state.lastSubmission = null;
      state.lastDraft = null;
      json(response, 200, { ok: true });
      return;
    }

    if (
      request.method === "GET" &&
      path === `/problem-sets/${PROBLEM_SET_ID}/exam/problems/type/PROGRAMMING`
    ) {
      const body = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PTA Companion Mock</title>
  <style>
    body { margin: 32px; color: #24313c; font-family: sans-serif; background: #eef2f5; }
    main { max-width: 760px; padding: 24px; border: 1px solid #cbd4dc; border-radius: 8px; background: white; }
    pre { padding: 12px; background: #f4f6f7; border: 1px solid #d8dee4; }
  </style>
</head>
<body>
  <main>
    <h1>Mock PTA Exam Page</h1>
    <p>该页面用于验证 MV3 插件的题目桥接、协议提交和判题轮询。</p>
    <pre>int main(void) { return 0; }</pre>
  </main>
  <script>
    window.mockReady = false;
    Promise.all([
      fetch('/api/problem-sets/${PROBLEM_SET_ID}/exams').then((r) => r.json()),
      fetch('/api/problem-sets/${PROBLEM_SET_ID}/exam-problem-list?exam_id=${EXAM_ID}&problem_type=PROGRAMMING&page=0&limit=100').then((r) => r.json()),
      fetch('/api/problem-sets/${PROBLEM_SET_ID}/exam-problems/${PROBLEM_SET_PROBLEM_ID}').then((r) => r.json()),
      fetch('/api/problem-sets/problems/${PROBLEM_SET_PROBLEM_ID}/exam-draft').then((r) => r.json())
    ]).then(() => { window.mockReady = true; }).catch((error) => {
      window.mockError = String(error);
    });
  </script>
</body>
</html>`;
      response.writeHead(200, {
        "content-type": "text/html;charset=UTF-8",
        "content-length": Buffer.byteLength(body),
        "cache-control": "no-store"
      });
      response.end(body);
      return;
    }

    if (
      request.method === "GET" &&
      path === `/api/problem-sets/${PROBLEM_SET_ID}/exams`
    ) {
      json(response, 200, {
        serverTime: "2026-10-30T15:25:42.240Z",
        exam: {
          id: EXAM_ID,
          problemSetId: PROBLEM_SET_ID,
          status: "PROCESSING",
          ended: false,
          startAt: "2026-10-30T14:00:00.000Z",
          endAt: "2026-11-30T14:00:00.000Z"
        },
        problemSet: {
          id: PROBLEM_SET_ID,
          problemSetConfig: {
            allowSubmitExam,
            autoSave: false,
            forbidPasting: true,
            enableCustomTestData: false,
            hideProgrammingJudgeResponseContents: false,
            compilers: ["GCC", "PYTHON3"]
          }
        },
        status: "PROCESSING",
        permission: { permission: 47 }
      });
      return;
    }

    if (
      request.method === "GET" &&
      path === `/api/problem-sets/${PROBLEM_SET_ID}/exam-problem-list`
    ) {
      json(response, 200, {
        total: 1,
        problemSetProblems: [
          {
            id: PROBLEM_SET_PROBLEM_ID,
            label: "7-1",
            title: "A+B",
            type: "PROGRAMMING",
            score: 20,
            compiler: "NO_COMPILER",
            problemStatus: "PROCESSING"
          }
        ]
      });
      return;
    }

    if (
      request.method === "GET" &&
      path === `/api/problem-sets/${PROBLEM_SET_ID}/exam-problems/${PROBLEM_SET_PROBLEM_ID}`
    ) {
      json(response, 200, {
        problemSetProblem: {
          id: PROBLEM_SET_PROBLEM_ID,
          problemId: "444",
          problemSetId: PROBLEM_SET_ID,
          label: "7-1",
          title: "A+B",
          content:
            "<p>计算两个整数的和。</p><h3>输入格式</h3><p>一行两个整数。</p><pre>1 2</pre>",
          description: "",
          type: "PROGRAMMING",
          score: 20,
          compiler: "NO_COMPILER",
          lastSubmissionId: "0",
          problemConfig: {
            programmingProblemConfig: {
              timeLimit: 400,
              memoryLimit: 65536,
              codeSizeLimit: 16,
              stackSizeLimit: 8192,
              cases: {
                test1: {
                  score: 10,
                  hint: "公开的边界提示",
                  showHint: true,
                  isPublic: true
                },
                test2: {
                  score: 10,
                  hint: "",
                  showHint: false,
                  isPublic: false
                }
              },
              exampleTestDatas: [{ input: "1 2", output: "3" }]
            }
          }
        },
        organization: {},
        examLabel: "Mock Exam"
      });
      return;
    }

    if (
      request.method === "GET" &&
      path === `/api/problem-sets/problems/${PROBLEM_SET_PROBLEM_ID}/exam-draft`
    ) {
      json(response, 200, { answer: {} });
      return;
    }

    if (
      request.method === "GET" &&
      path === `/api/exams/${EXAM_ID}/problem-sets/${PROBLEM_SET_ID}/last-submissions`
    ) {
      json(response, 200, {});
      return;
    }

    if (
      request.method === "GET" &&
      path ===
        `/api/problem-sets/${PROBLEM_SET_ID}:omit/problems/${PROBLEM_SET_PROBLEM_ID}/test1`
    ) {
      json(response, 200, {
        testCase: {
          name: "test1",
          input: { text: "1 2\n", truncated: false, fileName: "" },
          output: { text: "3\n", truncated: false, fileName: "" }
        }
      });
      return;
    }

    if (
      request.method === "POST" &&
      path === `/api/problem-sets/problems/${PROBLEM_SET_PROBLEM_ID}/exam-draft`
    ) {
      state.lastDraft = await readJson(request);
      state.draftPosts += 1;
      json(response, 200, {});
      return;
    }

    if (
      request.method === "POST" &&
      path === `/api/exams/${EXAM_ID}/exam-submissions`
    ) {
      state.lastSubmission = await readJson(request);
      state.submissionPosts += 1;
      state.pollCalls = 0;
      json(response, 200, { submissionId: "9001" });
      return;
    }

    if (
      request.method === "GET" &&
      path === `/api/exams/${EXAM_ID}/submissions/9001`
    ) {
      state.pollCalls += 1;
      if (state.pollCalls === 1) {
        json(response, 200, {
          queued: 2,
          submission: {
            id: "9001",
            status: "WAITING",
            score: 0,
            judgeResponseContents: []
          }
        });
        return;
      }
      json(response, 200, {
        queued: -1,
        publicCases: { "1": false },
        submission: {
          id: "9001",
          status: "COMPILE_ERROR",
          score: 0,
          time: 4,
          memory: 512,
          judgeResponseContents: [
            {
              status: "COMPILE_ERROR",
              score: 0,
              programmingJudgeResponseContent: {
                compilationResult: {
                  success: false,
                  log: "main.c:1:1: error: expected declaration"
                },
                checkerCompilationResult: {},
                testcaseJudgeResults: {}
              }
            }
          ]
        }
      });
      return;
    }

    json(response, 404, {
      error: {
        code: "NOT_FOUND",
        message: "Mock endpoint not found: " + request.method + " " + path
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        port: address.port,
        state,
        close() {
          return new Promise((closeResolve) => server.close(closeResolve));
        }
      });
    });
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
  });
}

module.exports = {
  createMockServer,
  PROBLEM_SET_ID,
  EXAM_ID,
  PROBLEM_SET_PROBLEM_ID
};
