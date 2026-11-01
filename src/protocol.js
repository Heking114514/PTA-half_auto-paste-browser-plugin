(function attachProtocol(root, factory) {
  const protocol = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = protocol;
  }
  if (root) {
    root.PTACompanionProtocol = protocol;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createProtocol() {
  "use strict";

  const API_ORIGIN = "https://pintia.cn";
  const NON_TERMINAL_STATUSES = new Set([
    "",
    "PENDING",
    "QUEUED",
    "WAITING",
    "JUDGING",
    "REJUDGING"
  ]);
  const TERMINAL_STATUSES = new Set([
    "ACCEPTED",
    "COMPILE_ERROR",
    "COMPILATION_ERROR",
    "PARTIAL_ACCEPTED",
    "WRONG_ANSWER",
    "MULTIPLE_ERROR",
    "INTERNAL_ERROR",
    "TIME_LIMIT_EXCEEDED",
    "TOTAL_TIME_LIMIT_EXCEEDED",
    "MEMORY_LIMIT_EXCEEDED",
    "OUTPUT_LIMIT_EXCEEDED",
    "SEGMENTATION_FAULT",
    "FLOAT_POINT_EXCEPTION",
    "PRESENTATION_ERROR",
    "RUNTIME_ERROR",
    "NON_ZERO_EXIT_CODE",
    "NO_ANSWER",
    "SKIPPED",
    "SAMPLE_ERROR",
    "CHECKER_ERROR",
    "INTERACTOR_ERROR",
    "NEUTRAL",
    "OVERRIDDEN",
    "SYSTEM_ERROR",
    "CANCELLED"
  ]);

  const STATUS_LABELS = {
    ACCEPTED: "答案正确",
    COMPILE_ERROR: "编译错误",
    COMPILATION_ERROR: "编译错误",
    PARTIAL_ACCEPTED: "部分正确",
    WRONG_ANSWER: "答案错误",
    MULTIPLE_ERROR: "多种错误",
    INTERNAL_ERROR: "内部错误",
    TIME_LIMIT_EXCEEDED: "运行超时",
    TOTAL_TIME_LIMIT_EXCEEDED: "运行总时长超时",
    MEMORY_LIMIT_EXCEEDED: "内存超限",
    OUTPUT_LIMIT_EXCEEDED: "输出超限",
    SEGMENTATION_FAULT: "段错误",
    FLOAT_POINT_EXCEPTION: "浮点错误",
    PRESENTATION_ERROR: "格式错误",
    RUNTIME_ERROR: "运行时错误",
    NON_ZERO_EXIT_CODE: "非零返回",
    NO_ANSWER: "未作答",
    SKIPPED: "跳过",
    SAMPLE_ERROR: "样例错误",
    CHECKER_ERROR: "判题程序错误",
    INTERACTOR_ERROR: "交互程序错误",
    NEUTRAL: "运行结束",
    SYSTEM_ERROR: "系统错误",
    WAITING: "等待评测",
    JUDGING: "正在评测",
    REJUDGING: "正在重测",
    PENDING: "等待提交",
    QUEUED: "排队中",
    CANCELLED: "已取消",
    OVERRIDDEN: "已被覆盖"
  };

  function asString(value, fallback) {
    if (value === undefined || value === null) return fallback || "";
    return String(value);
  }

  function parseApiUrl(rawUrl, baseUrl) {
    const url = new URL(rawUrl, baseUrl || API_ORIGIN);
    return {
      url,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search
    };
  }

  function classifyApiUrl(rawUrl, baseUrl) {
    let parsed;
    try {
      parsed = parseApiUrl(rawUrl, baseUrl);
    } catch {
      return null;
    }

    const path = parsed.pathname;
    let match;

    if ((match = path.match(/^\/api\/problem-sets\/([^/]+)\/exam-problems\/([^/]+)$/))) {
      return {
        kind: "problem-detail",
        problemSetId: match[1],
        problemSetProblemId: match[2],
        path,
        search: parsed.search
      };
    }
    if ((match = path.match(/^\/api\/problem-sets\/problems\/([^/]+)\/exam-draft$/))) {
      return {
        kind: "exam-draft",
        problemSetProblemId: match[1],
        path,
        search: parsed.search
      };
    }
    if ((match = path.match(/^\/api\/problem-sets\/([^/]+)\/exams$/))) {
      return {
        kind: "exam-context",
        problemSetId: match[1],
        path,
        search: parsed.search
      };
    }
    if ((match = path.match(/^\/api\/problem-sets\/([^/]+)\/exam-problem-list$/))) {
      return {
        kind: "problem-list",
        problemSetId: match[1],
        path,
        search: parsed.search
      };
    }
    if ((match = path.match(/^\/api\/exams\/([^/]+)\/exam-submissions$/))) {
      return {
        kind: "create-submission",
        examId: match[1],
        path,
        search: parsed.search
      };
    }
    if ((match = path.match(/^\/api\/exams\/([^/]+)\/submissions\/([^/]+)$/))) {
      return {
        kind: "submission",
        examId: match[1],
        submissionId: match[2],
        path,
        search: parsed.search
      };
    }
    if (
      (match = path.match(
        /^\/api\/exams\/([^/]+)\/problem-sets\/([^/]+)\/last-submissions$/
      ))
    ) {
      return {
        kind: "last-submission",
        examId: match[1],
        problemSetId: match[2],
        path,
        search: parsed.search
      };
    }
    return null;
  }

  function isRelevantApiUrl(rawUrl, baseUrl) {
    return Boolean(classifyApiUrl(rawUrl, baseUrl));
  }

  function normalizeProblem(payload, fallbackProblemSetId) {
    const problem = payload && payload.problemSetProblem ? payload.problemSetProblem : payload;
    if (!problem || typeof problem !== "object") return null;

    const programmingConfig =
      problem.problemConfig && problem.problemConfig.programmingProblemConfig
        ? problem.problemConfig.programmingProblemConfig
        : {};

    return {
      id: asString(problem.id),
      problemId: asString(problem.problemId),
      problemSetId: asString(problem.problemSetId, asString(fallbackProblemSetId)),
      label: asString(problem.label),
      title: asString(problem.title, "未命名题目"),
      content: asString(problem.content),
      description: asString(problem.description),
      type: asString(problem.type),
      score: Number.isFinite(Number(problem.score)) ? Number(problem.score) : null,
      compiler: asString(problem.compiler),
      deadline: asString(problem.deadline),
      lastSubmissionId: asString(problem.lastSubmissionId),
      examLabel: asString(payload && payload.examLabel),
      config: programmingConfig,
      examples: Array.isArray(programmingConfig.exampleTestDatas)
        ? programmingConfig.exampleTestDatas
        : [],
      raw: problem
    };
  }

  function normalizeExamContext(payload, fallbackProblemSetId) {
    const exam = payload && payload.exam ? payload.exam : {};
    const problemSet = payload && payload.problemSet ? payload.problemSet : {};
    const config = problemSet.problemSetConfig || {};

    return {
      examId: asString(exam.id),
      problemSetId: asString(problemSet.id, asString(exam.problemSetId, fallbackProblemSetId)),
      examStatus: asString(exam.status || (payload && payload.status)),
      ended: Boolean(exam.ended),
      serverTime: asString(payload && payload.serverTime),
      startAt: asString(exam.startAt),
      endAt: asString(exam.endAt),
      compilers: Array.isArray(config.compilers)
        ? config.compilers.map((item) => asString(item)).filter(Boolean)
        : [],
      settings: {
        autoSave: Boolean(config.autoSave),
        // This is the exam hand-in configuration, not a per-submission switch.
        allowSubmitExam: config.allowSubmitExam !== false,
        enableCustomTestData: Boolean(config.enableCustomTestData),
        forbidPasting: Boolean(config.forbidPasting),
        hideProgrammingJudgeResponseContents: Boolean(
          config.hideProgrammingJudgeResponseContents
        )
      },
      raw: payload
    };
  }

  function normalizeProblemList(payload) {
    const problems =
      payload && Array.isArray(payload.problemSetProblems) ? payload.problemSetProblems : [];
    return problems.map((problem) => ({
      id: asString(problem.id),
      label: asString(problem.label),
      title: asString(problem.title, "未命名题目"),
      type: asString(problem.type),
      score: Number.isFinite(Number(problem.score)) ? Number(problem.score) : null,
      compiler: asString(problem.compiler),
      problemStatus: asString(problem.problemStatus)
    }));
  }

  function chooseCompiler(options, preferred) {
    const available = Array.isArray(options)
      ? options.filter((item) => item && item !== "NO_COMPILER")
      : [];
    if (preferred && preferred !== "NO_COMPILER") {
      if (!available.length || available.includes(preferred)) return preferred;
    }
    return available[0] || "GCC";
  }

  function buildSubmissionBody({ problemSetProblemId, code, compiler }) {
    return {
      problemType: "PROGRAMMING",
      details: [
        {
          problemId: "0",
          problemSetProblemId: asString(problemSetProblemId),
          programmingSubmissionDetail: {
            program: asString(code),
            compiler: asString(compiler)
          }
        }
      ]
    };
  }

  function buildDraftBody({ problemSetProblemId, code, compiler, saveAt }) {
    return {
      answer: {
        detail: {
          problemId: "0",
          problemSetProblemId: asString(problemSetProblemId),
          customTestData: {
            hasCustomTestData: false,
            content: ""
          },
          programmingSubmissionDetail: {
            compiler: asString(compiler),
            program: asString(code)
          }
        },
        saveAt: saveAt || new Date().toISOString()
      }
    };
  }

  function extractDraft(payload) {
    const detail = payload && payload.answer && payload.answer.detail ? payload.answer.detail : {};
    const programming = detail.programmingSubmissionDetail || {};
    return {
      program: asString(programming.program),
      compiler: asString(programming.compiler),
      saveAt: asString(payload && payload.answer && payload.answer.saveAt)
    };
  }

  function getProgrammingJudgeContent(payload) {
    const submission = payload && payload.submission ? payload.submission : {};
    const contents = Array.isArray(submission.judgeResponseContents)
      ? submission.judgeResponseContents
      : [];
    const first =
      contents.find((item) => item && item.programmingJudgeResponseContent) || contents[0] || {};
    return first.programmingJudgeResponseContent || {};
  }

  function isTerminalJudge(payload) {
    const submission = payload && payload.submission ? payload.submission : {};
    const status = asString(submission.status).toUpperCase();
    if (NON_TERMINAL_STATUSES.has(status)) return false;
    if (TERMINAL_STATUSES.has(status)) return true;
    return Number(payload && payload.queued) === -1;
  }

  function statusLabel(status) {
    const normalized = asString(status).toUpperCase();
    return STATUS_LABELS[normalized] || normalized || "未知状态";
  }

  function caseEntries(testcaseJudgeResults) {
    if (Array.isArray(testcaseJudgeResults)) {
      return testcaseJudgeResults.map((value, index) => [String(index + 1), value]);
    }
    if (testcaseJudgeResults && typeof testcaseJudgeResults === "object") {
      return Object.entries(testcaseJudgeResults).sort((left, right) => {
        const leftNumber = Number(left[0]);
        const rightNumber = Number(right[0]);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
          return leftNumber - rightNumber;
        }
        return left[0].localeCompare(right[0]);
      });
    }
    return [];
  }

  function normalizeTestCaseConfig(cases) {
    return caseEntries(cases).map(([name, rawCase]) => {
      const config = rawCase && typeof rawCase === "object" ? rawCase : {};
      return {
        name,
        score: Number.isFinite(Number(config.score)) ? Number(config.score) : null,
        hint: asString(config.hint),
        showHint: Boolean(config.showHint),
        isPublic: Boolean(config.isPublic)
      };
    });
  }

  function normalizeCaseFile(value) {
    if (value && typeof value === "object") {
      return {
        text: asString(value.text),
        truncated: Boolean(value.truncated),
        fileName: asString(value.fileName)
      };
    }
    return {
      text: asString(value),
      truncated: false,
      fileName: ""
    };
  }

  function normalizePublicTestCase(payload) {
    const testCase = payload && payload.testCase ? payload.testCase : payload;
    if (!testCase || typeof testCase !== "object") return null;
    return {
      name: asString(testCase.name),
      input: normalizeCaseFile(testCase.input),
      output: normalizeCaseFile(testCase.output)
    };
  }

  function appendOutput(lines, label, value) {
    const text = asString(value);
    if (!text) return;
    lines.push("", label + ":");
    lines.push(text);
  }

  function formatJudgeResult(payload, options) {
    const settings = options || {};
    const submission = payload && payload.submission ? payload.submission : {};
    const status = asString(submission.status, "UNKNOWN").toUpperCase();
    const terminal = isTerminalJudge(payload);
    const content = getProgrammingJudgeContent(payload);
    const lines = [];

    lines.push("提交状态: " + statusLabel(status) + " (" + status + ")");
    if (Number.isFinite(Number(submission.score))) {
      const total = Number.isFinite(Number(settings.problemScore))
        ? " / " + Number(settings.problemScore)
        : "";
      lines.push("得分: " + Number(submission.score) + total);
    }
    if (Number.isFinite(Number(submission.time))) {
      lines.push("最大耗时: " + Number(submission.time) + " ms");
    }
    if (Number.isFinite(Number(submission.memory))) {
      lines.push("最大内存: " + Number(submission.memory) + " KB");
    }
    if (submission.id) lines.push("提交 ID: " + submission.id);
    if (Number.isFinite(Number(payload && payload.queued)) && Number(payload.queued) >= 0) {
      lines.push("队列位置: " + Number(payload.queued));
    }

    if (!terminal) {
      lines.push("", "判题尚未结束，请继续等待。");
      return {
        text: lines.join("\n"),
        status,
        terminal,
        failed: false,
        score: Number.isFinite(Number(submission.score)) ? Number(submission.score) : null
      };
    }

    if (settings.hideProgrammingJudgeResponseContents) {
      lines.push("", "该考试配置隐藏编程题判题详情，服务端未提供可展示的编译或测试点输出。");
    } else {
      const compilation = content.compilationResult || {};
      if (compilation.log || compilation.error) {
        appendOutput(lines, "编译输出", compilation.log || compilation.error);
      } else if (compilation.success === false) {
        lines.push("", "编译失败，但服务端未返回编译日志。");
      }

      const checkerCompilation = content.checkerCompilationResult || {};
      if (checkerCompilation.log || checkerCompilation.error) {
        appendOutput(
          lines,
          "Checker 编译输出",
          checkerCompilation.log || checkerCompilation.error
        );
      }

      const cases = caseEntries(content.testcaseJudgeResults);
      if (cases.length) {
        lines.push("", "测试点:");
        const caseConfig =
          settings.caseConfig && typeof settings.caseConfig === "object"
            ? settings.caseConfig
            : {};
        for (const [caseName, rawCase] of cases) {
          const testcase = rawCase && typeof rawCase === "object" ? rawCase : {};
          const metadata =
            caseConfig[caseName] && typeof caseConfig[caseName] === "object"
              ? caseConfig[caseName]
              : {};
          const result = asString(testcase.result, "UNKNOWN").toUpperCase();
          const details = [];
          if (Number.isFinite(Number(testcase.testcaseScore))) {
            details.push("得分 " + Number(testcase.testcaseScore));
          }
          if (Number.isFinite(Number(metadata.score))) {
            details.push("分值 " + Number(metadata.score));
          }
          if (metadata.isPublic === true) details.push("公开测试点");
          if (metadata.isPublic === false) details.push("隐藏测试点");
          if (testcase.time !== undefined && testcase.time !== null) {
            details.push("耗时 " + testcase.time + " ms");
          }
          if (testcase.memory !== undefined && testcase.memory !== null) {
            details.push("内存 " + testcase.memory + " KB");
          }
          if (testcase.exitcode !== undefined && Number(testcase.exitcode) !== 0) {
            details.push("退出码 " + testcase.exitcode);
          }
          lines.push(
            "- 测试点 " +
              caseName +
              ": " +
              statusLabel(result) +
              " (" +
              result +
              ")" +
              (details.length ? "，" + details.join("，") : "")
          );
          if (metadata.showHint && metadata.hint) {
            lines.push("  提示: " + metadata.hint);
          }
          if (testcase.exceed) lines.push("  exceed: " + testcase.exceed);
          if (testcase.error) appendOutput(lines, "  错误", testcase.error);
          if (testcase.showOutput) {
            appendOutput(lines, "  stdout", testcase.stdout);
            appendOutput(lines, "  stderr", testcase.stderr);
            appendOutput(lines, "  checker", testcase.checkerOutput);
          } else {
            lines.push("  输入与期望输出未由服务端返回。");
          }
        }
      } else if (status !== "ACCEPTED" && status !== "COMPILE_ERROR") {
        lines.push("", "服务端未返回测试点明细。");
      }
    }

    const failed = status !== "ACCEPTED";
    if (failed) {
      lines.push("", "本题尚未通过。");
    }

    return {
      text: lines.join("\n"),
      status,
      terminal,
      failed,
      score: Number.isFinite(Number(submission.score)) ? Number(submission.score) : null
    };
  }

  function extractErrorMessage(payload, fallback) {
    if (payload && payload.error) {
      if (typeof payload.error === "string") return payload.error;
      const code = payload.error.code ? "[" + payload.error.code + "] " : "";
      return code + asString(payload.error.message, fallback || "请求失败");
    }
    return asString(payload && payload.message, fallback || "请求失败");
  }

  return {
    API_ORIGIN,
    TERMINAL_STATUSES,
    NON_TERMINAL_STATUSES,
    classifyApiUrl,
    isRelevantApiUrl,
    normalizeProblem,
    normalizeExamContext,
    normalizeProblemList,
    chooseCompiler,
    buildSubmissionBody,
    buildDraftBody,
    extractDraft,
    getProgrammingJudgeContent,
    normalizeTestCaseConfig,
    normalizePublicTestCase,
    isTerminalJudge,
    statusLabel,
    formatJudgeResult,
    extractErrorMessage
  };
});
