# 拾页 · 读书笔记

把书中的**关键数据、年代、原文定位**与**你的思考、联想**连成一张网。为研读《日本大衰退》这类带数据与因果逻辑的书而设计，纯前端、零服务器、数据只存在你自己的设备里。

## 功能

- **笔记**：每条笔记包含标题、所属书、年代（起止年份 + 时间标签）、原文定位（章节/页码/原文摘录）、关键数据点（指标/数值/单位/年份/说明）、我的思考/联想、标签
- **时间轴**：按年代把笔记铺成一条线，看事件如何一步步发生
- **数据对比图**：把「关键数据点」自动画成折线（x=年代，按指标分系列，图例可开关、点数据点回笔记）
- **因果链图**：笔记之间用带类型的关系连线（导致/促进/循环/反转/对比/联想），拖动节点、缩放画布
- **数据管理**：一键导出/导入 JSON 备份，数据仅存本机浏览器（localStorage）
- **PWA**：可添加到主屏幕像 App 一样用，支持离线打开

## 使用

### Mac
浏览器打开线上地址（GitHub Pages），或本地任意静态服务器。

### iPhone / iPad
1. Safari 打开线上地址
2. 点分享按钮 → **添加到主屏幕**
3. 从主屏图标进入，全屏使用

> 数据按「设备 + 浏览器」本地保存，两台设备之间的数据暂不互通；换设备或想备份时用「数据 → 导出/导入」。

## 更新与部署

```bash
git add -A && git commit -m "更新" && git push
```

GitHub Pages 会自动重新发布。若想改动外观/功能：

- 界面：`js/ui.js`、`css/style.css`、`index.html`
- 数据模型/预置数据：`js/db.js`
- 三个可视化：`js/timeline.js`、`js/charts.js`、`js/graph.js`
- 离线缓存：`sw.js`（改内容后请把 `CACHE` 版本号 +1）

## 本地开发

```bash
python3 -m http.server 8000   # 在项目目录运行
# 打开 http://127.0.0.1:8000
```

## 目录结构

```
index.html            入口
css/style.css         样式
js/db.js              数据层（localStorage + 预置示例）
js/ui.js              列表/详情/编辑/数据管理
js/timeline.js        时间轴
js/charts.js          数据对比图（ECharts）
js/graph.js           因果链图（ECharts）
js/app.js             路由与启动
sw.js                 Service Worker（离线）
manifest.webmanifest  PWA 清单
icons/                图标（make-icons.js 可重新生成）
vendor/echarts.min.js ECharts（本地化，离线可用）
```
