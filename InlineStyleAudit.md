# InlineStyleAudit（阶段5 增量清单）

目的：记录“业务组件分文件 + 内联样式清理”的映射关系，支撑后续 legacy/guixu.css 精准删除与回归验证。仅覆盖本次阶段涉及模块：timeline/history（本世历程/往世涟漪）、command-center、save-load、world-book。

参考：Phase5-Reading.md、Phase5-Task.md

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

- 自动化系统内容 <pre>
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
