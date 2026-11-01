"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const protocol = require("../src/protocol.js");

test("classifies observed PTA protocol URLs", () => {
  assert.deepEqual(
    protocol.classifyApiUrl(
      "https://pintia.cn/api/problem-sets/2101554732800954368/exam-problems/2101554733056802824"
    ),
    {
      kind: "problem-detail",
      problemSetId: "2101554732800954368",
      problemSetProblemId: "2101554733056802824",
      path: "/api/problem-sets/2101554732800954368/exam-problems/2101554733056802824",
      search: ""
    }
  );

  assert.equal(
    protocol.classifyApiUrl(
      "https://pintia.cn/api/exams/2104393867498209280/exam-submissions"
    ).kind,
    "create-submission"
  );
  assert.equal(
    protocol.classifyApiUrl(
      "https://pintia.cn/api/exams/2104393867498209280/submissions/999"
    ).kind,
    "submission"
  );
  assert.equal(
    protocol.classifyApiUrl(
      "https://pintia.cn/api/problem-sets/problems/2101554733056802824/exam-draft"
    ).kind,
    "exam-draft"
  );
  assert.equal(protocol.classifyApiUrl("https://pintia.cn/api/u/current"), null);
});

test("normalizes problem IDs without losing 64-bit string identity", () => {
  const problem = protocol.normalizeProblem({
    problemSetProblem: {
      id: "2101554733056802824",
      problemId: "444",
      problemSetId: "2101554732800954368",
      label: "7-1",
      title: "测试题",
      content: "<p>题目</p>",
      type: "PROGRAMMING",
      score: 20,
      compiler: "NO_COMPILER",
      problemConfig: {
        programmingProblemConfig: {
          timeLimit: 400,
          memoryLimit: 65536,
          exampleTestDatas: [{ input: "1 2", output: "3" }]
        }
      }
    },
    examLabel: "考试 A"
  });

  assert.equal(problem.id, "2101554733056802824");
  assert.equal(problem.problemSetId, "2101554732800954368");
  assert.equal(problem.examLabel, "考试 A");
  assert.equal(problem.type, "PROGRAMMING");
  assert.equal(problem.config.timeLimit, 400);
  assert.deepEqual(problem.examples, [{ input: "1 2", output: "3" }]);
});

test("normalizes exam settings and compilers", () => {
  const exam = protocol.normalizeExamContext({
    serverTime: "2026-10-30T15:25:42.240Z",
    exam: {
      id: "2104393867498209280",
      problemSetId: "2101554732800954368",
      ended: false,
      status: "PROCESSING"
    },
    problemSet: {
      id: "2101554732800954368",
      problemSetConfig: {
        compilers: ["GCC", "PYTHON3"],
        allowSubmitExam: false,
        forbidPasting: true,
        hideProgrammingJudgeResponseContents: false
      }
    }
  });

  assert.equal(exam.examId, "2104393867498209280");
  assert.equal(exam.problemSetId, "2101554732800954368");
  assert.deepEqual(exam.compilers, ["GCC", "PYTHON3"]);
  assert.equal(exam.settings.allowSubmitExam, false);
  assert.equal(exam.settings.forbidPasting, true);
  assert.equal(exam.settings.hideProgrammingJudgeResponseContents, false);
});

test("builds the exact observed submission body", () => {
  const body = protocol.buildSubmissionBody({
    problemSetProblemId: "2101554733056802824",
    code: "int main(void) { return 0; }",
    compiler: "GCC"
  });
  assert.deepEqual(body, {
    problemType: "PROGRAMMING",
    details: [
      {
        problemId: "0",
        problemSetProblemId: "2101554733056802824",
        programmingSubmissionDetail: {
          program: "int main(void) { return 0; }",
          compiler: "GCC"
        }
      }
    ]
  });
});

test("builds a draft body with a stable client save time", () => {
  const body = protocol.buildDraftBody({
    problemSetProblemId: "2101554733056802824",
    code: "print(1)",
    compiler: "PYTHON3",
    saveAt: "2026-10-30T15:29:51.002Z"
  });
  assert.deepEqual(body, {
    answer: {
      detail: {
        problemId: "0",
        problemSetProblemId: "2101554733056802824",
        customTestData: {
          hasCustomTestData: false,
          content: ""
        },
        programmingSubmissionDetail: {
          compiler: "PYTHON3",
          program: "print(1)"
        }
      },
      saveAt: "2026-10-30T15:29:51.002Z"
    }
  });
});

test("extracts a saved draft without numifying the ID", () => {
  const draft = protocol.extractDraft({
    answer: {
      detail: {
        problemSetProblemId: "2101554733056802824",
        programmingSubmissionDetail: {
          compiler: "GCC",
          program: "int main(){}"
        }
      },
      saveAt: "2026-10-30T15:29:51.002Z"
    }
  });
  assert.deepEqual(draft, {
    program: "int main(){}",
    compiler: "GCC",
    saveAt: "2026-10-30T15:29:51.002Z"
  });
});

test("detects terminal and non-terminal judge states", () => {
  assert.equal(
    protocol.isTerminalJudge({
      queued: 3,
      submission: { status: "WAITING" }
    }),
    false
  );
  assert.equal(
    protocol.isTerminalJudge({
      queued: -1,
      submission: { status: "JUDGING" }
    }),
    false
  );
  assert.equal(
    protocol.isTerminalJudge({
      queued: -1,
      submission: { status: "COMPILE_ERROR" }
    }),
    true
  );
  assert.equal(
    protocol.isTerminalJudge({
      submission: { status: "MULTIPLE_ERROR" }
    }),
    true
  );
  assert.equal(
    protocol.isTerminalJudge({
      submission: { status: "SEGMENTATION_FAULT" }
    }),
    true
  );
  assert.equal(
    protocol.isTerminalJudge({
      queued: -1,
      submission: { status: "REJUDGING" }
    }),
    false
  );
  assert.equal(
    protocol.isTerminalJudge({
      queued: -1,
      submission: { status: "SOME_FUTURE_STATUS" }
    }),
    true
  );
});

test("normalizes testcase metadata and public case input/output", () => {
  const cases = protocol.normalizeTestCaseConfig({
    test1: {
      score: 3,
      hint: "检查边界",
      showHint: true,
      isPublic: true
    },
    test2: {
      score: 7,
      hint: "",
      showHint: false,
      isPublic: false
    }
  });
  assert.deepEqual(cases, [
    {
      name: "test1",
      score: 3,
      hint: "检查边界",
      showHint: true,
      isPublic: true
    },
    {
      name: "test2",
      score: 7,
      hint: "",
      showHint: false,
      isPublic: false
    }
  ]);

  assert.deepEqual(
    protocol.normalizePublicTestCase({
      testCase: {
        name: "sample",
        input: { text: "1 2\n", truncated: false, fileName: "input.txt" },
        output: { text: "3\n", truncated: true, fileName: "" }
      }
    }),
    {
      name: "sample",
      input: { text: "1 2\n", truncated: false, fileName: "input.txt" },
      output: { text: "3\n", truncated: true, fileName: "" }
    }
  );
});

test("annotates testcase results with metadata and hidden visibility", () => {
  const result = protocol.formatJudgeResult(
    {
      queued: -1,
      submission: {
        id: "899",
        status: "WRONG_ANSWER",
        score: 3,
        judgeResponseContents: [
          {
            programmingJudgeResponseContent: {
              testcaseJudgeResults: {
                test1: {
                  result: "ACCEPTED",
                  testcaseScore: 3,
                  showOutput: false
                },
                test2: {
                  result: "WRONG_ANSWER",
                  testcaseScore: 0,
                  showOutput: false
                }
              }
            }
          }
        ]
      }
    },
    {
      problemScore: 10,
      caseConfig: {
        test1: { score: 3, isPublic: true, showHint: false, hint: "" },
        test2: { score: 7, isPublic: false, showHint: true, hint: "检查边界" }
      }
    }
  );

  assert.match(result.text, /测试点 test1.*公开测试点/);
  assert.match(result.text, /测试点 test2.*隐藏测试点/);
  assert.match(result.text, /提示: 检查边界/);
  assert.match(result.text, /输入与期望输出未由服务端返回/);
});

test("formats compile errors for copyable feedback", () => {
  const result = protocol.formatJudgeResult({
    queued: -1,
    submission: {
      id: "900",
      status: "COMPILE_ERROR",
      score: 0,
      time: 12,
      memory: 1024,
      judgeResponseContents: [
        {
          programmingJudgeResponseContent: {
            compilationResult: {
              success: false,
              log: "main.c:1:1: error: expected expression"
            },
            testcaseJudgeResults: {}
          }
        }
      ]
    }
  });

  assert.equal(result.terminal, true);
  assert.equal(result.failed, true);
  assert.match(result.text, /编译错误/);
  assert.match(result.text, /main\.c:1:1/);
  assert.match(result.text, /本题尚未通过/);
});

test("formats accepted test cases and honors hidden response settings", () => {
  const payload = {
    queued: -1,
    submission: {
      id: "901",
      status: "ACCEPTED",
      score: 20,
      time: 30,
      memory: 2048,
      judgeResponseContents: [
        {
          programmingJudgeResponseContent: {
            compilationResult: { success: true, log: "" },
            testcaseJudgeResults: {
              "1": {
                result: "ACCEPTED",
                testcaseScore: 10,
                time: 10,
                memory: 1024,
                exitcode: 0,
                showOutput: false
              }
            }
          }
        }
      ]
    }
  };

  const visible = protocol.formatJudgeResult(payload, { problemScore: 20 });
  assert.equal(visible.failed, false);
  assert.match(visible.text, /得分: 20 \/ 20/);
  assert.match(visible.text, /测试点 1/);

  const hidden = protocol.formatJudgeResult(payload, {
    problemScore: 20,
    hideProgrammingJudgeResponseContents: true
  });
  assert.match(hidden.text, /隐藏编程题判题详情/);
  assert.doesNotMatch(hidden.text, /测试点 1/);
});

test("extracts nested PTA API error messages", () => {
  assert.equal(
    protocol.extractErrorMessage({
      error: { code: "FORBIDDEN", message: "当前考试不允许提交" }
    }),
    "[FORBIDDEN] 当前考试不允许提交"
  );
});
