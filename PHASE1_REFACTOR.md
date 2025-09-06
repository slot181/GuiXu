# 阶段 1：CSS 模块化重构实施文档（进行中）

本文件用于记录“阶段 1”的重构目标、目录规划、实施步骤、变更说明与回归验收点，保证执行过程不偏离目标。请仅在本文件内同步更新阶段内的决策与进度。

## 背景与目标

- 背景：现有 `css/guixu.css` 体量较大，基础/组件/视图（桌面/移动）与状态（全屏/非全屏）混杂，维护成本高，且内含 `@import`。
- 目标：
  1) 清晰区分：桌面端 vs 移动端；全屏模式 vs 非全屏模式
  2) 加载方式：每个 CSS 独立外链（不再使用聚合入口 @import）
  3) 保持现有 `.mobile-view/.force-desktop` 与 `:fullscreen` 的多态机制，无 FOUC 问题
  4) 考虑“嵌入式网站”上下文（酒馆楼层中加载），确保非全屏时的 min-height/滚动行为合理

## 目录与文件划分（阶段 1 初版粗分块）

- css/base/
  - tokens.css（主题变量、色板、字体族变量；移除 CSS 内 `@import`，改为 HTML head 中引入 Google Fonts）
  - layout.css（`.guixu-viewport`/`.guixu-root-container`/`.game-container` 的基础布局与网格/弹性基础）
- css/components/
  - common-ui.css（`.interaction-btn`/`.primary-btn`/`.danger-btn`、`.panel-section`/`.section-title`、`.gx-input`/`.gx-select` 等通用 UI 基元）
- css/features/
  - modals.css（`.modal-overlay`/`.modal-content`/`.modal-header` 等模态系统与 intro/settings/save-load/history 等通用样式）
  - inventory-relationships.css（`.inventory-*`、`.relationship-*` 背包与人物关系）
  - statuses-trade-timeline.css（`.statuses-*`、`#trade-modal*`、`.timeline-*` 状态/交易/时间线）
- css/utilities/
  - scrollbar-tooltips.css（滚动条与 `*tooltip` 等杂项）
- css/views/
  - desktop.css（桌面态：`:not(.mobile-view)` 及 `.force-desktop` 的覆盖）
  - mobile.css（移动态：`.mobile-view` 与小屏兜底媒体规则）
- css/states/
  - fullscreen.css（`:fullscreen`/`:-webkit-full-screen`；移动端横屏全屏时的固定底栏等）
  - windowed.css（`:not(:fullscreen)` 下的兜底，如嵌入式 iframe 的 min-height 等）

说明：
- 这是“第一版粗分块”；后续若需要继续细化，再将 features 拆至更细（inventory.css/relationships.css/statuses.css/trade.css/timeline.css/version-badge.css…），仍坚持“新增即独立 link”。

## 加载策略（不使用聚合 @import；每个文件各自以 <link> 引入）

- 将 Google Fonts 的 `@import` 从 CSS 中移除，改为 HTML 头部使用：
  ```
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&family=Ma+Shan+Zheng&display=swap" rel="stylesheet">
  ```
- 在 `index.html` 中以多条 `<link rel="stylesheet">` 引入，顺序如下（确保级联稳定）：
  1) 基础
     - `https://edit.stonecoks.vip/css/base/tokens.css`
     - `https://edit.stonecoks.vip/css/base/layout.css`
  2) 组件基元
     - `https://edit.stonecoks.vip/css/components/common-ui.css`
  3) 具体功能域
     - `https://edit.stonecoks.vip/css/features/modals.css`
     - `https://edit.stonecoks.vip/css/features/inventory-relationships.css`
     - `https://edit.stonecoks.vip/css/features/statuses-trade-timeline.css`
  4) 工具/杂项
     - `https://edit.stonecoks.vip/css/utilities/scrollbar-tooltips.css`
  5) 视图与状态（同时引入，靠作用域选择器避免互踩）
     - `https://edit.stonecoks.vip/css/views/desktop.css`
     - `https://edit.stonecoks.vip/css/views/mobile.css`
     - `https://edit.stonecoks.vip/css/states/fullscreen.css`
     - `https://edit.stonecoks.vip/css/states/windowed.css`

为何“同时引入视图/状态文件”而不是按条件加载？
- 现有工程通过 `.mobile-view`/`.force-desktop` 与 `:fullscreen` 实现多态，静态同时引入能降低切换时 FOUC/闪烁与复杂度，满足“每个 CSS 独立外链”的诉求。
- 后续可选优化：使用 JS 事件（视图切换/`fullscreenchange`）做“按需挂载/卸载 link”，不在阶段 1 实施。

## 阶段 1 实施步骤（尽量少阶段）

1) 在 `css/` 下创建上述目录与空文件（仅结构，无内容）
2) 迁移内容（从 `css/guixu.css` 渐进式搬运）：
   - tokens.css：`.guixu-root-container` 级别 CSS 变量、色板、阴影、字体族等
   - layout.css：`.guixu-viewport`/`.guixu-root-container`/`.game-container` 的通用布局（不含任何 mobile/fullscreen 分支）
   - common-ui.css：按钮、输入、panel/section 与 `.primary-btn`/`.danger-btn`/`.worldline-btn` 等
   - fullscreen.css：所有 `:fullscreen`/`:-webkit-full-screen` 规则、以及“移动端全屏”特有规则
   - windowed.css：`:not(:fullscreen)` 下的兜底（如嵌入式 iframe 非全屏的 `min-height` 等）
   - desktop.css：`.guixu-root-container:not(.mobile-view)`、`.force-desktop` 与桌面-only 紧凑化
   - mobile.css：`.mobile-view` 与小屏兜底 `@media` 规则
   - scrollbar-tooltips.css：滚动条与通用 tooltip（`equipment-tooltip`/`attr-tooltip` 等）
3) 修改 `index.html` 头部：
   - 新增 Google Fonts 的 `preconnect` + `stylesheet`
   - 按上方顺序引入各 CSS 外链
   - 阶段 1 期间，临时将现有 `css/guixu.css` 的 `<link>` 保留在最后兜底；每完成一批迁移，就从 `guixu.css` 删除相应片段，直至兜底不再需要
4) 验收：
   - 桌面/移动切换 `.mobile-view/.force-desktop` 正常
   - 全屏/非全屏切换 `fullscreenchange` 正常
   - 嵌入式 iframe 下，高度与滚动条是否按 windowed/fullscreen 覆盖预期生效
   - 关键面板/按钮尺寸一致性：顶部栏、正文、左右侧栏浮层、底部栏、模态面板、表格/列表/按钮

## 搜索与迁移指南（精准替换）

为了降低风险，迁移采用“读取-分段-精确替换”的流程（避免一次性大改）：
- 变量与主题：优先定位 `:root` 或 `.guixu-root-container` 内的 CSS 自定义属性（`--color-*/--font-*/--shadow-*`），整体迁移到 `base/tokens.css`
- 布局：搜索 `.guixu-viewport`、`.guixu-root-container`、`.game-container` 的通用规则（不包含 `.mobile-view`、`:fullscreen` 分支），迁到 `base/layout.css`
- 组件：搜索 `.btn`/`.interaction-btn`/`.primary-btn`/`.danger-btn`、`.panel-section`/`.section-title`、`.gx-input`/`.gx-select`，迁到 `components/common-ui.css`
- 视图：以 `.guixu-root-container:not(.mobile-view)`、`.force-desktop` 前缀的覆盖迁到 `views/desktop.css`；以 `.guixu-root-container.mobile-view` 或小屏 `@media` 的兜底迁到 `views/mobile.css`
- 状态：所有 `:fullscreen`/`:-webkit-full-screen` 迁到 `states/fullscreen.css`；所有 `:not(:fullscreen)` 的兜底迁到 `states/windowed.css`
- 工具：滚动条与 tooltip（`*tooltip`）迁到 `utilities/scrollbar-tooltips.css`

作用域约束：
- views 内一律使用带作用域前缀：`.guixu-root-container.mobile-view ...` 与 `.guixu-root-container:not(.mobile-view) ...`
- states 内优先使用伪类与前缀组合，避免“裸选择器”：例如 `:fullscreen .guixu-root-container ...`、`:not(:fullscreen) .guixu-root-container ...`

## index.html 修改片段示例（静态多链接；无聚合入口）

在 `<head>` 内靠前位置引入字体：
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&family=Ma+Shan+Zheng&display=swap" rel="stylesheet">
```

随后按顺序引入样式（以下使用你的同步站点域名）：
```html
<link rel="stylesheet" href="https://edit.stonecoks.vip/css/base/tokens.css">
<link rel="stylesheet" href="https://edit.stonecoks.vip/css/base/layout.css">

<link rel="stylesheet" href="https://edit.stonecoks.vip/css/components/common-ui.css">

<link rel="stylesheet" href="https://edit.stonecoks.vip/css/features/modals.css">
<link rel="stylesheet" href="https://edit.stonecoks.vip/css/features/inventory-relationships.css">
<link rel="stylesheet" href="https://edit.stonecoks.vip/css/features/statuses-trade-timeline.css">

<link rel="stylesheet" href="https://edit.stonecoks.vip/css/utilities/scrollbar-tooltips.css">

<link rel="stylesheet" href="https://edit.stonecoks.vip/css/views/desktop.css">
<link rel="stylesheet" href="https://edit.stonecoks.vip/css/views/mobile.css">
<link rel="stylesheet" href="https://edit.stonecoks.vip/css/states/fullscreen.css">
<link rel="stylesheet" href="https://edit.stonecoks.vip/css/states/windowed.css">

<!-- 阶段 1 回滚兜底：暂时保留原大包 CSS 在最后；迁移稳定后移除 -->
<link rel="stylesheet" href="css/guixu.css">
```

## 项目快照（仅供参考）

当前目录（来自上次扫描）：
```
index.html
LICENSE
README.md
css/
css/guixu.css
js/
js/main.js
js/components/*.js（intro-modal / settings / inventory / relationships / statuses / past-lives / command-center / extracted-content / journey / update-notifier / version-badge / guixu-system）
js/core/TavernAPI.js
js/services/*.js（action / attributes / lorebook / mvuIO / state）
js/utils/*.js（constants / dom / helpers / renderers / tradeCalculator）
scripts/
```

## 回归与验收清单

- 桌面/移动切换（`.mobile-view`/`.force-desktop`）：
  - 顶部栏/正文/左右浮层/底栏布局正确
  - 按钮、表格/列表尺寸与间距一致性
- 全屏/非全屏切换（`document.onfullscreenchange`）：
  - 全屏铺满与移动端横屏时固定底栏正确
  - 非全屏嵌入 iframe 时 `min-height` 与滚动行为正确
- 模态系统（intro/settings/save-load/history/command-center）：
  - `.modal-*` 层级、遮罩、滚动、内嵌搜索栏风格一致
- 滚动条与 tooltip：
  - 不同视图与状态组合下样式不回退、不重排

## 阶段一收尾清单

- [ ] 精准从 `css/guixu.css` 清除已迁移的基础/组件/视图/状态/工具片段（分批，迁入即剔除）
- [ ] 四象限回归记录补充并通过（桌面/移动 × 全屏/窗口化）
- [ ] 移除 `index.html` 中的 `css/guixu.css` 引用（回归通过后执行）

## 风险与回滚策略

- 风险控制：引入顺序固定为 base → components → features → utilities → views → states；views/states 不使用裸选择器，全部带作用域前缀。
- 回滚：阶段 1 始终保留 `css/guixu.css` 在最后；若出现偏差先在新文件中补齐，再逐步从 `guixu.css` 移除片段；最终回归通过后再删除 `guixu.css` 链接。

## 阶段 2（预告）

- 继续细分 features：inventory.css / relationships.css / statuses.css / trade.css / timeline.css / version-badge.css …
- 若追求极致性能：使用 JS 动态增删 link（视图切换与 `fullscreenchange`），降低解析字节；需处理切换时机与贴边布局抖动。

---

## 进度追踪（实时更新）

- [x] 在项目根创建本阶段说明文档（PHASE1_REFACTOR.md）
- [x] 读取并分析 `index.html` 与 `css/guixu.css`（定位字体 @import 与可迁移分段）
- [x] 修改 `index.html`：添加 Google Fonts 链接与按序多 link 引入（保留 `guixu.css` 兜底）
- [x] 从 `guixu.css` 迁移：`base/tokens.css`
- [x] 从 `guixu.css` 迁移：`base/layout.css`
- [x] 从 `guixu.css` 迁移：`components/common-ui.css`
- [x] 从 `guixu.css` 迁移：`states/fullscreen.css`
- [x] 从 `guixu.css` 迁移：`states/windowed.css`
- [x] 从 `guixu.css` 迁移：`views/desktop.css`
- [x] 从 `guixu.css` 迁移：`views/mobile.css`
- [x] 从 `guixu.css` 迁移：`utilities/scrollbar-tooltips.css`
- [x] 本地补齐 `css/features/` 目录与占位文件：`modals.css`、`inventory-relationships.css`、`statuses-trade-timeline.css`
- [ ] 回归：桌面/移动 + 全屏/非全屏四象限核验点记录
- [ ] 最终移除 `guixu.css` 链接（仅当视觉回归通过）

更新记录：
更新记录：
- 2025-09-06：创建文档，确认阶段 1 目录与加载策略，编写实施步骤与验收清单。
- 2025-09-06：迁移批次一与索引更新
  - index.html：加入 Google Fonts（preconnect + stylesheet）与多 link 加载（base → components → features → utilities → views → states），本地 `css/guixu.css` 保留兜底。
  - 新增文件：`css/utilities/scrollbar-tooltips.css`、`css/views/mobile.css`、`css/views/desktop.css`。
  - 从 guixu.css 迁移/移除：`#equipment-tooltip`/`.attr-tooltip`/`#trade-tooltip` 及 WebKit 滚动条；全屏与非全屏相关块（迁至 `states/`）；移动端根容器与 `.game-container` 核心布局（迁至 `views/mobile.css`）；移动端横屏全屏底部栏规则去重；隐藏移动端角落控制按钮规则迁至 `views/mobile.css`。
  - 保持加载顺序与作用域：严格 base → components → features → utilities → views → states，避免视图/状态互踩。
  - 回归建议：桌面/移动 × 全屏/窗口化四象限抽样验证（顶部/正文/侧栏/底栏/模态/滚动）。
