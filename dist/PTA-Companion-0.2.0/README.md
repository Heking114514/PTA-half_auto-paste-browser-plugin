# PTA Companion

Chrome / Edge Manifest V3 扩展。它在 PTA 考试页面右侧注入独立工作台，自动同步当前编程题，提供题目复制、代码作答、草稿保存、正式提交和判题结果轮询。

扩展复用当前浏览器登录态，不读取或保存账号密码，不包含自动答题、静默提交、隐藏测试点获取等逻辑。

## 功能

- 从页面 API 响应自动识别当前 `problemSetProblemId`
- 从题目详情接口渲染标题、正文、样例、分值和资源限制
- 使用插件自己的代码区和编译器选择
- 自动读取已有草稿
- 显式保存草稿
- 显式创建正式提交
- 轮询 `WAITING / JUDGING / terminal` 判题状态
- 展示分数、耗时、内存、编译日志和可见测试点结果
- 一键复制题目正文和判题结果
- 未通过时清空插件作答区，并保留“恢复上次代码”
- 识别题目列表，无法自动定位时允许手动选题

## 明确边界

当前版本只对 `PROGRAMMING` 题型启用作答和提交。判断题、选择题、填空题和主观题没有纳入线上协议验证。

扩展遵守页面返回的以下考试配置：

- `allowSubmitExam`
- exam 的 `ended` 状态
- `hideProgrammingJudgeResponseContents`

`forbidPasting` 仅保留为配置字段，插件不会限制粘贴或拖放，因此 true 与 false 的行为一致。

服务端没有返回的隐藏测试输入、标准输出或 checker 差异不会被猜测或补造。

## 安装

1. 将 ZIP 完整解压到一个长期保留的目录。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 开启“开发者模式”。
4. 选择“加载已解压的扩展程序”。
5. 选择直接包含 `manifest.json` 的目录，不要选择 ZIP 文件或它的上级目录。
6. 在扩展卡片上确认 PTA Companion 已启用。
7. 关闭旧 PTA 标签页，重新打开考试页面。

安装或重载扩展后，已经打开的 PTA 页面不会自动补注入脚本，因此必须重新打开页面。如果面板仍未自动出现，点击工具栏或扩展菜单中的 PTA Companion 图标主动启动；徽标显示 `ON` 表示启动成功，显示 `!` 表示启动失败。

更新扩展时，用新文件覆盖原解压目录，然后在扩展管理页点击“重新加载”。

## 使用

1. 进入 `https://pintia.cn/problem-sets/{problemSetId}/exam/...`。
2. 打开任意编程题。
3. 右下角会显示“题目工作台”。
4. 在“作答”页编辑代码。
5. 点击“正式提交”，浏览器会先显示一次确认框。
6. “结果”页会持续轮询，直到终态或 5 分钟超时。
7. 未通过时复制结果，作答区会被清空；可用“恢复上次代码”找回。

如果右下角没有出现“题目工作台”，点击工具栏或扩展菜单中的 PTA Companion 图标主动注入。扩展没有弹窗；图标徽标显示 `ON` 才表示页面注入成功。

如果扩展没有自动同步当前题目：

- 点击面板右上角“刷新”。
- 切换到下一题再切回来。
- 如果题目列表已加载，使用标题下方的题目下拉框。

## 协议映射

扩展使用抓包验证过的接口：

```text
GET  /api/problem-sets/{problemSetId}/exams
GET  /api/problem-sets/{problemSetId}/exam-problem-list
GET  /api/problem-sets/{problemSetId}/exam-problems/{problemSetProblemId}
GET  /api/problem-sets/problems/{problemSetProblemId}/exam-draft
POST /api/problem-sets/problems/{problemSetProblemId}/exam-draft
POST /api/exams/{examId}/exam-submissions
GET  /api/exams/{examId}/submissions/{submissionId}
```

正式提交保持抓包中的字段约定：

```json
{
  "problemType": "PROGRAMMING",
  "details": [
    {
      "problemId": "0",
      "problemSetProblemId": "<problemSetProblemId>",
      "programmingSubmissionDetail": {
        "program": "<source-code>",
        "compiler": "GCC"
      }
    }
  ]
}
```

所有 PTA 资源 ID 始终按字符串处理，避免超过 JavaScript 安全整数范围后失真。

## 结构与权限

```text
manifest.json
src/background.js     工具栏启动入口与页面脚本注入
src/protocol.js       协议 URL、请求 body、状态与结果格式化
src/page-bridge.js    MAIN world 页面 fetch/XHR 响应桥
src/content.js        ISOLATED world 侧栏控制器
src/content.css       Shadow DOM 样式
icons/                16/32/48/128 PNG 图标
```

扩展只访问 `pintia.cn` 和 `www.pintia.cn`。`activeTab` 和 `scripting` 仅在用户点击扩展图标时启用主动注入，不申请 `tabs`、`cookies`、`webRequest` 或历史记录权限。
