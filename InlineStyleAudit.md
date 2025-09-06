# InlineStyleAudit（阶段5 增量清单）

目的：记录“业务组件分文件 + 内联样式清理”的映射关系，支撑后续 legacy/guixu.css 精准删除与回归验证。仅覆盖本次阶段涉及模块：timeline/history（本世历程/往世涟漪）、command-center、save-load、world-book。

参考：Phase5-Task.md

--------------------------------------------------------------------------------

## 1) 历程（History / Timeline）

作用域：`.guixu-root-container #history-modal`

新增样式文件：
- css/components/timeline.css
- css/components/history.css

JS/HTML 变更映射：
- 占位/错误提示
  - BEFORE: `<p style="text-align:center; color:#8b7355; font-size:12px;">…</p>`
  - AFTER: `<p class="modal-placeholder">…</p>`
  - 样式归属：timeline.css (.modal-placeholder)

- 事件卡片 - 地点行
  - BEFORE: `<div class="timeline-location" style="font-size:12px; color:#8b7355; margin:5px 0;">…</div>`
  - AFTER: `<div class="timeline-location">…</div>`
  - 样式归属：timeline.css (.timeline-location)

- 详细信息折叠块
  - BEFORE: `<div class="timeline-detailed-info" style="display:none; margin-top:15px; padding-top:15px; border-top:1px solid rgba(201,170,113,0.3)">…`
  - AFTER: `<div class="timeline-detailed-info">…`
  - 样式归属：timeline.css (.timeline-detailed-info)，JS 仅切换 display

- 自动化系统 <pre>
  - BEFORE: `<pre style="white-space:pre-wrap; font-size:11px; color:#a09c91;">…</pre>`
  - AFTER: `<pre class="timeline-auto-system">…</pre>`
  - 样式归属：timeline.css (.timeline-auto-system)

- 批量模式显隐
  - BEFORE: JS 循环逐项设置 `.batch-select` 的 `style.display`
  - AFTER: 容器 `.timeline-container` 切 `.batch-mode` 类 + CSS 控制 `.batch-select` 显隐
  - 样式归属：timeline.css (.batch-select + .timeline-container.batch-mode)

- 头部动作区（自动修剪/手动修剪/搜索）
  - BEFORE: `#history-modal-actions` 内联 `display/gap`；搜索区结构无类约束
  - AFTER: 结构保持，交互元素使用 `.history-toolbar` / `.history-search`
  - 样式归属：history.css

- 修剪弹窗（#trim-journey-modal）
  - BEFORE: modal-body padding、说明文字、attributes-list padding、输入框宽度、按钮区 margin-top 均为内联
  - AFTER: `.history-trim-desc`、`.confirm-modal-buttons` 等类
  - 样式归属：history.css

受影响文件：
- js/components/journey.js（已替换）
- js/components/past-lives.js（与 timeline 共享的占位/预格式化类，已替换）
- index.html（history-modal-actions/trim-journey-modal，已替换）

遗留/后续：
- 事件展开/收起仍依赖 JS 切换 `display`（符合现阶段目标）
- timeline 的 Tooltip（若后续补充）需保证定位在 `.modal-body` 内

--------------------------------------------------------------------------------

## 2) 往世涟漪（Past Lives）

作用域：同上（复用 timeline 基础样式）

JS/HTML 变更映射：
- 占位/错误提示 → `.modal-placeholder`（同上）
- 自动化系统 <pre> → `.timeline-auto-system`（同上）

受影响文件：
- js/components/past-lives.js（已替换）

--------------------------------------------------------------------------------

## 3) 指令中心（Command Center）

作用域：`.guixu-root-container #command-center-modal`

新增样式文件：
- css/components/command-center.css

HTML/JS 变更映射：
- 页脚区（actions）结构保持，新增样式控制 `.command-center-footer`
- 动作列表 `.command-center-actions`、项 `.command-center-action-item` 新增

受影响文件：
- js/components/command-center.js（无内联样式，主要为列表渲染）

--------------------------------------------------------------------------------

## 4) 存档管理（Save/Load）

作用域：`.guixu-root-container #save-load-modal`

新增样式文件：
- css/components/save-load.css

HTML 变更映射（index.html）：
- `#auto-save-slot-container` 移除 `style="margin-bottom:15px"` → 由 save-load.css 控制
- “手动存档”标题
  - BEFORE: `<h3 style="font-size:14px; color:#8b7355; margin-top:20px; margin-bottom:10px; border-top:1px solid rgba(201,170,113,0.3); padding-top:15px;">…</h3>`
  - AFTER: `<h3 class="manual-save-title">…</h3>`
  - 样式归属：save-load.css (.manual-save-title)

受影响文件：
- index.html（已替换）

--------------------------------------------------------------------------------

## 5) 世界书控制（World Book Controls）

作用域：`.guixu-root-container #world-book-controls`

新增样式文件：
- css/components/world-book.css

HTML 变更映射（index.html）：
- 容器 padding/margin → 移除内联，使用 `#world-book-controls`
- 标题/行/标签/输入宽度
  - BEFORE: 多处 `font-size/color/flex/gap/cursor/width` 内联
  - AFTER: `.world-book-title / .world-book-inner / .world-book-row(.is-justify) / .world-book-label`，`#unified-index-input{width:60px}`，`#auto-toggle-lorebook-checkbox{cursor:pointer}`

受影响文件：
- index.html（已替换）

--------------------------------------------------------------------------------

## 6) 统计与检查方法（建议）

- 快速检索（repo 根执行思想，工具已在本次任务中验证）：
  - 统计 JS/HTML 中残留行内：`style="`（允许少数进度类 `width:%` 暂留）
  - 统计 `.btn-compact` 等按钮类，确认都走 `.interaction-btn` 体系
  - 已使用（示例）：`search_files: btn-compact|style="[^"]*"`（见历史输出）
- 模块自查：
  - 打开“历史回顾/往世涟漪”，验证占位/错误提示/自动化系统 `pre` 视觉一致
  - 批量模式：点击切换后 `.batch-select` 显示/隐藏无内联样式参与
  - 世界书控制/存档管理区域布局与间距与旧版一致

--------------------------------------------------------------------------------

## 7) 后续拆分与统一（未纳入本批交付）

- 动态品阶/境界颜色：已完成（见第 10 节“动态品阶/境界颜色迁移（本批已完成）”）
- settings 面板（settings.js 动态拼接）：
  - 颜色选择器输入的边框/圆角/宽度等内联迁移至 `settings.css` 或复用 forms.css 工具类
- extracted-content 模态：
  - 多处内联 `display:flex/gap/justify/背景/圆角` 等，迁移至 `extracted-content.css`
- 进度条统一：
  - 将残留的 `style="width:XX%"`（如 index.html 中 `#cultivation-progress-fill`）统一为 `style="--progress: XX%"` + CSS `width: var(--progress)`

--------------------------------------------------------------------------------

## 8) legacy 精准删除建议（后续）

删除前提：线上稳定验证通过后分模块移除 guixu.css/guixu.legacy.css 中旧块（与新组件语义重叠者）。

- 历史/时间线：旧的 `#history-modal` 下时间线/标签/占位/按钮网格相关选择器
- 指令中心：旧的 action 列表项背景/边框/间距
- 存档管理：旧的自动/手动块标题与间距规则
- 世界书控制：旧的侧栏 label/行排版/输入宽度规则

策略：每次仅删除一个模块对应旧块，并 保留 可复用基础类；支持快速回滚。

--------------------------------------------------------------------------------

## 9) 变更文件列表（阶段5）

新增：
- css/components/timeline.css
- css/components/history.css
- css/components/command-center.css
- css/components/save-load.css
- css/components/world-book.css
- Phase5-Task.md
- InlineStyleAudit.md（本文档）

修改：
- js/components/journey.js（移除内联、批量模式切换逻辑收敛）
- js/components/past-lives.js（移除内联）
- css/index.css（引入新组件样式）
- index.html（history/world-book/save-load 的内联样式精准替换）

## 10) 动态品阶/境界颜色迁移（本批已完成）

作用域与规范：
- 样式作用域：所有规则均在 .guixu-root-container 下生效。
- 基础类：.tier-text 作为统一的“品阶/境界着色文本”基类。
- 数据驱动：通过 data-tier="…" 标注具体品阶/境界；高阶品阶使用渐变 + -webkit-background-clip:text + 动画（详见 css/base/utilities.css 中的 keyframes）。

旧 → 新映射：
- BEFORE: style="${getTierStyle(tier)}" / style="${h.getTierStyle(t)}"
- AFTER:  class="tier-text" data-tier="${tier}"
- BEFORE: el.setAttribute('style', tierStyle)
- AFTER:  el.removeAttribute('style'); el.dataset.tier = tier; el.classList.add('tier-text')
- BEFORE: `<span style="margin-right: 15px;">…</span>`
- AFTER:  `<span class="u-mr-15">…</span>`
- BEFORE: 行内 margin-top: 5px 用于分段
- AFTER:  使用 .u-mt-8 或相应工具类

受影响文件（本批修改）：
- js/utils/renderers.js：tooltip 标题使用 tier-text + data-tier；分段标题使用 .u-mt-8
- js/main.js：境界显示 (#val-jingjie) 与装备槽着色均改为 tier-text + data-tier
- js/components/inventory.js：条目名称/品阶旗标与装备槽更新
- js/components/relationships.js：关系卡标题、修为徽章、角色详情、NPC 装备格、交易表格名称与 tooltip 回退标题

CSS 支撑：
- css/base/utilities.css：提供 .tier-text 与 [data-tier="…"] 的映射；为高阶品阶提供渐变与动画（gx-god-tier-animation）
- 保持移动端与 :fullscreen 行为，所有选择器均以 .guixu-root-container 开头

统计与校验：
- 快速检索残留：getTierStyle|getTierColorStyle|\btierStyle\b|style="[^"]*color
- 本批结果：仓库中已无上述匹配（见本次检索记录）

回滚方式：
- 注释 css/index.css 新增的 @import
- 恢复 index.html 变更片段（diff 见版本历史）
- legacy 仍保底存在

--------------------------------------------------------------------------------

## 11) Settings / Extracted Content（本批完成）

作用域：
- .guixu-root-container #settings-modal
- .guixu-root-container #extracted-content-modal

HTML/JS 内联 → 类/变量 映射：
- BEFORE: `<div class="attributes-list" style="padding: 10px;">…`
  - AFTER: `<div class="attributes-list">…`
  - 样式归属：settings.css（统一 attributes-list 的 padding）
- BEFORE: `<div class="attribute-item" style="gap:10px; align-items:center;">…`
  - AFTER: `<div class="attribute-item">…`
  - 样式归属：settings.css（attribute-item 统一 gap 与对齐）
- BEFORE: `characterCardBtn.style.display = 'none'`
  - AFTER: `characterCardBtn.classList.add('u-hidden')`
  - 样式归属：utilities.css（.u-hidden）
- BEFORE: JS 直接写 `previewEl.style.backgroundImage = 'url(...)'`
  - AFTER: `previewEl.style.setProperty('--gx-bg-preview-image', 'url(...)')`
  - 样式归属：settings.css（`background-image: var(--gx-bg-preview-image, none)`）
- BEFORE: Info Tooltip 行内样式/显隐混用
  - AFTER: CSS 状态类 `#guixu-info-tooltip.is-open` 控制展示，JS 仅写 class 与定位 left/top

灰度删除（legacy）：
- 已删除 css/guixu.css 中与 #settings-modal 重叠的规则块；其余模块将按验证逐块继续删除。

受影响文件：
- js/components/settings.js（模板内联清除 + Tooltip 状态类）
- js/components/extracted-content.js（.style.display → .u-hidden）
- css/components/settings.css、css/components/extracted-content.css（接管样式）

--------------------------------------------------------------------------------

## 12) 阶段6 增量清单（移动端 / 桌面端 / 全屏拆分）

作用域与目标：
- 仅针对响应式层的组织与拆分；不改动业务结构与 HTML 模板。
- 所有规则限定在 `.guixu-root-container` / `.guixu-viewport` 作用域，嵌入式 iframe 友好。
- 采用“mobile-first + 桌面增强 + 全屏覆盖”的分文件策略，保持层叠顺序：base → layout → components → responsive → embed-fixes。

新增样式文件（已引入 css/index.css）：
- css/responsive/mobile.css
  - 汇聚 .guixu-root-container.mobile-view 下的流式布局与细节：
    - 根容器改为 Flex 纵向栈；`.mobile-view .game-container` 纵向堆叠，子项 min-height:0
    - 底栏纵排；快速发送区三段纵排，`.qs-left--two-btn` 两键等分
    - 隐藏角落按钮：.settings-btn/.view-toggle-btn/.fullscreen-btn
    - FAB 缩放：`.mobile-fab` 44px 圆形
    - 小屏兜底 @media (max-width: 900px)：在 JS 未注入 `.mobile-view` 前，视口/根容器参与文档流，强制纵向布局并可滚动
    - 非全屏移动端高度兜底：根容器与 `.game-container` 以 dvh/svh/vh 链保证撑满视口
- css/responsive/desktop.css
  - 汇聚桌面端统一按钮尺寸规则（不影响移动端）：
    - `.guixu-root-container:not(.mobile-view) .interaction-btn/.primary-btn/.danger-btn/.clear-saves-btn` 统一 32px 高、padding 0 12px、min-width:96px，文本不拥挤，盒模型统一
- css/responsive/fullscreen.css
  - 汇聚全屏（:fullscreen / :-webkit-full-screen）规则：
    - 根容器铺满视口并避免裁剪，`.game-container{height:100%}`
    - 移动端全屏下：relationships/save-load/command-center 面板宽高与按钮收紧（90%/max-width:800px，按钮 32px）
    - 快速发送两键在全屏移动端统一 40px 高度
    - 移动端横屏全屏：底栏固定、安全区（@supports padding:max）、输入容器居中与宽度收敛（clamp）
  - 修复拼写错误：`-webkit-full-screen.mobile-view #save-load-modal .slot-actions > button`（已修正）

迁移与删重（首批完成）：
- 从 css/guixu.css → mobile.css
  - `.guixu-root-container.mobile-view` 根流式布局、`.mobile-view .game-container`、角落按钮隐藏、FAB、底栏与快速发送通用、非全屏 dvh/svh 兜底、小屏兜底媒体查询、`.guixu-viewport.mobile-view` 滚动
- 从 css/guixu.css → desktop.css
  - 桌面端按钮统一尺寸规则（原在 guixu.css 的 not(.mobile-view) 块）
- 从 css/guixu.css → fullscreen.css
  - 根容器铺满 + 常用面板在移动全屏下收敛、移动横屏全屏的固定底栏与安全区处理、快速发送 40px

对 guixu.css 的调整：
- 移除一段不完整的小屏兜底代码块（导致“应为 @ 规则或选择器”的语法错误），完整兜底逻辑已迁入 mobile.css 的 `@media (max-width: 900px)`。
- 暂保留部分与 responsive 重叠的块用于灰度（靠后引入的 responsive 已覆盖，防回归）。后续“第二批删重”中逐项删去。

验收/回归要点：
- index.css 引入顺序：responsive 位于 components 之后、embed-fixes 之前（或并列），确保覆盖旧选择器
- 桌面非全屏嵌入高度链由 embed-fixes.css 保证；移动端/全屏由 mobile/fullscreen.css 接管，避免循环覆盖
- Safari/iPad 全屏裁剪：fullscreen.css 统一 overflow/安全区处理

回滚方式（阶段6相关）：
- 注释 index.css 中 responsive 三文件的 @import 即可回退；guixu.css 保留原块保障可用

后续（阶段6 第二批）
- 删重 guixu.css 中剩余的 mobile-landscape-fullscreen / fullscreen 相关重复块，完全上收至 fullscreen.css
- 评估 components/* 中与响应式层交叉的少量覆盖，能提升复用的再上收至 responsive/*

变更文件列表（阶段6）
- 新增：css/responsive/mobile.css、css/responsive/desktop.css、css/responsive/fullscreen.css、Phase6-Task.md
- 修改：css/index.css（引入 responsive 三文件）
- 修改：css/guixu.css（剪移首批规则 + 语法修复）

--------------------------------------------------------------------------------

## 13) 阶段6 第二批删重映射清单（responsive/fullscreen 集中覆盖）

目标与范围：
- 将“全屏(:fullscreen / :-webkit-full-screen) + 移动横屏全屏(.mobile-landscape-fullscreen)”相关的通用样式，从 legacy/组件文件中上收至 `css/responsive/fullscreen.css`，消除跨层重复覆盖，保证作用域仅限 `.guixu-root-container`/`.guixu-viewport`，不影响宿主页面。

映射一：components → responsive
- 来源文件：css/components/relationships.css（已删除的全屏段）
  - 选择器与规则（代表性条目）：
    - `.guixu-root-container:fullscreen.mobile-view #relationships-modal .modal-content` / `:-webkit-full-screen ... .modal-content` → 尺寸收敛 90% + max-width/max-height
    - `.guixu-root-container:fullscreen.mobile-view #relationships-modal .relationship-header .rel-actions` → 网格布局（3 列、行高 minmax(26px,auto)）
    - `.guixu-root-container:fullscreen.mobile-view #relationships-modal .relationship-header .rel-actions > button`、`.relationship-card .btn-delete-relationship` → 高度 26px、内边距 0 8px、字体 11px
    - `.guixu-root-container:fullscreen.mobile-view #relationships-modal .rel-tab` → 高度 32px、内边距 0 10px、字体 12px
  - 目标文件：css/responsive/fullscreen.css（已存在等价/增强规则）
  - 原因：这些属于“全屏态通用收敛”，不应由单组件文件维护，避免与其他组件的全屏收敛产生冲突。

映射二：legacy → responsive
- 来源文件：css/guixu.css（历史已执行的删重，当前仓内检索不再存在 :fullscreen/-webkit-full-screen）
  - 选择器与规则（按功能聚合）：
    - relationships/save-load/command-center 在移动全屏下的尺寸与按钮收紧整段 → 已集中至 fullscreen.css
    - `.guixu-root-container.mobile-view.mobile-landscape-fullscreen ...`（横屏全屏：底栏固定/输入收敛/安全区）→ 已集中至 fullscreen.css
    - 本批补充（对齐遗留细节）：  
      `.mobile-landscape-fullscreen .quick-send-container .qs-left.qs-left--two-btn { gap:10px; }`  
      `.mobile-landscape-fullscreen .game-container { background: rgba(0,0,0,.2); }`
  - 目标文件：css/responsive/fullscreen.css
  - 备注：通过 repo 全仓检索确认，guixu.css 中已无 :fullscreen/-webkit-full-screen 的尺寸/布局覆盖项。

保留项（评估/暂留说明）：
- 若 guixu.css 中存在以下“全屏定位层级”条目（当前检索为 0，历史保留说明仍附录）：
  - `.guixu-root-container:fullscreen.mobile-view.show-character-panel .character-panel`
  - `.guixu-root-container:fullscreen.mobile-view.show-interaction-panel .interaction-panel`
- 暂留原因：仅用于确保浮层在全屏下的定位与 z-index 安全，不改变业务布局；后续如确认与 fullscreen.css 的集中策略不冲突，可一并上收。

验证与索引（本批执行记录）：
- 校验命令：
  - 排查全仓非 fullscreen.css 的全屏选择器：`(:fullscreen|:-webkit-full-screen)` → 0 结果
  - 排查横屏全屏来源：`mobile-landscape-fullscreen` → 仅 `css/responsive/fullscreen.css`
- 目标文件内索引（便于查阅/回归）：
  - “进入全屏：根容器铺满”段
  - “移动端全屏：relationships/save-load/command-center 收敛”段
  - “快速发送区：全屏移动端 40px”段
  - “横屏全屏：底栏固定/输入居中/安全区/两键间距/正文底色”段

回滚提示（第二批删重）：
- 如需临时回退，可：
  1) 在 `css/index.css` 注释 `responsive/fullscreen.css` 的 @import；
  2) 恢复 `css/components/relationships.css` 的对应全屏段（已在 Phase6-Task.md 记录）；
  3) 历史上从 guixu.css 剪移的横屏全屏块如需短期回滚，可从版本历史恢复。

变更文件列表（阶段6 第二批增补）
- 修改：css/components/relationships.css（删除“全屏 + 移动端”段，改由 fullscreen.css 接管）
- 修改：css/responsive/fullscreen.css（补入横屏全屏 two-btn 间距与正文底色过渡）
- 验证：css/guixu.css（确认无 :fullscreen/-webkit-full-screen 尺寸/布局覆盖残留）
