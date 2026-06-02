# OpenRouter AI 接入中控台 MVP 设计

日期：2026-06-03

## 背景

中控台当前已经可以从本地商品资料 Excel 中解析款号、商品图、SKU、尺码表，并导出 `商品总表`、`上架任务表`、`SKU明细`、`尺码表`、`异常记录`。下一阶段目标是在不影响现有无 AI 流程的前提下，把 OpenRouter 多模态识别接入本地桌面工具，让中控人员先验收 AI 生成的商品名、抖音主标题、副标题和属性。

旧网页工具 `/Users/qiyiyi/Downloads/plus-size-fashion-attribute-extractor` 只作为参考，不被中控台改动影响。可复用内容包括默认 Prompt、属性库、OpenRouter 错误归类和结构化返回思路；不可复用 Netlify 代理、热词输入、模型市场、批量模型测试、历史记录、单图上传界面和自定义 Prompt 编辑。

## 目标

1. 在中控台新增 AI 配置区，支持启用/关闭 AI、填写 OpenRouter API Key、填写 OpenRouter 模型 ID、测试连接。
2. OpenRouter 由 Electron 主进程本地直连，不走旧网页工具 Netlify 代理，不接 Google Gemini。
3. 批处理新增可选 AI 阶段：未启用 AI 时，现有流程和导出保持可用；启用 AI 时，只对已有 `images/款号.png` 的商品执行识别。
4. AI 成功结果写入 `ProductRecord.aiResult` 和导出表；AI 失败不终止批次，只写日志、处理提示和导出错误字段。
5. 第一版不做抖店自动化，只让用户验收 AI 导出的标题、属性和商品名是否稳定。

## 非目标

本版本不做以下能力：

- 抖店自动创建商品链接
- Google Gemini
- 旧网页工具 Netlify 代理
- 热词输入
- 模型市场或自动推荐
- 大批量模型测试
- 自定义 Prompt 编辑
- 历史记录
- 单图上传界面
- 花名评分反馈
- API Key 明文写入日志或导出表

## 推荐方案

采用“单次综合识别”方案。每个商品最多执行一次多模态请求，请求内容包含商品图片、系统类目、原始名称、颜色、面料、成分和该类目可选属性，要求模型一次返回：

- `productName`：AI 商品名
- `title`：AI 抖音主标题
- `subtitle`：AI 副标题
- `attributes`：属性 JSON

选择这个方案的原因：

- 比旧网页工具的“属性识别、标题生成、商品名生成”多段式调用更省 tokens。
- 批处理失败点更少，进度和日志更容易理解。
- 导出表一次写齐 AI 验收字段，符合中控台第一版目标。

风险是 Prompt 需要更稳定。为降低风险，第一版会强制 JSON 输出、给出属性选项约束、限制标题和副标题长度，并在解析失败时把原始错误归类写入 `AI识别错误`。

## 用户界面设计

在现有右侧操作区新增一个紧凑的 `AI 配置` 区块，放在输出目录和开始处理按钮之间。

字段：

- `启用 AI 识别`：开关或复选框，默认关闭。
- `OpenRouter API Key`：密码输入框，输入内容不进入日志和导出表。
- `OpenRouter 模型 ID`：文本输入框，默认可以为空或使用推荐默认值。实现计划中再根据当前代码选择具体默认值，建议为支持图片的 OpenRouter 模型 ID，而不是 `openrouter/auto`。
- `测试连接`：按钮，触发两步测试。
- `测试状态`：显示成功、模型不存在、不支持图片、API Key 无效、余额不足、网络失败等简短状态。

交互规则：

- AI 未启用时，API Key 和模型 ID 可保留输入，但批处理不调用 AI。
- AI 启用时，开始处理前必须有 API Key 和模型 ID。
- 测试连接不是开始处理的强制前置条件；用户可以直接开始处理，但失败会记录到 AI 错误字段。
- 测试连接按钮需要在请求中禁用，避免重复点击。

## 连接测试设计

测试连接分两步，尽量节省 tokens。

第一步：查模型信息。

- 请求：`GET https://openrouter.ai/api/v1/models`
- 作用：
  - 验证 OpenRouter API Key 是否可用于访问接口。
  - 检查模型 ID 是否存在。
  - 检查模型 `architecture.input_modalities` 是否包含 `image`。
- 不调用生成接口，基本不消耗模型 tokens。

第二步：极短文本测试。

- 请求：`POST https://openrouter.ai/api/v1/chat/completions`
- 输入：要求模型只返回 `OK`。
- `max_tokens` 设置为 3 或 5。
- 不上传图片，不跑正式 Prompt。
- 作用：确认该模型能完成最小生成调用，捕获余额不足、模型供应商不可用、权限不可用等问题。

测试返回结构建议：

```ts
interface AiConnectionTestResult {
  ok: boolean;
  modelExists: boolean;
  supportsVision: boolean;
  textGenerationOk: boolean;
  warning?: string;
  error?: string;
  errorType?: 'api_key' | 'model_missing' | 'vision_unsupported' | 'quota' | 'rate_limit' | 'provider' | 'network' | 'unknown';
}
```

## 批处理流程设计

现有流程：

1. 扫描资料文件夹
2. 解析 Excel
3. 提取商品图
4. 生成尺码表图片
5. 导出总表
6. 写日志

启用 AI 后流程调整为：

1. 扫描资料文件夹
2. 解析 Excel
3. 提取商品图
4. 生成尺码表图片
5. AI 识别
6. 导出总表
7. 写日志

AI 阶段规则：

- `BatchProgress.stage` 新增 `'ai'`。
- 只处理成功解析且有 `product.imagePath` 的商品。
- 没有图片的商品设为 `skipped`，错误文案为 `缺少商品图片，已跳过 AI 识别`。
- 单个商品 AI 失败不抛出到整个批次，只写入该商品 `aiResult.status = 'error'` 和日志。
- 批处理总状态仍以原有解析、图片、尺码表警告为主；AI 错误会追加到 `reason`，使结果行显示 `warning`，除非该款号本身未找到。

## 类型设计

`ProductRecord` 新增可选字段：

```ts
export interface ProductAiResult {
  status: 'pending' | 'success' | 'skipped' | 'error';
  productName: string;
  title: string;
  subtitle: string;
  attributes: Record<string, string>;
  error: string;
  model: string;
}
```

```ts
export interface ProductRecord {
  // existing fields
  aiResult?: ProductAiResult;
}
```

批处理输入新增 AI 配置：

```ts
export interface AiBatchConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
}
```

```ts
export interface ProcessBatchInput {
  styleNumberText: string;
  workbookPaths: string[];
  workbookDirectory?: string;
  outputDir: string;
  ai?: AiBatchConfig;
  onProgress?: (progress: BatchProgress) => void;
}
```

命名上可以保留现有 `processBatchWithoutAi` 作为兼容包装，也可以在实施时改为 `processBatch` 并让 `processWithoutAi` 前端 API 逐步迁移。设计倾向于新增通用 `processBatch`，让未启用 AI 的路径保持现有行为。

## AI 服务设计

新增主进程服务文件，职责拆分如下：

- `src/main/services/ai/openRouterClient.ts`：OpenRouter HTTP 请求、模型列表、极短文本测试、正式 chat completions 调用、错误归类。
- `src/main/services/ai/prompts.ts`：中控台默认综合 Prompt。参考旧工具 Prompt，但合并为一次输出。
- `src/main/services/ai/attributeLibrary.ts`：迁移旧工具属性库，保持本地静态数据。
- `src/main/services/ai/productAiRecognizer.ts`：把 `ProductRecord`、图片文件、属性库组装为请求，并解析模型 JSON。

正式识别请求内容：

- 图片：读取 `product.imagePath`，转为 base64 data URL。
- 类目：优先使用 `product.systemCategory`。如属性库没有完全匹配类目，使用宽松映射或空属性列表，仍允许生成标题和商品名。
- 商品资料：款号、原始名称、颜色、面料、成分。
- 属性列表：只传当前类目相关属性，避免把完整属性库塞进每次请求。

正式识别输出要求：

```json
{
  "productName": "",
  "title": "",
  "subtitle": "",
  "attributes": {
    "属性名": "属性值"
  }
}
```

解析规则：

- 优先解析模型返回中的 JSON 对象。
- 若模型返回 Markdown 包裹或前后带解释，尝试提取第一个 JSON 对象。
- 解析失败时返回 `status: 'error'`，错误文案为 `AI 返回不是合法 JSON`。
- `attributes` 必须是对象；不是对象时按空对象处理并写提示。

## 导出设计

`上架任务表` 在现有字段后新增：

- `AI识别状态`
- `AI商品名`
- `AI抖音主标题`
- `AI副标题`
- `AI属性JSON`
- `AI识别错误`

`商品总表` 可同步新增同样字段，方便人工总览。第一版以 `上架任务表` 为优先读取表；如果实现成本需要控制，至少保证 `上架任务表` 新字段完整。

字段写入规则：

- AI 成功：状态写 `成功`，商品名、标题、副标题、属性 JSON 写入对应字段，错误为空。
- AI 跳过：状态写 `跳过`，错误写跳过原因。
- AI 失败：状态写 `失败`，错误写归类后的错误文案。
- 未启用 AI：状态写 `未启用`，其余 AI 字段为空。

`异常记录` 不因单个 AI 失败新增“款号未找到”式异常行，避免把可人工复核的 AI 失败和资料解析失败混在一起。AI 失败进入日志、处理提示和 AI 字段。

## 日志与错误处理

日志新增信息：

- AI 阶段开始：`AI 识别开始，共 N 个商品`
- 单商品成功：`AI 识别完成`
- 单商品跳过：`缺少商品图片，已跳过 AI 识别`
- 单商品失败：归类错误，如 `API Key 无效`、`模型不存在或已下线`、`模型不支持图片输入`、`余额不足或额度不可用`、`网络连接失败`、`AI 返回不是合法 JSON`

敏感信息规则：

- 不记录 API Key。
- 不把 Authorization header、完整请求体、图片 base64 写入日志。
- 可以记录模型 ID。

## 测试设计

单元测试覆盖：

1. OpenRouter 错误归类：401、403、404、429、402、provider unavailable、network。
2. 模型能力判断：模型存在且支持 image、存在但不支持 image、不存在。
3. AI 返回 JSON 解析：纯 JSON、Markdown 包裹 JSON、非法 JSON。
4. 批处理 AI 阶段：
   - AI 未启用时不调用识别服务。
   - AI 启用且有图片时写入 success。
   - 缺少图片时写入 skipped。
   - 单商品 AI 失败不中断导出。
5. 导出表新增 AI 字段和 JSON 字段。
6. IPC 参数校验：启用 AI 时 API Key 和模型 ID 必须是字符串。

集成验证：

- `npm run test`
- `npm run build`
- Windows 打包仍由现有 `npm run dist:win` 和 GitHub Actions 验证。

## 实施顺序建议

1. 增加 AI 类型、Prompt、属性库和 OpenRouter 客户端测试。
2. 实现连接测试 IPC 和前端 AI 配置区。
3. 实现商品 AI 识别服务和 JSON 解析。
4. 把 AI 阶段接入批处理。
5. 扩展导出表。
6. 跑测试和构建。

## 验收标准

1. AI 未启用时，现有批处理结果、导出表、图片、尺码表和日志仍正常。
2. AI 启用时，有商品图的款号会进入 AI 阶段并在进度条显示 `ai` 阶段。
3. 单个商品 AI 失败不会中断整个批次，最终仍会导出总表和日志。
4. `上架任务表` 包含 AI 状态、商品名、抖音主标题、副标题、属性 JSON 和错误字段。
5. 测试连接可以识别 API Key 无效、模型不存在、模型不支持图片输入、极短文本生成失败等情况。
6. 日志和导出表不泄露 API Key。
7. 旧网页工具目录没有被修改。

## 自检结果

- 未发现占位符、未完成标记或缺失需求。
- 范围聚焦 OpenRouter AI MVP，没有包含抖店自动化。
- 类型、导出字段、批处理阶段和 UI 配置命名保持一致。
- 明确了 AI 失败不中断批次、缺图跳过、未启用 AI 的导出状态。
