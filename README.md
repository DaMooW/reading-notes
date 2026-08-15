# 拾页 · 读书笔记

把书中的**关键数据、年代、原文定位**与**你的思考、联想**连成一张网。为研读《日本大衰退》这类带数据与因果逻辑的书而设计，纯前端 + 零服务器，数据只存在你自己的设备里。

## 功能

### 书籍管理（首页）
- **首页即书架**：每本书一个研读空间（笔记 / 拆书 / 原文定位都在书内）；支持新建书籍、导入电子书（EPUB/PDF/TXT/MD，自动解析全文存本机）、删除整书
- **《日本大衰退》研读包**：一键载入 21 条结构化笔记 + 25 条因果链（自撰示例内容，标注【示例】，可编辑/删除），直接可看时间轴、对比图、因果链效果

### 笔记核心
- **笔记**：标题、所属书、年代（起止年份 + 时间标签）、原文定位（章节/页码/原文摘录）、关键数据点（指标/数值/单位/年份/说明）、我的思考/联想、标签
- **时间轴**：按年代把笔记铺成一条线，看事件如何一步步发生
- **数据对比图**：把「关键数据点」自动画成折线（x=年代，按指标分系列，图例可开关、点数据点回笔记）
- **因果链图**：笔记之间用带类型的关系连线（导致/促进/循环/反转/对比/联想），拖动节点、缩放画布
- **数据管理**：一键导出/导入 JSON 备份，数据仅存本机浏览器（localStorage）

### AI Native 能力（v2，只需一个 DeepSeek API Key）
- **✨ AI 记笔记助手**：粘贴原文/转述（或拍照 OCR 识别书页）→ AI 生成结构化笔记草稿填入表单：标题、年代、关键数据点、原文摘录、思考、标签，并**建议与已有笔记的关联**（关系类型 + 理由），一键接受
- **💡 自动关联**：保存笔记后 AI 自动判断「这条该和哪几条连线」，以建议形式呈现，人工确认后生效
- **💬 追问 AI**：每条笔记底部可直接提问，AI 只基于「本条笔记 + 因果链邻居 + 数据点」回答，不编造，并给出可继续追问的问题
- **📚 书库 + AI 拆书**：导入电子书（EPUB/PDF/TXT/MD，全文存本机 IndexedDB）→ 一键拆书：AI 逐章生成笔记草稿（含原文定位）→ **审阅队列**逐条采纳/修改/丢弃；任何笔记可「书库定位原文」自动回填章节与摘录
- **草稿态原则**：所有 AI 产出以草稿态（黄标）入库，你确认后才成为正式笔记——笔记库始终只有你自己的判断

## 使用

### Mac
浏览器打开线上地址（GitHub Pages）。

### iPhone / iPad
1. Safari 打开线上地址
2. 点分享按钮 → **添加到主屏幕**
3. 从主屏图标进入，全屏使用

> 数据按「设备 + 浏览器」本地保存，两台设备之间的数据暂不互通；换设备或想备份时用「数据 → 导出/导入」。

## AI 功能配置（两步，无需任何服务器）

1. **DeepSeek API Key**：[platform.deepseek.com](https://platform.deepseek.com) 注册并充值（¥10 起），创建 API Key（sk- 开头）。
2. **拾页里配置**：右上「⚙ 数据 → AI 设置」填入 API Key → 保存。

拾页默认**直连 DeepSeek 官方 API**（已验证支持浏览器跨域、国内网络可达），你的 Key 只存在本机浏览器、只发送给 DeepSeek 官方，不需要任何服务器或代理。

> 可选：`../reading-notes-worker` 是一个无状态代理（Cloudflare Worker），供未来代理行情数据等场景使用；如自行部署了代理，把地址填进「代理地址」即切换，留空保持直连。

> 不配 AI 也完全可用：拾页的核心笔记功能不依赖任何 AI 或服务器。

## 更新与部署

```bash
git add -A && git commit -m "更新" && git push
```

GitHub Pages 会自动重新发布。若想改动外观/功能：

- 界面：`js/ui.js`、`css/style.css`、`index.html`
- 数据模型/预置数据：`js/db.js`
- AI 层（密钥/Worker 客户端/提示词/OCR）：`js/ai.js`
- 书库（IndexedDB/拆书任务/原文定位）：`js/library.js`、`js/library-ui.js`、`js/library-parse.js`
- 三个可视化：`js/timeline.js`、`js/charts.js`、`js/graph.js`
- 离线缓存：`sw.js`（改内容后请把 `CACHE` 版本号 +1）

## 本地开发

```bash
python3 -m http.server 8000   # 在项目目录运行
# 打开 http://127.0.0.1:8000
# 测试 AI 功能无需真实 Key：cd ../reading-notes-worker && node mock/deepseek-mock.js
# 然后在浏览器控制台执行：
#   localStorage.setItem('shiye_ai_key','sk-test-1')
#   localStorage.setItem('shiye_ai_base_url','http://127.0.0.1:8790')
# 刷新后 AI 功能即走本地 mock（无真实调用、无费用）
```

## 目录结构

```
index.html            入口
css/style.css         样式
js/db.js              数据层（localStorage + 《日本大衰退》研读包）
js/ui.js              书籍内笔记/详情/编辑/AI 整理/追问/数据管理
js/ai.js              AI 层（密钥管理、直连 DeepSeek、提示词、OCR 懒加载）
js/library.js         书库数据层（IndexedDB、拆书任务、原文定位搜索）
js/library-ui.js      书籍管理主页（书架/新建/导入/拆书）
js/library-parse.js   EPUB/PDF/TXT/MD 解析（ShiyeParse）
js/timeline.js        时间轴
js/charts.js          数据对比图（ECharts）
js/graph.js           因果链图（ECharts）
js/app.js             路由与启动
sw.js                 Service Worker（离线 + CDN 按需缓存）
manifest.webmanifest  PWA 清单
icons/                图标（make-icons.js 可重新生成）
vendor/               echarts / jszip / pdf.js（全部本地化，离线可用）
test/samples/         示例拆书文本（自撰，体验拆书流程用）
test/                 解析模块测试夹具
tools/test-parse.html 书文件解析可视化测试页
```

## 关于「日本大衰退」资料

本仓库**不包含、也不提供原书的 PDF/TXT 等盗版资源**（受版权保护）。仓库中的研读包与示例拆书文本均为**根据公开资料自撰的示例内容**，摘录字段统一标注【示例】。建议的使用方式：

1. 阅读你的正版纸质书/电子书时，用「✨ AI 整理」拍照/粘贴原文，或导入你合法持有的电子书文件一键拆书；
2. 示例文本（`test/samples/日本大衰退-示例拆书文本.txt`）可用于先体验拆书流程，体验后可删除。
