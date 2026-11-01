(function installContentController() {
  "use strict";

  const protocol = globalThis.PTACompanionProtocol;
  if (!protocol) return;
  if (document.getElementById("pta-companion-host")) return;
  if (!window.__PTA_COMPANION_CONTENT_V1__) {
    Object.defineProperty(window, "__PTA_COMPANION_CONTENT_V1__", {
      value: true,
      configurable: false,
      enumerable: false
    });
  }

  const BRIDGE_SOURCE = "pta-companion-page";
  const POLL_TIMEOUT_MS = 5 * 60 * 1000;
  const MAX_CASE_OUTPUT_LENGTH = 20000;
  const ALLOWED_TAGS = new Set([
    "a",
    "b",
    "blockquote",
    "br",
    "caption",
    "code",
    "dd",
    "del",
    "details",
    "div",
    "dl",
    "dt",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "kbd",
    "li",
    "mark",
    "math",
    "menclose",
    "mfrac",
    "mi",
    "mn",
    "mo",
    "mover",
    "mpadded",
    "mphantom",
    "mroot",
    "mrow",
    "ms",
    "mspace",
    "msqrt",
    "mstyle",
    "msub",
    "msubsup",
    "msup",
    "mtable",
    "mtd",
    "mtext",
    "mtr",
    "munder",
    "munderover",
    "ol",
    "p",
    "pre",
    "q",
    "s",
    "samp",
    "section",
    "semantics",
    "small",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
    "var",
    "mjx-container"
  ]);
  const REMOVE_WITH_CONTENT = new Set([
    "audio",
    "base",
    "button",
    "canvas",
    "embed",
    "form",
    "iframe",
    "input",
    "link",
    "meta",
    "noscript",
    "object",
    "option",
    "script",
    "select",
    "source",
    "style",
    "svg",
    "template",
    "textarea",
    "video"
  ]);
  const BLOCK_TAGS = new Set([
    "blockquote",
    "details",
    "div",
    "dl",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "ol",
    "p",
    "pre",
    "section",
    "summary",
    "table",
    "ul"
  ]);

  const state = {
    mounted: false,
    open: true,
    routeProblemSetId: "",
    exam: null,
    problem: null,
    problemList: [],
    codeByProblem: new Map(),
    publicCaseData: new Map(),
    publicCaseLoading: new Set(),
    compiler: "",
    compilerTouched: false,
    apiHeaders: {},
    loadingExam: false,
    loadingProblemId: "",
    lastSubmissionFor: "",
    bootstrapping: false,
    polling: false,
    liveResult: false,
    pollToken: 0,
    activeSubmissionId: "",
    ownSubmissionIds: new Set(),
    networkBusy: false,
    resultText: "",
    resultFailed: false,
    lastClearedCode: "",
    lastClearedProblemId: "",
    activeTab: "question",
    noticeTimer: 0,
    lastBootstrapAt: 0
  };

  let host = null;
  let shadow = null;
  let el = null;
  let routeTimer = 0;

  function byId(id) {
    return shadow ? shadow.getElementById(id) : null;
  }

  function makeElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clearNode(node) {
    if (node) node.replaceChildren();
  }

  function template() {
    return `
      <aside class="ptac-panel" role="dialog" aria-label="PTA Companion">
        <header class="ptac-header">
          <div class="ptac-heading">
            <h1 class="ptac-title">题目工作台</h1>
            <div class="ptac-subtitle">
              <span id="status-dot" class="ptac-status-dot"></span>
              <span id="header-status">等待进入考试题目</span>
            </div>
          </div>
          <div class="ptac-header-actions">
            <button id="refresh" class="ptac-button ghost small" type="button">刷新</button>
            <button id="minimize" class="ptac-button small" type="button">收起</button>
          </div>
        </header>

        <div class="ptac-main">
          <div id="policy" class="ptac-policy" hidden></div>
          <div id="notice" class="ptac-notice" role="status" aria-live="polite" hidden></div>

          <section class="ptac-problem-head">
            <div class="ptac-problem-row">
              <div class="ptac-problem-copy">
                <div id="problem-label" class="ptac-problem-label"></div>
                <h2 id="problem-title" class="ptac-problem-title">等待识别题目</h2>
              </div>
              <button id="copy-question" class="ptac-button small" type="button" disabled>复制题目</button>
            </div>
            <select id="problem-picker" class="ptac-picker" aria-label="选择题目" hidden></select>
            <div id="meta" class="ptac-meta"></div>
          </section>

          <div class="ptac-tabs" role="tablist" aria-label="题目、作答和结果">
            <button class="ptac-tab" data-tab="question" role="tab" aria-selected="true" type="button">题目</button>
            <button class="ptac-tab" data-tab="answer" role="tab" aria-selected="false" type="button">作答</button>
            <button class="ptac-tab" data-tab="result" role="tab" aria-selected="false" type="button">结果</button>
          </div>

          <div class="ptac-panels">
            <section class="ptac-panel-section" data-panel="question">
              <article id="question-body" class="ptac-question">
                <div class="ptac-empty">打开一道编程题后，这里会显示题目正文。</div>
              </article>
            </section>

            <section class="ptac-panel-section" data-panel="answer" hidden>
              <div class="ptac-answer-toolbar">
                <label class="ptac-select-wrap">
                  <span>编译器</span>
                  <select id="compiler" class="ptac-compiler"></select>
                </label>
                <div class="ptac-actions">
                  <button id="restore-code" class="ptac-button small" type="button" hidden>恢复上次代码</button>
                  <button id="clear-code" class="ptac-button small danger" type="button" disabled>清空</button>
                </div>
              </div>
              <div class="ptac-code-wrap">
                <textarea id="code" class="ptac-code" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="在这里编写或输入代码。" disabled></textarea>
              </div>
              <div class="ptac-answer-footer">
                <div id="code-meta" class="ptac-answer-meta">尚未识别题目</div>
                <div class="ptac-actions">
                  <button id="save-draft" class="ptac-button" type="button" disabled>保存草稿</button>
                  <button id="submit" class="ptac-button primary" type="button" disabled>正式提交</button>
                </div>
              </div>
            </section>

            <section class="ptac-panel-section" data-panel="result" hidden>
              <div class="ptac-result-toolbar">
                <div class="ptac-result-status">
                  <span id="result-badge" class="ptac-result-badge">暂无结果</span>
                  <button id="cancel-poll" class="ptac-button small ghost" type="button" hidden>停止等待</button>
                </div>
                <button id="copy-result" class="ptac-button small" type="button" disabled>复制结果</button>
              </div>
              <pre id="result-output" class="ptac-result" aria-live="polite">正式提交后，这里会显示判题状态、分数、编译日志和可见测试点信息。</pre>
            </section>
          </div>
        </div>
      </aside>
      <button id="launcher" class="ptac-launcher" type="button">PTA 助手</button>
    `;
  }

  function mount() {
    if (state.mounted || !document.documentElement) return;
    host = document.createElement("div");
    host.id = "pta-companion-host";
    host.dataset.open = "true";
    shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = template();
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = chrome.runtime.getURL("src/content.css");
    shadow.prepend(style);

    el = {
      panel: shadow.querySelector(".ptac-panel"),
      launcher: byId("launcher"),
      minimize: byId("minimize"),
      refresh: byId("refresh"),
      statusDot: byId("status-dot"),
      headerStatus: byId("header-status"),
      policy: byId("policy"),
      notice: byId("notice"),
      problemLabel: byId("problem-label"),
      problemTitle: byId("problem-title"),
      problemPicker: byId("problem-picker"),
      copyQuestion: byId("copy-question"),
      meta: byId("meta"),
      tabs: Array.from(shadow.querySelectorAll("[data-tab]")),
      panels: Array.from(shadow.querySelectorAll("[data-panel]")),
      questionBody: byId("question-body"),
      compiler: byId("compiler"),
      code: byId("code"),
      codeMeta: byId("code-meta"),
      saveDraft: byId("save-draft"),
      submit: byId("submit"),
      clearCode: byId("clear-code"),
      restoreCode: byId("restore-code"),
      resultBadge: byId("result-badge"),
      resultOutput: byId("result-output"),
      copyResult: byId("copy-result"),
      cancelPoll: byId("cancel-poll")
    };

    bindEvents();
    document.documentElement.appendChild(host);
    state.mounted = true;
    resetView();
  }

  function bindEvents() {
    el.minimize.addEventListener("click", () => setOpen(false));
    el.launcher.addEventListener("click", () => setOpen(true));
    el.refresh.addEventListener("click", () => {
      void bootstrap({ force: true });
      void discoverRecentProblem();
    });

    for (const tab of el.tabs) {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    }

    el.copyQuestion.addEventListener("click", async () => {
      if (!state.problem) return;
      await copyText(questionCopyText(state.problem), "题目已复制");
    });
    el.copyResult.addEventListener("click", async () => {
      await copyText(state.resultText, "结果已复制");
    });
    el.questionBody.addEventListener("click", handleQuestionBodyClick);

    el.problemPicker.addEventListener("change", () => {
      const problemId = el.problemPicker.value;
      if (problemId && problemId !== state.problem?.id) {
        void loadProblemById(problemId);
      }
    });

    el.compiler.addEventListener("change", () => {
      state.compiler = el.compiler.value;
      state.compilerTouched = true;
      saveCurrentCode();
      refreshControls();
    });

    el.code.addEventListener("input", () => {
      saveCurrentCode();
      refreshControls();
    });
    el.code.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void submitCode();
      }
    });
    el.saveDraft.addEventListener("click", () => void saveDraft());
    el.submit.addEventListener("click", () => void submitCode());
    el.clearCode.addEventListener("click", () => clearCode("manual"));
    el.restoreCode.addEventListener("click", restoreClearedCode);
    el.cancelPoll.addEventListener("click", cancelPolling);
  }

  function setOpen(open) {
    state.open = Boolean(open);
    if (host) host.dataset.open = String(state.open);
  }

  function setStatus(text, tone) {
    if (!el) return;
    el.headerStatus.textContent = text;
    el.statusDot.dataset.tone = tone || "";
  }

  function setNotice(message, kind, timeoutMs) {
    if (!el) return;
    if (state.noticeTimer) {
      clearTimeout(state.noticeTimer);
      state.noticeTimer = 0;
    }
    if (!message) {
      el.notice.hidden = true;
      el.notice.textContent = "";
      return;
    }
    el.notice.hidden = false;
    el.notice.dataset.kind = kind || "info";
    el.notice.textContent = message;
    if (timeoutMs !== 0) {
      state.noticeTimer = window.setTimeout(() => {
        if (el) {
          el.notice.hidden = true;
          el.notice.textContent = "";
        }
      }, timeoutMs || 4500);
    }
  }

  function switchTab(name) {
    if (!["question", "answer", "result"].includes(name)) return;
    state.activeTab = name;
    for (const tab of el.tabs) {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
    }
    for (const panel of el.panels) {
      panel.hidden = panel.dataset.panel !== name;
    }
  }

  function parseExamRoute(pathname) {
    const match = String(pathname || "").match(/^\/problem-sets\/([^/]+)\/exam(?:\/|$)/);
    return match ? match[1] : "";
  }

  function syncRoute() {
    const problemSetId = parseExamRoute(window.location.pathname);
    if (!problemSetId) {
      if (host) host.style.display = "none";
      state.routeProblemSetId = "";
      return;
    }

    mount();
    if (!host) return;
    host.style.display = "";
    if (state.routeProblemSetId === problemSetId) return;

    state.routeProblemSetId = problemSetId;
    resetForRoute();
    setOpen(true);
    void bootstrap({ force: true });
  }

  function resetForRoute() {
    state.exam = null;
    state.problem = null;
    state.problemList = [];
    state.codeByProblem.clear();
    state.publicCaseData.clear();
    state.publicCaseLoading.clear();
    state.compiler = "";
    state.compilerTouched = false;
    state.loadingExam = false;
    state.loadingProblemId = "";
    state.lastSubmissionFor = "";
    state.polling = false;
    state.liveResult = false;
    state.pollToken += 1;
    state.activeSubmissionId = "";
    state.ownSubmissionIds.clear();
    state.networkBusy = false;
    state.resultText = "";
    state.resultFailed = false;
    state.lastClearedCode = "";
    state.lastClearedProblemId = "";
    state.lastBootstrapAt = 0;
    resetView();
  }

  function resetView() {
    if (!el) return;
    el.problemLabel.textContent = "";
    el.problemTitle.textContent = "等待识别题目";
    el.problemPicker.hidden = true;
    clearNode(el.problemPicker);
    el.copyQuestion.disabled = true;
    clearNode(el.meta);
    clearNode(el.questionBody);
    el.questionBody.appendChild(
      makeElement("div", "ptac-empty", "打开一道编程题后，这里会显示题目正文。")
    );
    el.code.value = "";
    el.code.disabled = true;
    clearNode(el.compiler);
    el.saveDraft.disabled = true;
    el.submit.disabled = true;
    el.clearCode.disabled = true;
    el.restoreCode.hidden = true;
    el.codeMeta.textContent = "尚未识别题目";
    el.policy.hidden = true;
    el.copyResult.disabled = true;
    el.cancelPoll.hidden = true;
    setResultText("正式提交后，这里会显示判题状态、分数、编译日志和可见测试点信息。", "暂无结果", "");
    setStatus("正在读取考试信息", "busy");
    switchTab("question");
  }

  async function bootstrap(options) {
    const force = Boolean(options && options.force);
    if (state.bootstrapping && !force) return;
    if (!state.routeProblemSetId) return;
    const problemSetId = state.routeProblemSetId;
    state.bootstrapping = true;
    state.lastBootstrapAt = Date.now();
    setStatus("正在读取考试信息", "busy");

    try {
      await loadExamContext(problemSetId, force);
      if (state.routeProblemSetId !== problemSetId) return;
      if (state.exam?.examId) {
        await loadProblemList(problemSetId, force);
      }

      const found = await discoverRecentProblem();
      if (!found && !state.problem && state.problemList.length === 1) {
        await loadProblemById(state.problemList[0].id);
      }

      if (state.problem) {
        setStatus(state.polling ? "正在等待判题" : "已识别当前题目", state.polling ? "busy" : "ready");
      } else if (state.problemList.length > 1) {
        setStatus("请选择一道题目", "ready");
        setNotice("已读取题目列表；切换页面中的题目后也会自动同步。", "info");
      } else {
        setStatus("等待识别题目", "");
        setNotice("暂未捕获当前题目。打开一道编程题后，插件会自动同步。", "info");
      }
    } catch (error) {
      setStatus("读取考试信息失败", "error");
      setNotice(error.message || String(error), "error", 0);
    } finally {
      state.bootstrapping = false;
      refreshControls();
    }

    if (!state.problem) {
      window.setTimeout(() => void discoverRecentProblem(), 1200);
      window.setTimeout(() => void discoverRecentProblem(), 3500);
    }
  }

  async function loadExamContext(problemSetId, force) {
    if (!force && state.exam?.problemSetId === problemSetId && state.exam.examId) {
      return state.exam;
    }
    if (state.loadingExam) return state.exam;
    state.loadingExam = true;
    try {
      const response = await requestJson(
        `/api/problem-sets/${encodeURIComponent(problemSetId)}/exams`
      );
      if (state.routeProblemSetId !== problemSetId) return null;
      state.exam = protocol.normalizeExamContext(response, problemSetId);
      renderPolicy();
      renderCompilerOptions();
      refreshControls();
      if (state.problem) void loadLastSubmission(state.problem);
      return state.exam;
    } finally {
      state.loadingExam = false;
    }
  }

  async function loadProblemList(problemSetId, force) {
    if (!state.exam?.examId) return [];
    if (!force && state.problemList.length) return state.problemList;
    const query = new URLSearchParams({
      exam_id: state.exam.examId,
      problem_type: "PROGRAMMING",
      page: "0",
      limit: "100"
    });
    const response = await requestJson(
      `/api/problem-sets/${encodeURIComponent(problemSetId)}/exam-problem-list?${query}`
    );
    if (state.routeProblemSetId !== problemSetId) return [];
    state.problemList = protocol.normalizeProblemList(response);
    renderProblemPicker();
    return state.problemList;
  }

  async function discoverRecentProblem() {
    if (!state.routeProblemSetId) return false;
    const entries = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .reverse();
    for (const name of entries) {
      const classification = protocol.classifyApiUrl(name, window.location.href);
      if (!classification || classification.kind !== "problem-detail") continue;
      if (classification.problemSetId !== state.routeProblemSetId) continue;
      if (state.problem?.id === classification.problemSetProblemId) return true;
      try {
        await loadProblemById(classification.problemSetProblemId);
        return Boolean(state.problem);
      } catch {
        return false;
      }
    }
    return false;
  }

  async function loadProblemById(problemSetProblemId) {
    const problemSetId = state.routeProblemSetId;
    if (!problemSetId || !problemSetProblemId) return;
    if (state.loadingProblemId === problemSetProblemId) return;
    state.loadingProblemId = problemSetProblemId;
    setStatus("正在读取题目", "busy");

    try {
      const response = await requestJson(
        `/api/problem-sets/${encodeURIComponent(problemSetId)}/exam-problems/${encodeURIComponent(
          problemSetProblemId
        )}`
      );
      if (state.routeProblemSetId !== problemSetId) return;
      await applyProblem(response, problemSetId);
    } catch (error) {
      setStatus("读取题目失败", "error");
      setNotice(error.message || String(error), "error", 0);
      throw error;
    } finally {
      state.loadingProblemId = "";
    }
  }

  async function applyProblem(payload, problemSetId) {
    const problem = protocol.normalizeProblem(payload, problemSetId);
    if (!problem || !problem.id) throw new Error("题目详情缺少 problemSetProblemId。");
    if (state.routeProblemSetId !== problemSetId) return;

    if (state.problem?.id === problem.id) {
      state.problem = problem;
      renderProblem();
      refreshControls();
      return;
    }

    saveCurrentCode();
    state.problem = problem;
    state.resultText = "";
    state.resultFailed = false;
    state.activeSubmissionId = "";
    state.lastSubmissionFor = "";
    state.liveResult = false;
    setResultText(
      "当前题目尚无本次会话判题结果。插件会尝试载入最近一次提交；正式提交后会自动轮询。",
      "暂无结果",
      ""
    );
    const remembered = state.codeByProblem.get(problem.id);
    state.compilerTouched = false;
    state.compiler = protocol.chooseCompiler(
      state.exam?.compilers,
      remembered?.compiler || problem.compiler
    );
    el.code.value = remembered?.code || "";
    renderProblem();
    refreshControls();
    switchTab("question");
    setStatus("已识别当前题目", "ready");
    void loadDraft(problem.id);
    void loadLastSubmission(problem);
  }

  async function loadDraft(problemSetProblemId) {
    if (!problemSetProblemId || state.problem?.type !== "PROGRAMMING") return;
    const expectedProblemId = problemSetProblemId;
    try {
      const response = await requestJson(
        `/api/problem-sets/problems/${encodeURIComponent(problemSetProblemId)}/exam-draft`
      );
      if (state.problem?.id !== expectedProblemId) return;
      const draft = protocol.extractDraft(response);
      if (!el.code.value && draft.program) {
        el.code.value = draft.program;
      }
      if (!state.compilerTouched && draft.compiler) {
        const preferred = protocol.chooseCompiler(state.exam?.compilers, draft.compiler);
        if (preferred) state.compiler = preferred;
      }
      saveCurrentCode();
      renderCompilerOptions();
      refreshControls();
    } catch {
      // A missing draft is expected for a fresh problem and must not hide the question.
    }
  }

  async function loadLastSubmission(problem) {
    if (
      !problem ||
      problem.type !== "PROGRAMMING" ||
      !problem.id ||
      !state.exam?.examId ||
      !state.routeProblemSetId
    ) {
      return;
    }
    if (state.lastSubmissionFor === problem.id) return;
    const expectedProblemId = problem.id;
    state.lastSubmissionFor = expectedProblemId;

    const query = new URLSearchParams({
      problem_set_problem_id: expectedProblemId
    });
    try {
      const response = await requestJson(
        `/api/exams/${encodeURIComponent(
          state.exam.examId
        )}/problem-sets/${encodeURIComponent(
          state.routeProblemSetId
        )}/last-submissions?${query}`
      );
      if (
        state.problem?.id !== expectedProblemId ||
        state.liveResult ||
        state.polling
      ) {
        return;
      }
      const submission = response && response.submission;
      if (
        !submission ||
        !submission.status ||
        (submission.problemSetProblemId &&
          String(submission.problemSetProblemId) !== expectedProblemId)
      ) {
        return;
      }

      const result = protocol.formatJudgeResult(response, judgeFormatOptions(problem));
      const tone = !result.terminal ? "busy" : result.failed ? "error" : "success";
      setResultText(
        "最近一次提交（非本次轮询）\n\n" + result.text,
        "最近 · " + protocol.statusLabel(result.status),
        tone
      );
    } catch {
      if (state.problem?.id === expectedProblemId) state.lastSubmissionFor = "";
    }
  }

  function renderProblem() {
    const problem = state.problem;
    if (!problem) return;
    el.problemLabel.textContent = [problem.examLabel, problem.label]
      .filter(Boolean)
      .join(" · ");
    el.problemTitle.textContent = problem.title;
    el.copyQuestion.disabled = false;

    clearNode(el.meta);
    appendChip("类型", displayProblemType(problem.type));
    if (Number.isFinite(problem.score)) appendChip("分值", String(problem.score));
    const config = problem.config || {};
    if (Number.isFinite(Number(config.timeLimit))) {
      appendChip("时限", Number(config.timeLimit) + " ms");
    }
    if (Number.isFinite(Number(config.memoryLimit))) {
      appendChip("内存", Number(config.memoryLimit) + " KB");
    }
    if (Number.isFinite(Number(config.codeSizeLimit))) {
      appendChip("代码上限", Number(config.codeSizeLimit) + " KB");
    }

    renderQuestionBody(problem);
    renderProblemPicker();
    renderCompilerOptions();
    renderPolicy();
    refreshControls();
  }

  function appendChip(label, value) {
    if (!value) return;
    el.meta.appendChild(makeElement("span", "ptac-chip", label + " " + value));
  }

  function displayProblemType(type) {
    const labels = {
      PROGRAMMING: "编程题",
      TRUE_OR_FALSE: "判断题",
      MULTIPLE_CHOICE: "单选题",
      MULTIPLE_CHOICE_MORE_THAN_ONE_ANSWER: "多选题",
      FILL_IN_THE_BLANK: "填空题",
      SUBJECTIVE: "主观题"
    };
    return labels[type] || type || "未知题型";
  }

  function renderQuestionBody(problem) {
    clearNode(el.questionBody);
    const source = problem.content || problem.description || "";
    if (source) {
      el.questionBody.appendChild(sanitizeToFragment(source));
    } else {
      el.questionBody.appendChild(makeElement("div", "ptac-empty", "题目正文为空。"));
    }

    if (Array.isArray(problem.examples) && problem.examples.length) {
      problem.examples.forEach((example, index) => {
        const block = makeElement("section", "ptac-example");
        block.appendChild(makeElement("h3", "", "示例 " + (index + 1)));
        if (example && example.input !== undefined) {
          block.appendChild(makeElement("div", "ptac-example-label", "输入"));
          block.appendChild(makeElement("pre", "", String(example.input)));
        }
        if (example && example.output !== undefined) {
          block.appendChild(makeElement("div", "ptac-example-label", "输出"));
          block.appendChild(makeElement("pre", "", String(example.output)));
        }
        el.questionBody.appendChild(block);
      });
    }

    renderTestCaseSummary(problem);
  }

  function handleQuestionBodyClick(event) {
    const button =
      event.target && event.target.closest
        ? event.target.closest("[data-public-case]")
        : null;
    if (!button) return;
    const caseName = button.dataset.publicCase || "";
    const metadata = protocol
      .normalizeTestCaseConfig(state.problem?.config?.cases || {})
      .find((item) => item.name === caseName);
    if (!metadata || !metadata.isPublic) {
      setNotice("该测试点未被题目集标记为公开，不能读取输入或期望输出。", "warn");
      return;
    }
    void loadPublicTestCase(caseName);
  }

  function renderTestCaseSummary(problem) {
    if (problem.type !== "PROGRAMMING") return;
    const cases = protocol.normalizeTestCaseConfig(problem.config?.cases || {});
    const section = makeElement("section", "ptac-cases");
    section.appendChild(makeElement("h3", "", "测试点"));

    if (!cases.length) {
      section.appendChild(
        makeElement("p", "ptac-case-note", "该题详情响应没有下发测试点元数据。")
      );
      el.questionBody.appendChild(section);
      return;
    }

    const publicCount = cases.filter((item) => item.isPublic).length;
    section.appendChild(
      makeElement(
        "p",
        "ptac-case-note",
        "共 " +
          cases.length +
          " 个测试点，公开 " +
          publicCount +
          " 个。隐藏测试点只可能返回状态、单项得分、耗时和内存。"
      )
    );

    const list = makeElement("div", "ptac-case-list");
    for (const testCase of cases) {
      const row = makeElement("div", "ptac-case-row");
      const heading = makeElement("div", "ptac-case-heading");
      heading.appendChild(makeElement("strong", "", testCase.name));
      if (Number.isFinite(testCase.score)) {
        heading.appendChild(makeElement("span", "ptac-case-score", testCase.score + " 分"));
      }
      heading.appendChild(
        makeElement(
          "span",
          "ptac-case-visibility " + (testCase.isPublic ? "public" : "private"),
          testCase.isPublic ? "公开" : "隐藏"
        )
      );
      row.appendChild(heading);

      if (testCase.showHint && testCase.hint) {
        row.appendChild(makeElement("div", "ptac-case-hint", testCase.hint));
      }

      if (testCase.isPublic) {
        const key = publicCaseKey(problem.id, testCase.name);
        const cached = state.publicCaseData.get(key);
        const button = makeElement(
          "button",
          "ptac-button small",
          state.publicCaseLoading.has(key) ? "读取中…" : "读取公开数据"
        );
        button.type = "button";
        button.dataset.publicCase = testCase.name;
        button.disabled = state.publicCaseLoading.has(key);
        row.appendChild(button);

        if (cached) {
          if (cached.error) {
            row.appendChild(makeElement("p", "ptac-case-error", cached.error));
          } else {
            appendPublicCaseFile(row, "输入", cached.data.input);
            appendPublicCaseFile(row, "期望输出", cached.data.output);
          }
        }
      }
      list.appendChild(row);
    }
    section.appendChild(list);
    el.questionBody.appendChild(section);
  }

  function appendPublicCaseFile(container, label, file) {
    container.appendChild(makeElement("div", "ptac-example-label", label));
    const text = file && file.text ? file.text : "(空)";
    container.appendChild(
      makeElement("pre", "", text + (file && file.truncated ? "\n…内容已截断" : ""))
    );
    if (file && file.fileName) {
      container.appendChild(makeElement("div", "ptac-case-file", file.fileName));
    }
  }

  function publicCaseKey(problemSetProblemId, caseName) {
    return String(problemSetProblemId) + ":" + String(caseName);
  }

  function caseConfigByName(problem) {
    return Object.fromEntries(
      protocol
        .normalizeTestCaseConfig(problem?.config?.cases || {})
        .map((testCase) => [testCase.name, testCase])
    );
  }

  function judgeFormatOptions(problem) {
    return {
      problemScore: problem?.score,
      hideProgrammingJudgeResponseContents:
        state.exam?.settings.hideProgrammingJudgeResponseContents,
      caseConfig: caseConfigByName(problem)
    };
  }

  async function loadPublicTestCase(caseName) {
    const problem = state.problem;
    if (!problem || !problem.id || !state.routeProblemSetId) return;
    const metadata = protocol
      .normalizeTestCaseConfig(problem.config?.cases || {})
      .find((item) => item.name === caseName);
    if (!metadata?.isPublic) return;

    const key = publicCaseKey(problem.id, caseName);
    if (state.publicCaseLoading.has(key)) return;
    state.publicCaseLoading.add(key);
    renderQuestionBody(problem);

    try {
      const response = await requestJson(
        `/api/problem-sets/${encodeURIComponent(
          state.routeProblemSetId
        )}:omit/problems/${encodeURIComponent(problem.id)}/${encodeURIComponent(caseName)}`
      );
      const data = protocol.normalizePublicTestCase(response);
      if (!data) throw new Error("公开测试点响应缺少 testCase 数据。");
      state.publicCaseData.set(key, { data, error: "" });
      setNotice("公开测试点数据已读取。", "success");
    } catch (error) {
      state.publicCaseData.set(key, {
        data: null,
        error: error.message || String(error)
      });
      setNotice("公开测试点读取失败。" + (error.message ? " " + error.message : ""), "error");
    } finally {
      state.publicCaseLoading.delete(key);
      if (state.problem?.id === problem.id) renderQuestionBody(problem);
    }
  }

  function renderProblemPicker() {
    const currentId = state.problem?.id || "";
    const problems = [...state.problemList];
    if (state.problem && !problems.some((item) => item.id === state.problem.id)) {
      problems.unshift({
        id: state.problem.id,
        label: state.problem.label,
        title: state.problem.title
      });
    }
    clearNode(el.problemPicker);
    if (!problems.length) {
      el.problemPicker.hidden = true;
      return;
    }
    for (const problem of problems) {
      const option = document.createElement("option");
      option.value = problem.id;
      option.textContent = [problem.label, problem.title].filter(Boolean).join(" · ");
      el.problemPicker.appendChild(option);
    }
    if (currentId) el.problemPicker.value = currentId;
    el.problemPicker.hidden = problems.length <= 1;
  }

  function renderCompilerOptions() {
    const values = new Set();
    for (const compiler of state.exam?.compilers || []) {
      if (compiler && compiler !== "NO_COMPILER") values.add(compiler);
    }
    if (state.problem?.compiler && state.problem.compiler !== "NO_COMPILER") {
      values.add(state.problem.compiler);
    }
    if (state.compiler && state.compiler !== "NO_COMPILER") values.add(state.compiler);
    if (!values.size) values.add("GCC");

    const selected = protocol.chooseCompiler([...values], state.compiler);
    state.compiler = selected;
    clearNode(el.compiler);
    for (const compiler of values) {
      const option = document.createElement("option");
      option.value = compiler;
      option.textContent = compiler;
      el.compiler.appendChild(option);
    }
    el.compiler.value = selected;
  }

  function renderPolicy() {
    if (!el) return;
    const messages = [];
    if (state.exam) {
      if (state.exam.ended) messages.push("考试已经结束，面板不会允许创建新提交。");
      if (state.exam.settings.hideProgrammingJudgeResponseContents) {
        messages.push("该考试隐藏编程题判题详情，结果区只能显示服务端公开的总体状态。");
      }
    }
    el.policy.hidden = messages.length === 0;
    el.policy.textContent = messages.join("\n");
  }

  function saveCurrentCode() {
    if (!state.problem || !el) return;
    state.codeByProblem.set(state.problem.id, {
      code: el.code.value,
      compiler: state.compiler
    });
  }

  function currentCodeBytes() {
    return new TextEncoder().encode(el.code.value).length;
  }

  function refreshControls() {
    if (!el) return;
    const blocker = submissionBlocker();
    const busy = state.networkBusy || state.polling;
    const programming = state.problem?.type === "PROGRAMMING";
    el.code.disabled = !programming || busy;
    el.compiler.disabled = !programming || busy || !state.exam;
    el.submit.disabled = Boolean(blocker) || busy;
    el.submit.title = blocker || "创建一条正式提交";
    el.saveDraft.disabled =
      !programming || !state.problem || !state.exam || !el.code.value || busy;
    el.clearCode.disabled = !programming || !el.code.value || busy;
    el.restoreCode.hidden = !(
      state.lastClearedCode &&
      state.lastClearedProblemId === state.problem?.id &&
      !busy
    );
    el.cancelPoll.hidden = !state.polling;
    el.codeMeta.textContent = state.problem
      ? programming
        ? currentCodeBytes() + " bytes · " + el.code.value.split("\n").length + " 行"
        : "当前协议只开放编程题作答"
      : "尚未识别题目";
  }

  function submissionBlocker() {
    if (!state.problem) return "尚未识别题目";
    if (state.problem.type !== "PROGRAMMING") return "当前版本只支持编程题";
    if (!state.exam?.examId) return "尚未取得考试 ID";
    if (state.exam.ended) return "考试已经结束";
    if (!el.code.value.trim()) return "作答区为空";
    return "";
  }

  async function requestJson(path, options) {
    const settings = options || {};
    const headers = {
      Accept: "application/json;charset=UTF-8",
      ...state.apiHeaders
    };
    const init = {
      method: settings.method || "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      headers
    };
    if (settings.body !== undefined) {
      headers["Content-Type"] = "application/json;charset=UTF-8";
      init.body = JSON.stringify(settings.body);
    }

    let response;
    try {
      response = await fetch(new URL(path, window.location.origin), init);
    } catch (error) {
      throw new Error("无法访问 PTA API。请确认当前页面已登录且网络可用。" + (error.message ? " " + error.message : ""));
    }

    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text.slice(0, 1000) };
      }
    }

    if (!response.ok) {
      const message = protocol.extractErrorMessage(payload, "HTTP " + response.status);
      const error = new Error("[" + response.status + "] " + message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function saveDraft() {
    if (!state.problem || state.networkBusy || state.polling) return;
    saveCurrentCode();
    state.networkBusy = true;
    refreshControls();
    setStatus("正在保存草稿", "busy");
    try {
      const body = protocol.buildDraftBody({
        problemSetProblemId: state.problem.id,
        code: el.code.value,
        compiler: state.compiler
      });
      await requestJson(
        `/api/problem-sets/problems/${encodeURIComponent(state.problem.id)}/exam-draft`,
        { method: "POST", body }
      );
      setNotice("草稿已保存。", "success");
      setStatus("草稿已保存", "ready");
    } catch (error) {
      setNotice(error.message || String(error), "error", 0);
      setStatus("草稿保存失败", "error");
    } finally {
      state.networkBusy = false;
      refreshControls();
    }
  }

  async function submitCode() {
    const blocker = submissionBlocker();
    if (blocker) {
      setNotice(blocker, "warn");
      return;
    }
    if (state.networkBusy || state.polling) return;
    const confirmed = window.confirm(
      "正式提交会在当前考试中创建一条提交记录，并发送作答区中的代码。继续吗？"
    );
    if (!confirmed) return;

    saveCurrentCode();
    state.liveResult = true;
    state.networkBusy = true;
    setStatus("正在创建提交", "busy");
    refreshControls();
    switchTab("result");
    setResultText("正在创建正式提交…", "提交中", "busy");

    try {
      const body = protocol.buildSubmissionBody({
        problemSetProblemId: state.problem.id,
        code: el.code.value,
        compiler: state.compiler
      });
      const response = await requestJson(
        `/api/exams/${encodeURIComponent(state.exam.examId)}/exam-submissions`,
        { method: "POST", body }
      );
      const submissionId = response && response.submissionId ? String(response.submissionId) : "";
      if (!submissionId) throw new Error("提交响应缺少 submissionId。");

      state.activeSubmissionId = submissionId;
      state.ownSubmissionIds.add(submissionId);
      state.polling = true;
      const token = ++state.pollToken;
      state.networkBusy = false;
      refreshControls();
      setResultText(
        "提交 ID: " + submissionId + "\n提交状态: 等待评测 (WAITING)\n\n正在轮询判题结果…",
        "等待评测",
        "busy"
      );
      await pollSubmission(submissionId, token);
    } catch (error) {
      state.polling = false;
      setResultText(error.message || String(error), "提交失败", "error");
      setNotice(error.message || String(error), "error", 0);
      setStatus("提交失败", "error");
    } finally {
      state.networkBusy = false;
      refreshControls();
    }
  }

  async function pollSubmission(submissionId, token) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let delay = 900;
    let consecutiveErrors = 0;

    while (Date.now() < deadline && state.pollToken === token) {
      try {
        const response = await requestJson(
          `/api/exams/${encodeURIComponent(state.exam.examId)}/submissions/${encodeURIComponent(
            submissionId
          )}`
        );
        if (state.pollToken !== token) return;
        consecutiveErrors = 0;
        state.liveResult = true;
        const result = protocol.formatJudgeResult(
          response,
          judgeFormatOptions(state.problem)
        );

        if (result.terminal) {
          state.polling = false;
          state.activeSubmissionId = submissionId;
          handleJudgePayload(response, true);
          return;
        }

        setResultText(result.text, protocol.statusLabel(result.status), "busy");
        setStatus(
          result.status === "JUDGING" ? "正在评测" : "等待评测队列",
          "busy"
        );
      } catch (error) {
        if (state.pollToken !== token) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) {
          state.polling = false;
          const message =
            "轮询中断，但提交可能仍在评测。\n提交 ID: " +
            submissionId +
            "\n\n" +
            (error.message || String(error));
          setResultText(message, "轮询中断", "error");
          setNotice(message, "error", 0);
          setStatus("轮询中断", "error");
          refreshControls();
          return;
        }
        setNotice("判题轮询暂时失败，正在重试。", "warn");
      }

      await sleep(delay);
      delay = Math.min(3000, Math.round(delay * 1.25));
    }

    if (state.pollToken !== token) return;
    state.polling = false;
    const message =
      "等待判题超过 5 分钟。提交可能仍在服务端评测。\n提交 ID: " +
      submissionId +
      "\n可稍后在原页面查看该提交。";
    setResultText(message, "等待超时", "error");
    setNotice(message, "warn", 0);
    setStatus("等待判题超时", "error");
    refreshControls();
  }

  function handleJudgePayload(payload, ownSubmission) {
    state.liveResult = true;
    const result = protocol.formatJudgeResult(
      payload,
      judgeFormatOptions(state.problem)
    );
    state.resultText = result.text;
    state.resultFailed = result.terminal && result.failed;
    const submission = payload && payload.submission ? payload.submission : {};
    if (submission.id) state.activeSubmissionId = String(submission.id);

    const tone = !result.terminal
      ? "busy"
      : result.failed
        ? "error"
        : "success";
    setResultText(result.text, protocol.statusLabel(result.status), tone);
    switchTab("result");

    if (!result.terminal) {
      setStatus("正在评测", "busy");
      return;
    }

    state.polling = false;
    refreshControls();
    if (result.failed) {
      setStatus("未通过", "error");
      if (ownSubmission && state.ownSubmissionIds.has(String(submission.id || ""))) {
        clearCode("judge");
        setNotice("本题未通过。完整可见结果已保留，作答区已清空，可恢复上次代码。", "error", 0);
      } else {
        setNotice("该提交未通过。结果来自页面当前判题响应。", "error");
      }
    } else {
      setStatus("答案正确", "ready");
      setNotice("本题已通过。", "success");
    }
  }

  function clearCode(reason) {
    if (!state.problem || !el || !el.code.value) return;
    state.lastClearedCode = el.code.value;
    state.lastClearedProblemId = state.problem.id;
    el.code.value = "";
    state.codeByProblem.set(state.problem.id, {
      code: "",
      compiler: state.compiler
    });
    refreshControls();
    if (reason === "manual") {
      setNotice("作答区已清空，可通过“恢复上次代码”找回。", "info");
    }
  }

  function restoreClearedCode() {
    if (
      !state.problem ||
      state.lastClearedProblemId !== state.problem.id ||
      !state.lastClearedCode
    ) {
      return;
    }
    el.code.value = state.lastClearedCode;
    saveCurrentCode();
    refreshControls();
    setNotice("已恢复清空前的代码。", "info");
  }

  function cancelPolling() {
    if (!state.polling) return;
    state.polling = false;
    state.pollToken += 1;
    const submissionId = state.activeSubmissionId || "未知";
    state.resultText =
      "已停止客户端轮询。服务端提交可能仍在评测。\n提交 ID: " + submissionId;
    setResultText(state.resultText, "已停止等待", "error");
    setNotice("已停止等待；这不会取消服务端判题。", "warn");
    setStatus("已停止等待", "error");
    refreshControls();
  }

  function setResultText(text, badge, tone) {
    if (!el) return;
    state.resultText = String(text || "");
    el.resultOutput.textContent = state.resultText;
    el.resultBadge.textContent = badge || "暂无结果";
    el.resultBadge.dataset.tone = tone || "";
    el.copyResult.disabled = !state.resultText;
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function safeUrl(value, allowDataImage) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (allowDataImage && /^data:image\//i.test(text)) return text;
    try {
      const url = new URL(text, window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch {
      return "";
    }
    return "";
  }

  function sanitizeToFragment(html) {
    const source = document.createElement("template");
    source.innerHTML = String(html || "");
    const nodes = Array.from(source.content.querySelectorAll("*"));

    for (const node of nodes) {
      if (!node.parentNode) continue;
      const tag = node.tagName.toLowerCase();
      if (REMOVE_WITH_CONTENT.has(tag)) {
        node.remove();
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        node.replaceWith(...node.childNodes);
        continue;
      }

      const originalClass = node.getAttribute("class") || "";
      const originalHref = node.getAttribute("href") || "";
      const originalSrc = node.getAttribute("src") || "";
      const originalAlt = node.getAttribute("alt") || "";
      const colspan = node.getAttribute("colspan") || "";
      const rowspan = node.getAttribute("rowspan") || "";
      const mathAttrs = {};
      for (const name of [
        "display",
        "encoding",
        "fence",
        "lspace",
        "mathvariant",
        "rspace",
        "separator",
        "stretchy",
        "xmlns"
      ]) {
        if (node.hasAttribute(name)) mathAttrs[name] = node.getAttribute(name);
      }

      for (const attribute of Array.from(node.attributes)) {
        node.removeAttribute(attribute.name);
      }

      if (tag === "a") {
        const href = safeUrl(originalHref, false);
        if (href) {
          node.setAttribute("href", href);
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      } else if (tag === "img") {
        const src = safeUrl(originalSrc, true);
        if (src) node.setAttribute("src", src);
        node.setAttribute("alt", originalAlt);
        node.setAttribute("loading", "lazy");
        node.setAttribute("referrerpolicy", "no-referrer");
      } else if (tag === "td" || tag === "th") {
        if (colspan) node.setAttribute("colspan", colspan);
        if (rowspan) node.setAttribute("rowspan", rowspan);
      } else if (tag === "code") {
        const languageClass = originalClass
          .split(/\s+/)
          .find((name) => name.startsWith("language-"));
        if (languageClass) node.setAttribute("class", languageClass);
      }

      for (const [name, value] of Object.entries(mathAttrs)) {
        if (value) node.setAttribute(name, value);
      }
    }
    return source.content;
  }

  function htmlToText(html) {
    const wrapper = document.createElement("div");
    wrapper.appendChild(sanitizeToFragment(html));
    let output = "";

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        output += node.nodeValue.replace(/\s+/g, " ");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (tag === "br") {
        output += "\n";
        return;
      }
      if (tag === "pre") {
        output += "\n" + node.textContent.replace(/\n+$/g, "") + "\n";
        return;
      }
      if (tag === "li") {
        output += "\n- ";
      } else if (tag === "td" || tag === "th") {
        if (output && !output.endsWith("\n") && !output.endsWith("\t")) output += "\t";
      } else if (BLOCK_TAGS.has(tag)) {
        if (output && !output.endsWith("\n")) output += "\n";
      }
      for (const child of node.childNodes) walk(child);
      if (tag === "li" || BLOCK_TAGS.has(tag)) {
        if (!output.endsWith("\n")) output += "\n";
      }
    }

    for (const child of wrapper.childNodes) walk(child);
    return output
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function questionCopyText(problem) {
    const lines = [];
    const titleLine = [problem.label, problem.title].filter(Boolean).join(" · ");
    lines.push(titleLine || "未命名题目", "");
    if (Number.isFinite(problem.score)) lines.push("分值: " + problem.score);
    if (Number.isFinite(Number(problem.config?.timeLimit))) {
      lines.push("时限: " + Number(problem.config.timeLimit) + " ms");
    }
    if (Number.isFinite(Number(problem.config?.memoryLimit))) {
      lines.push("内存: " + Number(problem.config.memoryLimit) + " KB");
    }
    if (lines[lines.length - 1] !== "") lines.push("");
    lines.push(htmlToText(problem.content || problem.description || ""));

    if (Array.isArray(problem.examples)) {
      problem.examples.forEach((example, index) => {
        lines.push("", "示例 " + (index + 1));
        if (example && example.input !== undefined) {
          lines.push("输入:", String(example.input));
        }
        if (example && example.output !== undefined) {
          lines.push("输出:", String(example.output));
        }
      });
    }

    const testCases = protocol.normalizeTestCaseConfig(problem.config?.cases || {});
    if (testCases.length) {
      lines.push("", "测试点摘要:");
      for (const testCase of testCases) {
        lines.push(
          "- " +
            testCase.name +
            ": " +
            (testCase.isPublic ? "公开" : "隐藏") +
            (Number.isFinite(testCase.score) ? "，" + testCase.score + " 分" : "")
        );
        if (testCase.showHint && testCase.hint) {
          lines.push("  提示: " + testCase.hint);
        }
        if (testCase.isPublic) {
          const cached = state.publicCaseData.get(
            publicCaseKey(problem.id, testCase.name)
          );
          if (cached && cached.data) {
            lines.push("  输入:", cached.data.input.text || "(空)");
            lines.push("  期望输出:", cached.data.output.text || "(空)");
          }
        }
      }
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  async function copyText(text, successMessage) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(successMessage, "success");
      return;
    } catch {
      // Fall back to a page-level selection for browsers that deny Clipboard API.
    }

    const temporary = document.createElement("textarea");
    temporary.value = text;
    temporary.style.position = "fixed";
    temporary.style.left = "-9999px";
    temporary.style.top = "0";
    document.documentElement.appendChild(temporary);
    temporary.focus();
    temporary.select();
    try {
      const copied = document.execCommand("copy");
      if (!copied) throw new Error("copy command failed");
      setNotice(successMessage, "success");
    } catch {
      setNotice("复制失败，请手动选择文本。", "error");
    } finally {
      temporary.remove();
    }
  }

  function updateForwardHeaders(headers) {
    if (!headers || typeof headers !== "object") return;
    for (const name of ["x-lollipop", "x-marshmallow"]) {
      const value = headers[name];
      if (typeof value !== "string" || !value || value.length > 4096) continue;
      state.apiHeaders[name === "x-lollipop" ? "X-Lollipop" : "X-Marshmallow"] = value;
    }
  }

  function handleBridgeMessage(event) {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.source !== BRIDGE_SOURCE || message.type !== "api-response") {
      return;
    }
    const payload = message.payload;
    if (!payload || typeof payload !== "object" || !payload.body) return;

    let sourceUrl;
    try {
      sourceUrl = new URL(payload.url, window.location.href);
    } catch {
      return;
    }
    if (sourceUrl.origin !== window.location.origin) return;
    const classification = protocol.classifyApiUrl(sourceUrl.href, window.location.href);
    if (!classification) return;
    updateForwardHeaders(payload.headers);

    if (classification.kind === "problem-detail") {
      if (classification.problemSetId !== state.routeProblemSetId) return;
      void applyProblem(payload.body, classification.problemSetId);
      return;
    }

    if (classification.kind === "exam-context") {
      if (classification.problemSetId !== state.routeProblemSetId) return;
      state.exam = protocol.normalizeExamContext(
        payload.body,
        classification.problemSetId
      );
      renderCompilerOptions();
      renderPolicy();
      refreshControls();
      if (state.problem) void loadLastSubmission(state.problem);
      if (!state.problemList.length && state.exam?.examId) {
        void loadProblemList(classification.problemSetId, true);
      }
      return;
    }

    if (classification.kind === "problem-list") {
      if (classification.problemSetId !== state.routeProblemSetId) return;
      state.problemList = protocol.normalizeProblemList(payload.body);
      renderProblemPicker();
      if (!state.problem && state.problemList.length === 1) {
        void loadProblemById(state.problemList[0].id);
      }
      return;
    }

    if (classification.kind === "exam-draft") {
      if (state.problem?.id !== classification.problemSetProblemId) return;
      const draft = protocol.extractDraft(payload.body);
      if (!el.code.value && draft.program) {
        el.code.value = draft.program;
      }
      if (!state.compilerTouched && draft.compiler) {
        state.compiler = protocol.chooseCompiler(state.exam?.compilers, draft.compiler);
      }
      renderCompilerOptions();
      saveCurrentCode();
      refreshControls();
      return;
    }

    if (classification.kind === "submission") {
      const submission = payload.body && payload.body.submission;
      if (!submission || !submission.status) return;
      if (
        submission.problemSetProblemId &&
        state.problem?.id &&
        String(submission.problemSetProblemId) !== state.problem.id
      ) {
        return;
      }
      handleJudgePayload(payload.body, false);
    }
  }

  window.addEventListener("message", handleBridgeMessage);

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  ready(() => {
    syncRoute();
    routeTimer = window.setInterval(syncRoute, 900);
    window.addEventListener("pagehide", () => {
      if (routeTimer) window.clearInterval(routeTimer);
      state.pollToken += 1;
    });
  });
})();
