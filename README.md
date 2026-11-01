# PTA Companion 0.2.0

Chrome / Edge Manifest V3 扩展。它在 PTA 考试页面注入独立工作台，自动同步当前编程题，并支持：

- 题目正文、样例、分值和资源限制
- 测试点名称、单项分值、公开/隐藏属性及可用提示
- 最近一次提交的判题结果和测试点状态
- 正式提交后的异步判题轮询
- 编译日志、公开 stdout/stderr、测试点耗时和内存
- 题目正文和判题结果复制
- 未通过后清空插件作答区，并允许恢复
- 明确标记为公开的测试点，可按需读取输入和期望输出

扩展复用当前浏览器登录态，不保存账号密码，不自动答题，不静默提交。

## 安装

1. 下载并解压 `dist/PTA-Companion-0.2.0.zip`。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 开启“开发者模式”。
4. 选择“加载已解压的扩展程序”，选择解压后直接包含 `manifest.json` 的目录。
5. 安装或重载后，刷新已经打开的 PTA 页面。
6. 如果自动注入未生效，点击浏览器工具栏中的 PTA Companion 图标手动启动。

开发者也可以直接加载仓库根目录。

## 测试点数据说明

PTA 实际下发的是两层数据。

### 题目详情中的测试点元数据

`problemConfig.programmingProblemConfig.cases` 包含：

- 测试点名称
- 单项分值
- `isPublic`
- `showHint`
- 可选提示 `hint`

插件会直接展示这些元数据。抓包中的 16 个编程测试点全部为 `isPublic=false`。

### 提交结果中的测试点状态

终态提交的 `judgeResponseContents[0].programmingJudgeResponseContent.testcaseJudgeResults` 包含：

- `result`
- `testcaseScore`
- `time`
- `memory`
- `exitcode`
- `termsig`
- `error`
- `stdout`
- `stderr`
- `checkerOutput`
- `showOutput`

抓包中的 `showOutput` 全部为 `false`，对应输出字段也都是空字符串。因此插件可以显示测试点结果、分值和资源占用，但不会伪造隐藏测试输入或期望输出。

### 公开测试点接口

前端还声明了：

```text
GET /api/problem-sets/{problemSetId}:omit/problems/{problemSetProblemId}/{caseName}
```

插件只有在 `cases[caseName].isPublic === true` 时才允许用户点击“读取公开数据”。返回结构中的 `testCase.input.text` 和 `testCase.output.text` 会显示在题目页。

`isPublic=false` 的测试点不会调用该接口，也不会调用题库管理端的测试点读取或下载接口。

## 使用

1. 进入 PTA 考试编程题。
2. 右下角出现“题目工作台”；也可点击工具栏图标手动注入。
3. “题目”页显示正文、样例和测试点摘要。
4. 对公开测试点，可点击“读取公开数据”。
5. “结果”页会尝试载入最近一次提交；正式提交后会持续轮询当前提交。
6. 未通过时结果可复制，作答区自动清空，可用“恢复上次代码”找回。

## 判题状态

已根据前端状态枚举补齐：

- 非终态：`WAITING`、`JUDGING`、`REJUDGING`
- 正常终态：`ACCEPTED`
- 失败终态：编译、答案、格式、部分通过、多种错误、内部错误、超时、内存、输出、段错误、浮点错误、非零返回、样例错误、checker/interactor 错误等

其中 `MULTIPLE_ERROR` 和 `SEGMENTATION_FAULT` 已纳入测试。

## 协议接口

```text
GET  /api/problem-sets/{problemSetId}/exams
GET  /api/problem-sets/{problemSetId}/exam-problem-list
GET  /api/problem-sets/{problemSetId}/exam-problems/{problemSetProblemId}
GET  /api/problem-sets/problems/{problemSetProblemId}/exam-draft
POST /api/problem-sets/problems/{problemSetProblemId}/exam-draft
GET  /api/exams/{examId}/problem-sets/{problemSetId}/last-submissions
POST /api/exams/{examId}/exam-submissions
GET  /api/exams/{examId}/submissions/{submissionId}
GET  /api/problem-sets/{problemSetId}:omit/problems/{problemSetProblemId}/{caseName}
```

最后一个接口仅对 `isPublic=true` 的测试点按需调用。

## 权限

- `activeTab`、`scripting`：工具栏按钮手动注入
- `pintia.cn`、`www.pintia.cn`：站点访问
- Shadow DOM：隔离页面样式
- 无 `cookies`、`webRequest`、`tabs`、远程代码或后台数据上报

## 测试

```powershell
npm test
```

测试覆盖 Manifest、工具栏注入、脚本文件、协议 URL、64 位字符串 ID、草稿和提交 body、真实判题状态、测试点元数据、公开测试点结构及结果格式化。

可选浏览器烟测：

```powershell
npm run test:browser
```

品牌版 Chrome/Edge 可能禁用 `--load-extension` 命令行侧载；这种情况下使用扩展管理页手动加载。
