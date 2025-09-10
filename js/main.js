// 阶段四：新的主入口 main.js（全面接管，准备移除 guixu.js）
/* global eventOn, tavern_events */

(function (window) {
  'use strict';

  // 依赖检查（非致命，仅提示）
  function hasDeps() {
    const ok =
      window.GuixuDOM &&
      window.GuixuHelpers &&
      window.GuixuConstants &&
      window.GuixuAPI &&
      window.GuixuState &&
      window.GuixuAttributeService;
    if (!ok) console.warn('[归墟] main.js 依赖未完全加载：请确保 constants/dom/helpers/TavernAPI/services 已按顺序加载。');
    return ok;
  }
   
  // 移除：误将 CSS 写入 JS 的块。首行缩进的样式请在 CSS 文件中维护。
  
  const GuixuMain = {
    _initialized: false,
    // MVU 占位符常量
       
    _pendingRestoreMobileOnExitFullscreen: false,
    // 首轮门禁激活标记：命中后阻止首帧 MVU 抓取/写入/轮询，直至用户“一键刷新”
    _firstRoundBlockActive: false,

    // 兼容旧结构：已弃用占位符逻辑，直接透传
    _ensureMetaExtensibleArray(arr) {
      try { return arr; } catch (_) { return arr; }
    },

    // 对指定路径数组进行“占位符”修复
    // 已弃用：新结构为字典对象，此处不再处理
    _ensureExtensibleMarkersOnPaths(data, paths) {
      try { /* no-op */ } catch (_) {}
    },

    // 已弃用：新结构为字典对象，不再进行占位符修复
    _ensureExtensibleMarkers(statData) {
      try { /* no-op */ } catch (_) {}
    },

    // 过滤数组中的占位符（用于渲染前忽略）
    // 已弃用占位符：直接透传
    _stripMeta(arr) {
      try { return arr; } catch (_) { return arr; }
    },

    // 全域“渲染前过滤”：深度复制并删除任意数组中的占位符
    // 不再移除占位符：保留简单深拷贝（必要层面）
    _deepStripMeta(value) {
      const t = Object.prototype.toString.call(value);
      if (t === '[object Array]') {
        return value.map(v => this._deepStripMeta(v));
      }
      if (t === '[object Object]') {
        const out = {};
        for (const k in value) {
          if (Object.prototype.hasOwnProperty.call(value, k)) {
            out[k] = this._deepStripMeta(value[k]);
          }
        }
        return out;
      }
      return value;
    },

    // 首轮门禁：是否阻止首帧 MVU 抓取/渲染
    async _shouldBlockFirstRoundMvuCapture() {
      try {
        const idx = window.GuixuState?.getState?.().unifiedIndex || 1;
        // 若玩家已通过“一键刷新”解锁，则本次放行并清除标记
        try {
          const gateKey = `guixu_gate_unblocked_${idx}`;
          const v = localStorage.getItem(gateKey);
          if (v === '1') {
            localStorage.removeItem(gateKey);
            return false;
          }
        } catch (_) {}
        // 新逻辑：根据是否已经成功进行过一次 <gametxt> 正文捕捉来判定“首轮”
        try {
          const seenKey = `guixu_gate_gametxt_seen_${idx}`;
          const seen = localStorage.getItem(seenKey) === '1';
          // 未见过 gametxt -> 视为首轮：阻止；见过 -> 非首轮：放行
          return !seen;
        } catch (_) {
          // 本地存储不可用等异常：为避免误阻塞，放行
          return false;
        }
      } catch (e) {
        console.warn('[归墟] 首轮门禁检查异常，默认放行', e);
        return false;
      }
    },

    // 统一调整底部输入栏布局为 三段式：左(按钮) - 中(输入) - 右(发送)
    ensureQuickSendLayout() {
      try {
        // 样式注入（仅一次）
        if (!document.getElementById('guixu-quick-send-layout-style')) {
          const s = document.createElement('style');
          s.id = 'guixu-quick-send-layout-style';
          s.textContent = `
            .guixu-root-container .quick-send-container{
              display: grid;
              grid-template-columns: auto 1fr auto;
              align-items: center;
              gap: 8px;
            }
            .guixu-root-container .quick-send-container .qs-left,
            .guixu-root-container .quick-send-container .qs-right{
              display: flex;
              align-items: center;
              gap: 6px;
            }
            .guixu-root-container .quick-send-container .qs-center{
              display: flex;
              align-items: center;
            }
            .guixu-root-container .quick-send-container .qs-center #quick-send-input{
              width: 100%;
            }
            /* 桌面端：扩大中心列最小宽度（输入栏随中心列拉伸），等效提升输入栏宽度约20% */
            .guixu-root-container:not(.mobile-view) .quick-send-container{
              grid-template-columns: auto minmax(300px, 1fr) auto;
            }
          `;
          document.head.appendChild(s);
        }

        const qs = document.querySelector('#bottom-status-container .quick-send-container');
        if (!qs) return;

        let left = qs.querySelector('.qs-left');
        let center = qs.querySelector('.qs-center');
        let right = qs.querySelector('.qs-right');

        if (!left || !center || !right) {
          // 创建三段式容器
          if (!left) { left = document.createElement('div'); left.className = 'qs-left'; }
          if (!center) { center = document.createElement('div'); center.className = 'qs-center'; }
          if (!right) { right = document.createElement('div'); right.className = 'qs-right'; }

          // 采集现有控件
          const btnCmd = qs.querySelector('#btn-quick-commands');
          const input = qs.querySelector('#quick-send-input');
          const btnSend = qs.querySelector('#btn-quick-send');

          // 移除旧 wrapper，避免嵌套
          qs.querySelectorAll('.qs-left, .qs-center, .qs-right').forEach(el => el.remove());

          // 组装三段式
          qs.innerHTML = '';
          qs.appendChild(left);
          qs.appendChild(center);
          qs.appendChild(right);

          if (btnCmd) left.appendChild(btnCmd);
          if (input) center.appendChild(input);
          if (btnSend) right.appendChild(btnSend);
        }
      } catch (e) {
        console.warn('[归墟] ensureQuickSendLayout 失败:', e);
      }
    },

    // 常驻：“一键刷新”按钮（放在输入栏左侧）
    ensureRefreshButton() {
      try {
        const qs = document.querySelector('#bottom-status-container .quick-send-container');
        if (!qs) return;
        this.ensureQuickSendLayout();
        const left = qs.querySelector('.qs-left') || qs;

        let btn = document.getElementById('btn-first-run-refresh');
        if (!btn) {
          btn = document.createElement('button');
          btn.id = 'btn-first-run-refresh';
          btn.className = 'interaction-btn gate-refresh-btn';
          btn.type = 'button';
          btn.textContent = '一键刷新';
          btn.title = '对整个前端渲染进行最新更新渲染和酒馆MVU变量值抓取';
          left.insertBefore(btn, left.firstChild || null);

          btn.addEventListener('click', async () => {
            try {
              const isFirstRound = await this._shouldBlockFirstRoundMvuCapture();
              if (isFirstRound) {
                try {
                  const idx = window.GuixuState?.getState?.().unifiedIndex || 1;
                  localStorage.setItem(`guixu_gate_unblocked_${idx}`, '1');
                  localStorage.setItem(`guixu_apply_default_bg_once_${idx}`, '1');
                } catch (_) {}
                window.location.reload();
                return;
              }
            } catch (_) {}
            try {
              const idx = window.GuixuState?.getState?.().unifiedIndex || 1;
              // 非首轮或检测失败：直接解锁并刷新
              localStorage.setItem(`guixu_gate_unblocked_${idx}`, '1');
              localStorage.setItem(`guixu_apply_default_bg_once_${idx}`, '1');
            } catch (_) {}
            window.location.reload();
          });
        } else {
          // 确保位置在左侧容器首位
          if (btn.parentElement !== left) {
            left.insertBefore(btn, left.firstChild || null);
          }
        }
      } catch (e) {
        console.warn('[归墟] ensureRefreshButton 失败:', e);
      }
    },

    // 首轮：若判定为“首轮对话”，仅自动刷新一次（避免循环），再等待用户点击“一键刷新”进行解锁
    _tryAutoRefreshOnceOnFirstRound() {
      try {
        const idx = window.GuixuState?.getState?.().unifiedIndex || 1;
        const skey = `guixu_gate_auto_refreshed_${idx}`;
        if (sessionStorage.getItem(skey) === '1') return;
        sessionStorage.setItem(skey, '1');
        // 轻微延迟以保证首帧 DOM 能落地（避免浏览器拦截紧跟的 reload）
        setTimeout(() => { try { window.location.reload(); } catch(_) {} }, 50);
      } catch (_) {}
    },

    // 评估门禁并根据结果执行自动一次刷新；返回 Promise<boolean> 表示是否阻止
    async _evaluateFirstRunGateAndMaybeShow() {
      const block = await this._shouldBlockFirstRoundMvuCapture();
      this._firstRoundBlockActive = !!block;

      // 常驻按钮：无论是否首轮都提供快速刷新能力
      this.ensureRefreshButton();

      if (block) {
        this._tryAutoRefreshOnceOnFirstRound();
      }
      return block;
    },

    init() {
      if (this._initialized) return;
      this._initialized = true;

      console.info('[归墟] GuixuMain: 启动主入口。');
      hasDeps();
      this.ensureDynamicStyles();
      // 底部输入栏三段式布局与常驻刷新按钮
      this.ensureQuickSendLayout();
      this.ensureRefreshButton();
      this.ensureRerollButton();
      this.ensureAllModalsClosed();
      // 清理：移除底部遗留的“流式输出”开关按钮（改由设置中心管理）
      try {
        const legacyBtn = document.getElementById('btn-toggle-stream');
        if (legacyBtn) legacyBtn.remove();
      } catch (_) {}

      // 启动服务轮询改为在门禁评估后再启动

      // 顶层事件绑定
      this.bindTopLevelListeners();
      // 订阅全局状态事件（一次性），用于在 mvu 或装备变化时即时刷新UI
      this.ensureStateSubscriptions();

      // 新增：绑定流式事件（仅绑定一次），在生成过程中将 LLM 的流式输出实时渲染到正文窗口
      try {
        if (!this._streamingEventsBound) {
          this._streamingEventsBound = true;

          const renderStreaming = (text) => {
            try {
              // 仅当开启了“流式请求”时才渲染预览
              const st = window.GuixuState?.getState?.();
              if (!st || !st.isStreamingEnabled) return;

              const gameTextDisplay = document.getElementById('game-text-display');
              if (!gameTextDisplay) return;

              // 仅渲染正文（优先 <gametxt>，否则为去除思维链后的文本），避免对 MVU/提取等产生副作用
              const displayText = this._getDisplayText(String(text || ''));
              gameTextDisplay.innerHTML = this.formatMessageContent(displayText || '');
            } catch (_) {}
          };

          // 生成开始：标记活跃，清空缓存，并在启用流式时更新顶部提醒文案
          eventOn(iframe_events.GENERATION_STARTED, () => {
            try { this._streamingActive = true; this._lastStreamingText = ''; } catch (_) {}
            try {
              const st = window.GuixuState?.getState?.();
              if (st && st.isStreamingEnabled) this.showWaitingMessage('正在流式输出中…');
            } catch (_) {}
          });

          // 优先使用“完整累计文本”事件
          eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, (full_text) => {
            try { this._lastStreamingText = String(full_text || ''); } catch (_) {}
            renderStreaming(this._lastStreamingText);
          });

          // 兼容：仅有增量事件时，手动累加并渲染
          eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, (incremental_text) => {
            try { this._lastStreamingText = (this._lastStreamingText || '') + String(incremental_text || ''); } catch (_) {}
            renderStreaming(this._lastStreamingText);
          });

          // 生成结束：结束标记；最终渲染交由 ActionService 完整流程（提取/MVU/保存）处理
          eventOn(iframe_events.GENERATION_ENDED, () => {
            try { this._streamingActive = false; } catch (_) {}
          });
        }
      } catch (e) {
        console.warn('[归墟] 绑定流式事件失败:', e);
      }
      
      // 自动检测并应用移动端视图
      this._autoDetectMobileAndApply();
      // 桌面端：注入左右侧栏开合按钮并恢复上次折叠状态
      this.ensurePaneToggleControls();

      // 嵌入式(iframe)可见性兜底修复 + 移动端主内容固定高度
      this._applyEmbeddedVisibilityFix();
      this._reflowMobileLayout();
      // 初始一帧后再恢复一次FAB位置，避免早期布局尺寸为0导致的夹紧错位
      setTimeout(() => this._restoreFabPositions(), 100);

      // 防抖处理，避免软键盘触发的频繁 resize 导致抖动
      if (!this._onResizeBound) {
        this._onResizeBound = true;
        this._resizeTimer = null;
        window.addEventListener('resize', () => {
          clearTimeout(this._resizeTimer);
          this._resizeTimer = setTimeout(() => {
            const ae = document.activeElement;
            const editing = !!(ae && (ae.id === 'quick-send-input' || ae.classList?.contains('quick-send-input')));
            this._pulseFastReflow(120);
            this._applyEmbeddedVisibilityFix();
            this._reflowMobileLayout(editing);
          }, 50);
        });
      }

      // 监听 visualViewport 变化和方向变化，快速重排移动端布局
      if (window.visualViewport && !this._vvBound) {
        this._vvBound = true;
        this._vvTimer = null;
        const onVV = () => {
          clearTimeout(this._vvTimer);
          this._vvTimer = setTimeout(() => {
            const ae = document.activeElement;
            const editing = !!(ae && (ae.id === 'quick-send-input' || ae.classList?.contains('quick-send-input')));
            this._pulseFastReflow(120);
            this._reflowMobileLayout(editing);
          }, 50);
        };
        window.visualViewport.addEventListener('resize', onVV);
        window.visualViewport.addEventListener('scroll', onVV);
        window.addEventListener('orientationchange', () => setTimeout(() => { this._reflowMobileLayout(); this._updateMobileLandscapeFullscreenClass(); }, 50));
      }

                  // 初始数据加载与渲染
      this.syncUserPreferencesFromRoaming().finally(() => this.applyUserPreferences());
      this.loadInputDraft();
      // 新增：一键刷新后，若未设置背景，自动读取世界书首条背景并应用
      this._applyDefaultBackgroundIfFlagged();

      // 首轮门禁：首次进入不抓取/渲染 MVU，待玩家“一键刷新”后再启用
      this._evaluateFirstRunGateAndMaybeShow().then((blocked) => {
        if (blocked) return;
        this.ensureServices();
        this.updateDynamicData().catch(err => console.error('[归墟] 初次加载失败:', err));
        // 仅预取最新版本信息以填充缓存与版本徽标，不主动弹窗打扰；弹窗改为点击徽标触发
        try { setTimeout(() => window.UpdateNotifier?._fetchLatestRelease?.(), 500); } catch (_) {}
      });

      // 首次加载引导弹窗（移动端/桌面端，非全屏优先；嵌入式 iframe 亦适用）
      try { window.IntroModalComponent?.showFirstTimeIfNeeded?.(600); } catch(_) {}
    },

    ensureDynamicStyles() {
      try {
        if (!document.getElementById('guixu-dynamic-style')) {
          const style = document.createElement('style');
          style.id = 'guixu-dynamic-style';
          style.textContent = `
            /* 动态样式注入：思维链折叠与正文颜色/字体（提升主题色优先级） */
            .game-text-container,
            .game-text-container gametxt {
              color: var(--guixu-story-color, #e0dcd1) !important;
            }
            /* 默认正文颜色应用于正文容器（不影响思维链卡片） */
            #game-text-display {
              color: var(--guixu-story-default-color, var(--guixu-story-color, #e0dcd1)) !important;
            }

            /* 彻底取消任何“首行缩进”（含宿主站点规则与因思维链按钮导致的意外缩进） */
            #game-text-display,
            #game-text-display gametxt,
            #game-text-display p,
            .game-text-container,
            .game-text-container gametxt,
            .game-text-container p {
              text-indent: 0 !important;
              margin-left: 0 !important;
              padding-left: 0 !important;
            }
            /* 将 <gametxt> 作为块级元素渲染，避免受上方思维链按钮影响换行布局 */
            .game-text-container gametxt {
              display: block !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            /* 正文块容器：包裹渲染后的正文，彻底屏蔽首行缩进与左右内边距 */
            .game-text-container .story-paragraph {
              display: block !important;
              margin: 0 !important;
              padding: 0 !important;
              text-indent: 0 !important;
            }

            /* 特殊文本着色：引号/心理/景语 */
            #game-text-display .text-language {
              color: var(--guixu-story-quote-color, #ff4d4f) !important;
            }
            #game-text-display .text-psychology,
            #game-text-display .text-scenery {
              color: var(--guixu-story-color, #e0dcd1) !important;
            }

            /* 思维链按钮条：右上角对齐，更加圆润小巧 */
            #guixu-thinking-panel {
              margin-bottom: 2px;
              display: flex;
              align-items: center;
              justify-content: flex-start;
              gap: 6px;
              float: none !important;      /* 明确不参与浮动 */
              width: 100% !important;      /* 占满一行，后续正文不会环绕 */
            }
            /* 芯片按钮风格，遵循主色调 */
            .thinking-chip-btn {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              height: 28px;
              padding: 0 10px;
              border-radius: 16px;
              border: 1px solid #daa520;
              background: linear-gradient(45deg, #8b4513, #cd853f);
              color: #fff;
              font-size: 12px;
              box-shadow: 0 3px 8px rgba(0,0,0,0.35);
              transition: transform .15s ease, box-shadow .15s ease, background .2s ease;
              /* 防止在移动端被通用按钮样式拉伸为整行 */
              flex: 0 0 auto;
              width: auto;
              min-width: 28px;
              align-self: flex-start;
              white-space: nowrap;
              max-width: 50vw;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            /* 强制覆盖可能的通用 .interaction-btn 宽度规则 */
            #guixu-thinking-panel .thinking-chip-btn.interaction-btn {
              width: auto !important;
              flex: 0 0 auto !important;
              display: inline-flex !important;
            }
            .thinking-chip-btn:hover {
              transform: translateY(-1px);
              box-shadow: 0 4px 12px rgba(0,0,0,0.45);
              background: linear-gradient(45deg, #cd853f, #daa520);
            }
            .thinking-chip-text {
              font-weight: 600;
              letter-spacing: .5px;
            }
            /* 移动端：缩短芯片按钮并隐藏文字，避免过长 */
            .guixu-root-container.mobile-view #guixu-thinking-panel .thinking-chip-btn {
              height: 24px;
              padding: 0 8px;
              font-size: 11px;
              width: auto !important;
              flex: 0 0 auto !important;
              max-width: 60vw;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .guixu-root-container.mobile-view #guixu-thinking-panel .thinking-chip-text {
              display: inline;
            }

            /* 折叠面板：圆润卡片样式 */
            #guixu-thinking-content.thinking-box {
              display: none;
              margin-top: 2px;
              background: rgba(15, 15, 35, var(--guixu-thinking-bg-opacity, 0.85));
              border: 1px solid rgba(201, 170, 113, 0.35);
              border-radius: 10px;
              padding: 12px;
              max-height: 280px;
              overflow: auto;
              color: var(--guixu-thinking-color, #e0dcd1) !important;
              box-shadow: 0 8px 20px rgba(0,0,0,0.45);
              backdrop-filter: blur(1px);
            }
            #guixu-thinking-content pre {
              white-space: pre-wrap;
              word-break: break-word;
              margin: 0;
              font-size: 12px;
              line-height: 1.6;
            }

            /* 设置中心问号图标 */
            .info-icon {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 16px;
              height: 16px;
              border-radius: 50%;
              border: 1px solid #8b7355;
              color: #c9aa71;
              font-size: 12px;
              line-height: 16px;
              cursor: pointer;
              user-select: none;
              margin-left: 6px;
            }

            /* 行动方针：容器与按钮（每项独占一行，完整文本换行展示） */
            #guixu-action-guidelines {
              margin-top: 8px;
              border-top: 1px solid rgba(201, 170, 113, 0.3);
              padding-top: 6px;
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            #guixu-action-guidelines .guideline-label {
              font-size: 12px;
              color: #8b7355;
            }
            #guixu-action-guidelines .action-guideline-btn {
              width: 100% !important;
              text-align: center; /* 文本居中，桌面/移动端一致 */
              white-space: normal !important;
              word-break: break-word;
              line-height: 1.5;
              padding: 10px 12px;
              font-size: 13px;
              height: auto;
              box-sizing: border-box;
              /* 使用可配置的文字颜色与背景透明度（覆盖通用按钮风格） */
              color: var(--guixu-guideline-text-color, #e0dcd1) !important;
              background: rgba(15, 15, 35, var(--guixu-guideline-bg-opacity, 0.6)) !important;
              border: 1px solid #c9aa71 !important;
            }
            .guixu-root-container.mobile-view #guixu-action-guidelines .action-guideline-btn {
              font-size: 12px;
              padding: 10px 10px;
            }
          `;
          document.head.appendChild(style);
// 强制按钮/表单控件使用归墟的字体变量，覆盖宿主页面可能的系统字体 !important 规则
if (!document.getElementById('guixu-font-override-style')) {
  const s2 = document.createElement('style');
  s2.id = 'guixu-font-override-style';
  s2.textContent = `
    /* 确保“自定义字体”对按钮与输入控件生效（覆盖宿主的 !important） */
    .guixu-root-container .interaction-btn,
    .guixu-root-container .primary-btn,
    .guixu-root-container .danger-btn,
    .guixu-root-container .worldline-btn,
    .guixu-root-container .status-pop-btn,
    .guixu-root-container button,
    .guixu-root-container input,
    .guixu-root-container select,
    .guixu-root-container textarea {
      font-family: var(--guixu-font-family, "Microsoft YaHei", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif) !important;
    }
    /* 兼容快速发送框（明确继承变量） */
    .guixu-root-container .quick-send-input {
      font-family: var(--guixu-font-family, inherit) !important;
    }
  `;
  document.head.appendChild(s2);
}
// 首轮门禁“一键刷新”按钮样式
if (!document.getElementById('guixu-gate-style')) {
  const s3 = document.createElement('style');
  s3.id = 'guixu-gate-style';
  s3.textContent = `
    #btn-first-run-refresh.gate-refresh-btn{
      border:1px solid #c9aa71;
      background:linear-gradient(45deg,#1a1a2e,#2d1b3d);
      color:#c9aa71;
      height:32px;
      padding:0 10px;
      border-radius:6px;
      margin-right:6px;
      box-shadow:0 3px 10px rgba(0,0,0,0.35);
    }
    #btn-first-run-refresh.gate-refresh-btn:hover{
      background:linear-gradient(45deg,#2d1b3d,#3b2753);
    }
    .guixu-root-container.mobile-view #btn-first-run-refresh.gate-refresh-btn{
      height:30px;
      padding:0 8px;
      font-size:12px;
    }
  `;
  document.head.appendChild(s3);
}
        }
      } catch (_) {}
    },

    // 启动时兜底：确保所有模态默认关闭，避免残留遮罩拦截点击
    ensureAllModalsClosed() {
      try {
        document.querySelectorAll('.modal-overlay').forEach(el => {
          if (el && getComputedStyle(el).display !== 'none') {
            el.style.display = 'none';
          }
        });
      } catch (_) {}
    },

    ensureServices() {
      try {
        if (this._firstRoundBlockActive) {
          console.info('[归墟] 首轮门禁激活：延后启动自动轮询/写入');
          return;
        }
        if (window.GuixuState) {
          if (typeof window.GuixuState.startAutoTogglePolling === 'function') window.GuixuState.startAutoTogglePolling();
          if (typeof window.GuixuState.startAutoSavePolling === 'function') window.GuixuState.startAutoSavePolling();
          if (typeof window.GuixuState.startAutoWritePolling === 'function') window.GuixuState.startAutoWritePolling();
          if (typeof window.GuixuState.startNovelModeAutoWritePolling === 'function') window.GuixuState.startNovelModeAutoWritePolling();
          // 立即对当前序号应用一次世界书开关状态，保证切换实时生效
          try {
            const st = window.GuixuState?.getState?.();
            if (st && st.isAutoToggleLorebookEnabled) {
              const idxNow = st.unifiedIndex || 1;
              window.GuixuLorebookService?.toggleLorebook?.(idxNow, true);
            }
          } catch (_) {}
        }
      } catch (e) {
        console.warn('[归墟] ensureRefreshButton 失败:', e);
      }
    },

    // 新增：一键重roll 按钮（输入栏左侧；桌面位于“一键刷新”右侧；移动端两键同列）
    ensureRerollButton() {
      try {
        const qs = document.querySelector('#bottom-status-container .quick-send-container');
        if (!qs) return;
        this.ensureQuickSendLayout();
        const left = qs.querySelector('.qs-left') || qs;

        let btn = document.getElementById('btn-reroll-last');
        const insertAfterRefresh = () => {
          const refreshBtn = document.getElementById('btn-first-run-refresh');
          if (refreshBtn && refreshBtn.parentElement === left) {
            if (btn.nextSibling !== refreshBtn.nextSibling) {
              left.insertBefore(btn, refreshBtn.nextSibling);
            }
          } else {
            // 若未找到刷新按钮，退化为插入在左侧容器首位
            left.insertBefore(btn, left.firstChild || null);
          }
        };
        const applyMobileTwoBtnLayout = () => {
          try {
            const root = document.querySelector('.guixu-root-container');
            const isMobile = !!root && root.classList.contains('mobile-view');
            const hasRefresh = !!document.getElementById('btn-first-run-refresh');
            const hasReroll = !!document.getElementById('btn-reroll-last');
            left.classList.toggle('qs-left--two-btn', isMobile && hasRefresh && hasReroll);
          } catch (_) {}
        };

        if (!btn) {
          btn = document.createElement('button');
          btn.id = 'btn-reroll-last';
          btn.className = 'interaction-btn';
          btn.type = 'button';
          // 去除小图标，并统一命名为“重新生成”，以便与其他按钮等高对齐
          btn.textContent = '重新生成';
          btn.title = '使用上一轮的输入重新生成上一轮的回应';
          insertAfterRefresh();
          applyMobileTwoBtnLayout();

          btn.addEventListener('click', async () => {
            try {
              const last = window.GuixuState?.getState?.().lastSentPrompt;
              if (!last || !String(last).trim()) {
                window.GuixuHelpers?.showTemporaryMessage?.('没有找到上一轮输入，无法重新生成');
                return;
              }
              // 弹出文本编辑弹窗：允许用户修改上一轮输入（桌面/移动端、全屏/非全屏统一风格）
              const edited = await window.GuixuMain?.showTextPrompt?.({
                title: '编辑上一轮输入并重新生成',
                message: '可在下方修改上一轮输入后重新生成；留空将使用上一轮输入。',
                defaultValue: last,
                placeholder: '在此编辑上一轮输入…',
                okText: '重新生成',
                cancelText: '取消'
              });
              if (edited === null) return;
              const content = String(edited).trim() || last;
              try { window.GuixuActionService?.rerollLast?.(content); } catch (_) {}
            } catch (e) {
              console.warn('[归墟] 重新生成触发失败:', e);
              window.GuixuHelpers?.showTemporaryMessage?.('重新生成失败');
            }
          });
        } else {
          // 确保位置：紧随“一键刷新”之后
          if (btn.parentElement !== left) {
            left.appendChild(btn);
          }
          insertAfterRefresh();
          applyMobileTwoBtnLayout();
        }
      } catch (e) {
        console.warn('[归墟] ensureRerollButton 失败:', e);
      }
    },

    bindTopLevelListeners() {
      const $ = (sel, ctx = document) => ctx.querySelector(sel);
      const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

      // 视图切换
      $('#view-toggle-btn')?.addEventListener('click', () => {
        const container = $('.guixu-root-container');
        const isMobile = !container?.classList.contains('mobile-view');
        this.setMobileView(!!isMobile);
      });

      // 全屏切换
      $('#fullscreen-btn')?.addEventListener('click', () => this.toggleFullscreen());
      // 全屏状态变化时更新按钮并重新应用视口缩放（退出/进入全屏时需要重算）
      document.addEventListener('fullscreenchange', () => { 
        this._updateFullscreenButtonState(); 
        this.applyUserPreferences(); 
        // 全屏进入/退出时，确保移动端 FAB 存在并位于全屏子树内可见
        this._ensureFABsVisibleInFullscreen();
        this._restoreFabPositions();
        // 快速恢复：临时禁用动画/过渡，并多次重排
        this._pulseFastReflow(300);
        this._reflowMobileLayout();
        requestAnimationFrame(() => this._reflowMobileLayout());
        setTimeout(() => this._reflowMobileLayout(), 200);
        // 再次延时恢复一次，以适配浏览器状态栏/地址栏动画后的窗口尺寸
        setTimeout(() => this._restoreFabPositions(), 120);
        this._updateMobileLandscapeFullscreenClass();
        if (!document.fullscreenElement) {
          try { this._tryUnlockOrientation(); } catch (_) {}
          if (this._pendingRestoreMobileOnExitFullscreen) {
            this.setMobileView(true);
            this._pendingRestoreMobileOnExitFullscreen = false;
          }
        }
      });
      document.addEventListener('webkitfullscreenchange', () => { 
        this._updateFullscreenButtonState(); 
        this.applyUserPreferences(); 
        this._ensureFABsVisibleInFullscreen();
        this._restoreFabPositions();
        this._pulseFastReflow(300);
        this._reflowMobileLayout();
        requestAnimationFrame(() => this._reflowMobileLayout());
        setTimeout(() => this._reflowMobileLayout(), 200);
        setTimeout(() => this._restoreFabPositions(), 120);
        this._updateMobileLandscapeFullscreenClass();
        if (!document.fullscreenElement) {
          try { this._tryUnlockOrientation(); } catch (_) {}
          if (this._pendingRestoreMobileOnExitFullscreen) {
            this.setMobileView(true);
            this._pendingRestoreMobileOnExitFullscreen = false;
          }
        }
      });
      // 初始化一次按钮状态
      this._updateFullscreenButtonState();

      // 右侧按钮 -> 组件入口
      $('#btn-inventory')?.addEventListener('click', () => window.InventoryComponent?.show?.());
      $('#btn-relationships')?.addEventListener('click', () => window.RelationshipsComponent?.show?.());
      $('#btn-command-center')?.addEventListener('click', () => window.CommandCenterComponent?.show?.());
      $('#btn-guixu-system')?.addEventListener('click', () => window.GuixuSystemComponent?.show?.());
      $('#btn-show-extracted')?.addEventListener('click', () => window.ExtractedContentComponent?.show?.());
      $('#btn-save-load-manager')?.addEventListener('click', () => window.GuixuActionService?.showSaveLoadManager?.());
      $('#btn-settings')?.addEventListener('click', () => { 
        window.SettingsComponent?.show?.(); 
      });
      $('#btn-intro-guide')?.addEventListener('click', () => window.IntroModalComponent?.show?.());
      $('#btn-view-statuses')?.addEventListener('click', () => window.StatusesComponent?.show?.());
      // 新增：创建底部“状态一览”弹窗按钮（替代滚动条）
      this.ensureStatusPopupButton();


      // 世界线回顾
      $('#btn-view-journey-main')?.addEventListener('click', () => window.JourneyComponent?.show?.());
      $('#btn-view-past-lives-main')?.addEventListener('click', () => window.PastLivesComponent?.show?.());

      // 存档管理入口
      $('#btn-clear-all-saves')?.addEventListener('click', () => window.GuixuActionService?.clearAllSaves?.());
      $('#btn-import-save')?.addEventListener('click', () => document.getElementById('import-file-input')?.click());
      $('#import-file-input')?.addEventListener('change', (e) => window.GuixuActionService?.handleFileImport?.(e));

      // 指令中心（组件未加载时的后备绑定）
      $('#btn-execute-commands')?.addEventListener('click', () => this.handleAction());
      $('#btn-clear-commands')?.addEventListener('click', () => {
        window.GuixuState.update('pendingActions', []);
        window.GuixuHelpers.showTemporaryMessage('指令已清空');
        // 立即刷新指令中心内容
        if (window.CommandCenterComponent?.show) {
          window.CommandCenterComponent.show();
        } else {
          const body = document.querySelector('#command-center-modal .modal-body');
          if (body) body.innerHTML = '<div class="quick-command-empty">暂无待执行的指令</div>';
        }
      });
      $('#btn-refresh-storage')?.addEventListener('click', () => this.refreshLocalStorage());

      // 统一序号输入
      $('#unified-index-input')?.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val > 0) {
          window.GuixuState.update('unifiedIndex', val);
          window.GuixuHelpers.showTemporaryMessage(`世界书读写序号已更新为 ${val}`);
          // 若已开启“自动开关世界书”，立即切换到新序号对应的激活条目
          try {
            const autoOn = !!(window.GuixuState?.getState?.().isAutoToggleLorebookEnabled);
            if (autoOn) {
              window.GuixuLorebookService?.toggleLorebook?.(val, true);
            }
          } catch (_) {}
        } else {
          e.target.value = window.GuixuState.getState().unifiedIndex || 1;
        }
      });

      // 自动开关世界书
      $('#auto-toggle-lorebook-checkbox')?.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        window.GuixuState.update('isAutoToggleLorebookEnabled', isEnabled);
        window.GuixuHelpers.showTemporaryMessage(`自动开关世界书已${isEnabled ? '开启' : '关闭'}`);
        // 立即生效：立刻对当前序号进行开/关
        try {
          const idxNow = window.GuixuState?.getState?.().unifiedIndex || 1;
          window.GuixuLorebookService?.toggleLorebook?.(idxNow, isEnabled);
        } catch (_) {}
        if (isEnabled) window.GuixuState.startAutoTogglePolling();
        else window.GuixuState.stopAutoTogglePolling?.();
      });

      // 自动存档
      $('#auto-save-checkbox')?.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        window.GuixuState.update('isAutoSaveEnabled', isEnabled);
        window.GuixuHelpers.showTemporaryMessage(`自动存档已${isEnabled ? '开启' : '关闭'}`);
        if (isEnabled) window.GuixuState.startAutoSavePolling();
        else window.GuixuState.stopAutoSavePolling?.();
      });

      // 快速发送
      $('#btn-quick-send')?.addEventListener('click', async () => {
        const input = $('#quick-send-input');
        const userMessage = input?.value?.trim() || '';
        await this.handleAction(userMessage);
      });

      // 输入缓存：实时保存草稿
      const quickInput = $('#quick-send-input');
      quickInput?.addEventListener('input', () => this.saveInputDraft());

      // 当前指令面板
      $('#btn-quick-commands')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const popup = $('#quick-command-popup');
        if (!popup) return;
        if (popup.style.display === 'block') this.hideQuickCommands();
        else this.showQuickCommands();
      });

      document.addEventListener('click', (e) => {
        const popup = $('#quick-command-popup');
        const button = $('#btn-quick-commands');
        if (popup && button && popup.style.display === 'block') {
          if (!popup.contains(e.target) && !button.contains(e.target)) this.hideQuickCommands();
        }

        // 点击空白处关闭设置FAB的菜单
        const fabMenu = document.getElementById('fab-settings-menu');
        const fabSettings = document.getElementById('fab-settings');
        if (fabMenu && getComputedStyle(fabMenu).display !== 'none') {
          if (!fabMenu.contains(e.target) && (!fabSettings || !fabSettings.contains(e.target))) {
            this.hideSettingsFabMenu();
          }
        }

        // 指令中心按钮事件（委托，解决动态渲染导致的失效）
        const t = e.target;
        if (t && (t.id === 'btn-execute-commands' || t.id === 'btn-clear-commands' || t.id === 'btn-refresh-storage')) {
          e.preventDefault();
          e.stopPropagation();
          if (t.id === 'btn-execute-commands') this.handleAction();
          else if (t.id === 'btn-clear-commands') {
            window.GuixuState.update('pendingActions', []);
            window.GuixuHelpers.showTemporaryMessage('指令已清空');
            // 立即刷新指令中心内容（委托情况）
            if (window.CommandCenterComponent?.show) {
              window.CommandCenterComponent.show();
            } else {
              const body = document.querySelector('#command-center-modal .modal-body');
              if (body) body.innerHTML = '<div class="quick-command-empty">暂无待执行的指令</div>';
            }
          } else if (t.id === 'btn-refresh-storage') {
            this.refreshLocalStorage();
          }
          return;
        }

        // 通用模态关闭委托：点击右上角X或遮罩空白处关闭（尊重 data-allow-close）
        const closeBtn = e.target.closest?.('.modal-close-btn');
        if (closeBtn) {
          const overlay = closeBtn.closest('.modal-overlay');
          if (overlay && overlay.dataset && overlay.dataset.allowClose === '0') {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (overlay) {
            overlay.style.display = 'none';
          } else {
            window.GuixuBaseModal?.closeAll?.();
          }
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // 点击遮罩空白处关闭（仅当直接点到 overlay 自身时，且允许关闭）
        if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
          const ov = e.target;
          if (ov && ov.dataset && ov.dataset.allowClose === '0') {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          ov.style.display = 'none';
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // 点击空白关闭移动端“角色/功能”浮层（不影响模态）
        try {
          const rootEl = document.querySelector('.guixu-root-container');
          if (rootEl && rootEl.classList.contains('mobile-view')) {
            const target = e.target;
            const charPanel = document.querySelector('.character-panel');
            const funcPanel = document.querySelector('.interaction-panel');
            const fabChar = document.getElementById('fab-character');
            const fabFunc = document.getElementById('fab-functions');

            if (rootEl.classList.contains('show-character-panel')) {
              if (charPanel && !charPanel.contains(target) && (!fabChar || !fabChar.contains(target))) {
                rootEl.classList.remove('show-character-panel');
              }
            }
            if (rootEl.classList.contains('show-interaction-panel')) {
              if (funcPanel && !funcPanel.contains(target) && (!fabFunc || !fabFunc.contains(target))) {
                rootEl.classList.remove('show-interaction-panel');
              }
            }
          }
        } catch (_) {}
      });

      // 按下 ESC 关闭最顶部模态（尊重 data-allow-close）
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const overlays = Array.from(document.querySelectorAll('.modal-overlay')).filter(el => getComputedStyle(el).display !== 'none');
          if (overlays.length > 0) {
            const top = overlays[overlays.length - 1];
            if (top && top.dataset && top.dataset.allowClose === '0') {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            top.style.display = 'none';
            e.preventDefault();
            e.stopPropagation();
          }
        }
      });

      // 角色面板装备槽：悬浮提示/点击卸下
      const characterPanel = $('.character-panel');
      if (characterPanel) {
        characterPanel.addEventListener('mouseover', (e) => {
          const slot = e.target.closest('.equipment-slot');
          if (!slot || !slot.classList.contains('equipped')) return;
          this.showEquipmentTooltip(slot, e);
        });
        characterPanel.addEventListener('mouseout', (e) => {
          const slot = e.target.closest('.equipment-slot');
          if (!slot) return;
          this.hideEquipmentTooltip();
        });
        characterPanel.addEventListener('click', (e) => {
          const slot = e.target.closest('.equipment-slot');
          if (slot && slot.classList.contains('equipped')) {
    e.preventDefault();
    // 更新：点击已装备槽位时先弹出确认浮窗（移动端/桌面端、全屏/非全屏通用），避免误触直接卸下
    try { this.hideEquipmentTooltip(); } catch (_) {}
    const slotId = slot.id || '';
    // 解析物品名称用于确认文案
    let itemName = '一件装备';
    try {
      const raw = (slot.dataset?.itemDetails || '').replace(/'/g, "'");
      const obj = raw ? JSON.parse(raw) : null;
      itemName = window.GuixuHelpers?.SafeGetValue(obj, 'name', itemName) || itemName;
    } catch (_) {}
    const msg = `确定要卸下【${itemName}】吗？`;
    const doUnequip = () => {
      try {
        if (window.InventoryComponent && typeof window.InventoryComponent.unequipItem === 'function') {
          window.InventoryComponent.unequipItem(slotId);
        }
      } catch (_) {}
    };
    if (window.GuixuMain && typeof window.GuixuMain.showCustomConfirm === 'function') {
      window.GuixuMain.showCustomConfirm(msg, doUnequip, () => {});
    } else {
      if (confirm(msg)) doUnequip();
    }
          }
        });
      }

      // 历程修剪弹窗事件
      const trimModal = $('#trim-journey-modal');
      if (trimModal) {
        trimModal.addEventListener('click', (e) => {
          if (e.target.id === 'btn-confirm-trim') this.trimJourneyAutomation();
          if (e.target.id === 'btn-cancel-trim' || e.target.closest('.modal-close-btn')) {
            trimModal.style.display = 'none';
          }
        });
        // 打开时同步序号
        const idxEl = $('#trim-journey-index-input');
        if (idxEl) {
          const idx = window.GuixuState?.getState?.().unifiedIndex || 1;
          idxEl.value = String(idx);
        }
      }
    },

    // 订阅全局状态事件（仅绑定一次）
    ensureStateSubscriptions() {
      try {
        if (this._stateSubsBound) return;
        this._stateSubsBound = true;

        // 当 MVU 完整状态变更（包括 stat_data）时，直接用最新 stat 渲染
        document.addEventListener('guixu:mvuChanged', (e) => {
          try {
            const stat = e && e.detail ? e.detail.stat_data : null;
            if (stat && Object.keys(stat).length > 0) {
              this.renderUI(stat);
              if (window.GuixuAttributeService?.updateDisplay) window.GuixuAttributeService.updateDisplay();
            } else {
              // 缺少 stat_data 时兜底拉一次
              this.updateDynamicData();
            }
          } catch (_) {}
        }, { passive: true });

        // 当本地装备槽位状态变化时（equippedItems），优先基于当前缓存的 mvu 进行统一渲染
        document.addEventListener('guixu:equippedChanged', () => {
          try {
            const stat = window.GuixuState?.getState?.().currentMvuState?.stat_data || null;
            if (stat && Object.keys(stat).length > 0) {
              this.renderUI(stat);
              if (window.GuixuAttributeService?.updateDisplay) window.GuixuAttributeService.updateDisplay();
            } else {
              this.updateDynamicData();
            }
          } catch (_) {}
        }, { passive: true });

        // 可选调试：通用状态变更
        // document.addEventListener('guixu:stateChanged', (e) => { console.log('stateChanged', e.detail); }, { passive: true });
      } catch (e) {
        console.warn('[归墟] ensureStateSubscriptions 失败:', e);
      }
    },

    // 新增：确保底部状态弹窗按钮存在
    ensureStatusPopupButton() {
      try {
        const bottom = document.getElementById('bottom-status-container');
        if (!bottom) return;
        if (!document.getElementById('btn-status-pop')) {
          const btn = document.createElement('button');
          btn.id = 'btn-status-pop';
          btn.className = 'status-pop-btn';
          // 初始文案：后续会在 renderUI 中根据实际状态数量动态更新
          btn.innerHTML = '<div class="effect-icon"></div><span>当前无状态效果</span>';
          btn.title = '查看当前状态';
          btn.addEventListener('click', () => window.StatusesComponent?.show?.());
          const qs = bottom.querySelector('.quick-send-container');
          bottom.insertBefore(btn, qs || null);
        }
      } catch (e) {
        console.warn('[归墟] ensureStatusPopupButton 失败:', e);
      }
    },

 
    // 新增：移动端视图切换与悬浮按钮
    _getViewportEl() {
      try { return document.getElementById('guixu-viewport'); } catch (_) { return null; }
    },

    setMobileView(enable) {
      try {
        const root = document.querySelector('.guixu-root-container');
        const viewport = this._getViewportEl();
        if (!root) return;

        if (enable) {
          // 显式切到移动端：移除桌面强制类
          root.classList.remove('force-desktop', 'show-character-panel', 'show-interaction-panel');
          viewport?.classList?.remove('force-desktop');
          root.classList.add('mobile-view');
          viewport?.classList?.add('mobile-view');
          try { localStorage.setItem('guixu_force_view', 'mobile'); } catch(_) {}
          this._pendingRestoreMobileOnExitFullscreen = false;
          this._ensureMobileFABs();
          this._ensureFABsVisibleInFullscreen();
          this._restoreFabPositions();
          requestAnimationFrame(() => this._restoreFabPositions());
          setTimeout(() => this._restoreFabPositions(), 150);
          // 全屏下切到移动端时，强制锁定竖屏，且明确移除横屏移动端全屏模式类
          try {
            if (document.fullscreenElement && this._isMobileEnv()) {
              this._tryLockPortraitOrientation?.();
            }
          } catch (_) {}
          this._updateMobileLandscapeFullscreenClass?.(); // 该方法将清理横屏标记
        } else {
          // 显式切到桌面端：移除移动端类并加上强制桌面类（覆盖小屏CSS兜底）
          root.classList.remove('mobile-view', 'show-character-panel', 'show-interaction-panel');
          viewport?.classList?.remove('mobile-view');
          root.classList.add('force-desktop');
          viewport?.classList?.add('force-desktop');
          try { localStorage.setItem('guixu_force_view', 'desktop'); } catch(_) {}
          this._removeMobileFABs();
          // 若在全屏内从移动端切到桌面端，尝试锁定为横屏（仅在移动设备/触控环境更有意义）
          try {
            const isCoarse = window.matchMedia('(pointer: coarse)').matches;
            const isPortrait = window.matchMedia('(orientation: portrait)').matches;
            const isNarrow = window.matchMedia('(max-width: 900px)').matches;
            const isMobileEnv = (window.SillyTavern?.isMobile?.() === true) || isCoarse || isNarrow;
            if (document.fullscreenElement && isMobileEnv && isPortrait) {
              this._tryLockLandscapeOrientation();
            }
          } catch (_) {}
          // 标记：若在全屏中强制桌面，退出全屏时自动恢复移动端视图
          try {
            if (document.fullscreenElement && this._isMobileEnv()) {
              this._pendingRestoreMobileOnExitFullscreen = true;
            }
          } catch (_) {}
        }

        // 更新按钮状态与偏好应用（会触发视口计算）
        const btn = document.getElementById('view-toggle-btn');
        if (btn) {
          btn.textContent = enable ? '💻' : '📱';
          btn.title = enable ? '切换到桌面视图' : '切换到移动视图';
        }
        this.applyUserPreferences();
        // 视图切换后，重新校正“刷新 + 重掷”在移动端的双键布局
        try { this.ensureRerollButton(); } catch (_) {}
        // 同步更新侧栏开合按钮的图标（在桌面/移动端切换后）
        try { this._updatePaneToggleLabels(); } catch (_) {}
        this._applyEmbeddedVisibilityFix();
        this._pulseFastReflow(200);
        this._reflowMobileLayout();
        this._updateMobileLandscapeFullscreenClass();
      } catch (e) {
        console.warn('[归墟] setMobileView 失败:', e);
      }
    },

    _autoDetectMobileAndApply() {
      try {
        const root = document.querySelector('.guixu-root-container');
        const viewport = this._getViewportEl();

        // 用户强制视图优先（localStorage 记忆）
        try {
          const pref = (localStorage.getItem('guixu_force_view') || '').toLowerCase();
          if (pref === 'desktop') { this.setMobileView(false); return; }
          if (pref === 'mobile')  { this.setMobileView(true);  return; }
        } catch(_) {}

        // 若用户显式切换到桌面端，则不再自动切换回移动端
        if (root?.classList.contains('force-desktop') || viewport?.classList.contains('force-desktop')) return;

        const shouldMobile =
          (window.SillyTavern?.isMobile?.() === true) ||
          window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
        if (shouldMobile) this.setMobileView(true);
      } catch (e) {
        console.warn('[归墟] 自动检测移动端失败:', e);
      }
    },

        // 针对移动端FAB：根据全屏/非全屏区分位置持久化键
    _getFabStorageKey(id) {
      try {
        const mode = document.fullscreenElement ? 'full' : 'window';
        return `guixu_fab_pos_${id}_${mode}`;
      } catch (_) {
        return `guixu_fab_pos_${id}`;
      }
    },

    // 读取FAB保存（兼容旧版未带模式后缀的key）
    _readFabSavedState(id) {
      try {
        const key = this._getFabStorageKey(id);
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch(_) { saved = null; }
        if (saved) return saved;
        const legacyKey = `guixu_fab_pos_${id}`;
        try { saved = JSON.parse(localStorage.getItem(legacyKey) || 'null'); } catch(_) { saved = null; }
        return saved || null;
      } catch(_) { return null; }
    },

    // 从本地存储恢复 FAB 位置（区分全屏/窗口）
    _restoreFabPositions() {
      try {
        ['fab-character', 'fab-functions', 'fab-settings'].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const saved = this._readFabSavedState(id);
          if (saved && (typeof saved.left === 'number' || typeof saved.leftPct === 'number')) {
            const vw = window.innerWidth || 1;
            const vh = window.innerHeight || 1;
            const r = el.getBoundingClientRect();
            const w = r.width || 56;
            const h = r.height || 56;
            let left = typeof saved.left === 'number' ? saved.left : 0;
            let top = typeof saved.top === 'number' ? saved.top : 0;
            // 若窗口尺寸变化较大，优先按比例恢复
            if (typeof saved.leftPct === 'number' && saved.vw && Math.abs((saved.vw|0) - (vw|0)) > 8) {
              left = Math.round(saved.leftPct * Math.max(0, vw - w));
            }
            if (typeof saved.topPct === 'number' && saved.vh && Math.abs((saved.vh|0) - (vh|0)) > 8) {
              top = Math.round(saved.topPct * Math.max(0, vh - h));
            }
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
            el.style.right = 'auto';
            this._clampFabWithinViewport(el);
          }
        });
      } catch (_) {}
    },

    // 修复：移动端设置中心“分辨率-自定义”一行的布局（已废弃：分辨率模块移除）
    _fixSettingsResolutionRowLayout() {
      try {
        // 已移除分辨率UI，保留空实现用于兼容旧引用
      } catch (_) {}
    },

    // 保证在“自定义”模式下两个输入框可编辑（已废弃：分辨率模块移除）
    _ensureResolutionInputsUsable() {
      try {
        // 已移除分辨率UI，保留空实现用于兼容旧引用
      } catch (_) {}
    },


    _ensureMobileFABs() {
      try {
        const root = document.querySelector('.guixu-root-container');
        if (!root) return;
        if (document.getElementById('fab-character') && document.getElementById('fab-functions') && document.getElementById('fab-settings')) return;

        const makeFab = (id, text, title, leftRightStyles, onClick) => {
          const btn = document.createElement('button');
          btn.id = id;
          btn.className = 'mobile-fab';
          btn.type = 'button';
          btn.textContent = text;
          btn.title = title;
          btn.style.position = 'fixed';
          btn.style.zIndex = '10040';
          btn.style.width = '44px';
          btn.style.height = '44px';
          btn.style.borderRadius = '50%';
          btn.style.border = '1px solid #c9aa71';
          btn.style.background = 'rgba(15, 15, 35, 0.9)';
          btn.style.color = '#c9aa71';
          btn.style.display = 'flex';
          btn.style.alignItems = 'center';
          btn.style.justifyContent = 'center';
          btn.style.fontSize = '12px';
          btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
          btn.style.touchAction = 'none';
          btn.style.bottom = '72px';
          Object.entries(leftRightStyles).forEach(([k, v]) => (btn.style[k] = v));
          btn.addEventListener('click', onClick);
          (root || document.body).appendChild(btn);

          // 恢复持久化位置
          try {
            const saved = JSON.parse(localStorage.getItem(this._getFabStorageKey(id)) || 'null');
            if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
              btn.style.left = `${saved.left}px`;
              btn.style.top = `${saved.top}px`;
              btn.style.right = 'auto';
            }
          } catch (_) {}

          // 位置越界校正（视口变化或全屏切换后）
          this._clampFabWithinViewport(btn);

          this._makeDraggable(btn);
          return btn;
        };

        makeFab(
          'fab-character',
          '角色',
          '打开角色面板',
          { left: '16px' },
          () => {
            const rootEl = document.querySelector('.guixu-root-container');
            if (!rootEl) return;
            const willOpen = !rootEl.classList.contains('show-character-panel');
            rootEl.classList.toggle('show-character-panel', willOpen);
            if (willOpen) rootEl.classList.remove('show-interaction-panel');
          }
        );

        makeFab(
          'fab-functions',
          '功能',
          '打开功能面板',
          { right: '16px' },
          () => {
            const rootEl = document.querySelector('.guixu-root-container');
            if (!rootEl) return;
            const willOpen = !rootEl.classList.contains('show-interaction-panel');
            rootEl.classList.toggle('show-interaction-panel', willOpen);
            if (willOpen) rootEl.classList.remove('show-character-panel');
          }
        );

        // 设置与更多 FAB（居中偏下，统一聚合 设置/全屏/切换视图）
        const fabSettings = makeFab(
          'fab-settings',
          '⚙',
          '打开设置与更多',
          { left: 'calc(50% - 22px)' },
          () => this.toggleSettingsFabMenu()
        );
      } catch (e) {
        console.warn('[归墟] _ensureMobileFABs 失败:', e);
      }
    },

    // 设置FAB菜单：显示/隐藏/切换（仅移动端）
    toggleSettingsFabMenu() {
      try {
        const menu = document.getElementById('fab-settings-menu');
        if (menu && getComputedStyle(menu).display !== 'none') {
          this.hideSettingsFabMenu();
        } else {
          this.showSettingsFabMenu();
        }
      } catch (_) {}
    },
    showSettingsFabMenu() {
      try {
        let menu = document.getElementById('fab-settings-menu');
        const root = document.querySelector('.guixu-root-container');
        if (!root) return;
        if (!menu) {
          menu = document.createElement('div');
          menu.id = 'fab-settings-menu';
          menu.style.position = 'fixed';
          menu.style.zIndex = '10055';
          menu.style.display = 'flex';
          menu.style.flexDirection = 'column';
          menu.style.gap = '8px';
          menu.style.padding = '10px';
          menu.style.border = '1px solid #c9aa71';
          menu.style.borderRadius = '8px';
          menu.style.background = 'rgba(15,15,35,0.95)';
          menu.style.boxShadow = '0 6px 16px rgba(0,0,0,0.45)';
          const mkBtn = (text, handler) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.style.cssText = 'min-width:120px;height:34px;padding:0 10px;border:1px solid #c9aa71;border-radius:6px;background:linear-gradient(45deg,#1a1a2e,#2d1b3d);color:#c9aa71;font-size:12px;box-sizing:border-box;';
            b.addEventListener('click', (e) => { e.stopPropagation(); this.hideSettingsFabMenu(); handler(); });
            return b;
          };
          menu.appendChild(mkBtn('全屏切换', () => this.toggleFullscreen()));
          menu.appendChild(mkBtn('切到桌面端', () => this.setMobileView(false)));
          root.appendChild(menu);
        } else {
          menu.style.display = 'flex';
        }
        // 位置：贴着设置FAB上方居中
        const fab = document.getElementById('fab-settings');
        if (fab) {
          const rect = fab.getBoundingClientRect();
          // 先临时显示以获取尺寸
          const vw = window.innerWidth;
          const menuRect = menu.getBoundingClientRect();
          const mw = menuRect.width || 160;
          const mh = menuRect.height || 140;
          const left = Math.max(8, Math.min(vw - mw - 8, rect.left + rect.width / 2 - mw / 2));
          const top = Math.max(8, rect.top - mh - 10);
          menu.style.left = `${left}px`;
          menu.style.top = `${top}px`;
        } else {
          menu.style.left = 'calc(50% - 80px)';
          menu.style.top = '30%';
        }
      } catch (e) {
        console.warn('[归墟] showSettingsFabMenu 失败:', e);
      }
    },
    hideSettingsFabMenu() {
      try {
        const menu = document.getElementById('fab-settings-menu');
        if (menu) menu.style.display = 'none';
      } catch (_) {}
    },

    // 确保全屏时 FAB 可见且处于全屏元素子树内
    _ensureFABsVisibleInFullscreen() {
      try {
        const root = document.querySelector('.guixu-root-container');
        if (!root) return;
        // 仅在移动端视图下处理
        if (!root.classList.contains('mobile-view')) return;

        // 确保存在
        this._ensureMobileFABs();

        // 将 FAB 重新挂载到 root（全屏元素）下，并提升层级
        ['fab-character', 'fab-functions', 'fab-settings'].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          if (el.parentElement !== root) {
            root.appendChild(el);
          }
          el.style.zIndex = '10060';
          el.style.display = 'flex';
          this._clampFabWithinViewport(el);
        });
        // 设置菜单也挂到 root 之下，确保全屏时可见
        const settingsMenu = document.getElementById('fab-settings-menu');
        if (settingsMenu && settingsMenu.parentElement !== root) {
          root.appendChild(settingsMenu);
        }
        if (settingsMenu) settingsMenu.style.zIndex = '10065';
      } catch (e) {
        console.warn('[归墟] _ensureFABsVisibleInFullscreen 失败:', e);
      }
    },

    // 将 FAB 位置限制在当前可视区域内（适配全屏/窗口变化）
    _clampFabWithinViewport(el) {
      try {
        if (!el) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = el.getBoundingClientRect();
        const w = rect.width || 56;
        const h = rect.height || 56;
        const getNum = (v) => (parseFloat(String(v || '0')) || 0);
        let left = getNum(el.style.left);
        let top = getNum(el.style.top);
        // 若未设置 left/top，使用当前可见位置
        if (!left && !top) {
          left = rect.left; top = rect.top;
        }
        left = Math.max(0, Math.min(vw - w, left));
        top = Math.max(0, Math.min(vh - h, top));
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.right = 'auto';
      } catch (_) {}
    },

    _removeMobileFABs() {
      ['fab-character', 'fab-functions', 'fab-settings', 'fab-settings-menu'].forEach(id => {
        try {
          const el = document.getElementById(id);
          if (el) el.remove();
        } catch (_) {}
      });
    },

    _makeDraggable(el) {
      try {
        let dragging = false;
        let startX = 0, startY = 0, originLeft = 0, originTop = 0;

        const getNum = (v) => (parseFloat(String(v || '0')) || 0);
        const pointerDown = (e) => {
          dragging = true;
          const pt = e.touches ? e.touches[0] : e;
          startX = pt.clientX;
          startY = pt.clientY;
          originLeft = getNum(el.style.left);
          originTop = getNum(el.style.top);
          // 若未设置left/right，补一个基于当前布局的left
          if (!el.style.left && !el.style.right) {
            const rect = el.getBoundingClientRect();
            el.style.left = `${rect.left}px`;
            el.style.top = `${rect.top}px`;
          }
          document.addEventListener('pointermove', pointerMove, { passive: false });
          document.addEventListener('pointerup', pointerUp, { passive: true, once: true });
        };

        const pointerMove = (e) => {
          if (!dragging) return;
          e.preventDefault();
          const pt = e.touches ? e.touches[0] : e;
          const dx = pt.clientX - startX;
          const dy = pt.clientY - startY;
          let nextLeft = originLeft + dx;
          let nextTop = originTop + dy;

          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const rect = el.getBoundingClientRect();
          const w = rect.width || 56;
          const h = rect.height || 56;
          nextLeft = Math.max(0, Math.min(vw - w, nextLeft));
          nextTop = Math.max(0, Math.min(vh - h, nextTop));

          el.style.left = `${nextLeft}px`;
          el.style.right = 'auto';
          el.style.top = `${nextTop}px`;
        };

        const pointerUp = () => {
          dragging = false;
          document.removeEventListener('pointermove', pointerMove);
          // 持久化保存位置（同时保存相对比例，便于不同窗口尺寸/退出全屏后的还原）
          try {
            const left = getNum(el.style.left);
            const top = getNum(el.style.top);
            const vw = window.innerWidth || 1;
            const vh = window.innerHeight || 1;
            const r = el.getBoundingClientRect();
            const w = r.width || 56;
            const h = r.height || 56;
            const leftPct = (vw > w) ? Math.max(0, Math.min(1, left / (vw - w))) : 0;
            const topPct = (vh > h) ? Math.max(0, Math.min(1, top / (vh - h))) : 0;
            localStorage.setItem(this._getFabStorageKey(el.id), JSON.stringify({ left, top, vw, vh, leftPct, topPct }));
            // 兼容旧版key，顺带落一份，避免迁移期丢失
            localStorage.setItem(`guixu_fab_pos_${el.id}`, JSON.stringify({ left, top, vw, vh, leftPct, topPct }));
          } catch (_) {}
        };

        el.addEventListener('pointerdown', pointerDown, { passive: true });
      } catch (e) {
        console.warn('[归墟] _makeDraggable 失败:', e);
      }
    },

    // 嵌入式(iframe)环境下的可见性兜底：若高度过小则强制启用 embedded-fix 样式
    _applyEmbeddedVisibilityFix() {
      try {
        const viewport = this._getViewportEl();
        const root = document.querySelector('.guixu-root-container');
        if (!viewport || !root) return;

        // 注入一次性样式，确保即使外部CSS未更新也能生效
        if (!document.getElementById('guixu-embedded-fix-style')) {
          const style = document.createElement('style');
          style.id = 'guixu-embedded-fix-style';
          style.textContent = `
            /* 仅桌面非全屏下的嵌入式兜底（更强覆盖） */
            .guixu-viewport.embedded-fix:not(.mobile-view){
              display:block!important;
              width:100%!important;
              height:auto!important;
              overflow:visible!important;
              min-height:640px!important;
            }
            .guixu-viewport.embedded-fix:not(.mobile-view) .guixu-root-container:not(:fullscreen){
              display:block!important;
              position:static!important;
              left:auto!important;
              top:auto!important;
              width:100%!important;
              height:auto!important;
              min-height:640px!important;
              overflow:visible!important;
            }
            .guixu-root-container.embedded-fix:not(.mobile-view):not(:fullscreen) .game-container{
              display:flex!important;
              flex-direction:column!important;
              gap:0!important;
              min-height:760px!important;
              height:auto!important;
            }
            .guixu-root-container.embedded-fix:not(.mobile-view):not(:fullscreen) .main-content{
              flex:1 1 auto!important;
              min-height:0!important;
              overflow-y:auto!important;
            }
          `;
          document.head.appendChild(style);
        }

        // 在移动端或全屏下不启用 embedded-fix（仅桌面+非全屏兜底）
        const isMobile = root.classList.contains('mobile-view') || (viewport && viewport.classList.contains('mobile-view'));
        const isFull = !!document.fullscreenElement;
        if (isMobile || isFull) {
          root.classList.remove('embedded-fix');
          viewport.classList.remove('embedded-fix');
          return;
        }

        // 计算当前可见高度（避免 transform/absolute 影响导致为 0）
        const rect = root.getBoundingClientRect();
        const h = rect.height || root.offsetHeight || root.scrollHeight || 0;

        // 条件：内容高度过小或 viewport 不可见时，开启兜底
        const needFix = h < 560 || !(rect.width > 0 && rect.height > 0);
        root.classList.toggle('embedded-fix', needFix);
        viewport.classList.toggle('embedded-fix', needFix);
      } catch (e) {
        console.warn('[归墟] _applyEmbeddedVisibilityFix 失败:', e);
      }
    },


    // 新增：移动端主内容固定高度 + 溢出滚动（避免正文根据文字量无限拉伸）
    _reflowMobileLayout(forceOnEditing = false) {
      try {
        const root = document.querySelector('.guixu-root-container');
        const viewport = this._getViewportEl();
        const main = document.querySelector('.main-content');
        if (!root || !main) return;

        // 若当前正在编辑底部输入框，跳过本次重排，防止软键盘引发的抖动
        const ae = document.activeElement;
        if (ae && (ae.id === 'quick-send-input' || ae.classList?.contains('quick-send-input')) && !forceOnEditing) return;

        const isMobile = root.classList.contains('mobile-view') || (viewport && viewport.classList.contains('mobile-view'));
        const isFullscreen = !!document.fullscreenElement;

        // 桌面端 非全屏：同样限制正文高度并启用滚动，避免被长文本拉伸父页面
        if (!isMobile && !isFullscreen) {
          const vvH = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : 0;
          const docH = document.documentElement?.clientHeight || 0;
          const baseH = Math.max(vvH, window.innerHeight || 0, docH);

          const topEl = document.querySelector('.top-status');
          const bottomEl = document.getElementById('bottom-status-container');
          const topH = topEl ? topEl.getBoundingClientRect().height : 0;
          const bottomH = bottomEl ? bottomEl.getBoundingClientRect().height : 0;
          const reserves = 12;

          let available = baseH - topH - bottomH - reserves;
          if (!isFinite(available) || available <= 0) {
            available = Math.floor((baseH || 800) * 0.75);
          }
          // 防抖上限，避免多次重排越算越大；并给出合理下限
          available = Math.min(available, Math.max(240, baseH - reserves));
          const target = Math.max(420, Math.round(available));

          // 三栏统一限高 + 滚动：左（角色）、中（正文）、右（功能）
          const charEl = document.querySelector('.character-panel');
          const rightEl = document.querySelector('.interaction-panel');

          const applyPane = (el) => {
            if (!el) return;
            el.style.flex = '0 0 auto';
            el.style.height = `${target}px`;
            el.style.maxHeight = `${target}px`;
            el.style.minHeight = '360px';
            el.style.overflowY = 'auto';
          };

          applyPane(main);
          applyPane(charEl);
          applyPane(rightEl);
          return;
        }

        if (!isMobile) {
          // 桌面视图（全屏时）还原，交由全屏样式处理
          const charEl = document.querySelector('.character-panel');
          const rightEl = document.querySelector('.interaction-panel');

          const resetPane = (el) => {
            if (!el) return;
            el.style.height = '';
            el.style.maxHeight = '';
            el.style.minHeight = '';
            el.style.flex = '';
            el.style.overflowY = '';
          };

          resetPane(main);
          resetPane(charEl);
          resetPane(rightEl);
          return;
        }

        // 计算可用高度：优先使用可视视口高度（处理移动端地址栏/软键盘影响）
        const vvH = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : 0;
        const docH = document.documentElement?.clientHeight || 0;
        const baseH = Math.max(vvH, window.innerHeight || 0, docH);
        // 避免“自举式拉伸”：不要把 root/viewport 自身高度纳入可用高度计算，防止反复放大导致无限延长
        const containerH = baseH;

        const topEl = document.querySelector('.top-status');
        const bottomEl = document.getElementById('bottom-status-container');
        const topH = topEl ? topEl.getBoundingClientRect().height : 0;
        const bottomH = bottomEl ? bottomEl.getBoundingClientRect().height : 0;
        const reserves = 12; // 上下预留像素

        // 使用“可用高度”作为正文固定高度（尽可能大），并给出合理下限
        let available = containerH - topH - bottomH - reserves;
        if (!isFinite(available) || available <= 0) {
          available = Math.floor((baseH || 800) * 0.75);
        }
        // 防抖上限：不超过 baseH - reserves，避免多次 _reflow 导致“越算越大”
        available = Math.min(available, Math.max(200, baseH - reserves));
        const target = Math.max(360, Math.round(available));

        // 固定高度并强制滚动，避免正文撑开
        main.style.flex = '0 0 auto';
        main.style.height = `${target}px`;
        main.style.maxHeight = `${target}px`;
        main.style.minHeight = '360px';
        main.style.overflowY = 'auto';
      } catch (e) {
        console.warn('[归墟] _reflowMobileLayout 失败:', e);
      }
    },

    // 临时开启“快速重排模式”：为根容器添加 fast-reflow 类，短时间内禁用过渡/动画以迅速稳定布局
    _pulseFastReflow(duration = 200) {
      try {
        const root = document.querySelector('.guixu-root-container');
        if (!root) return;
        root.classList.add('fast-reflow');
        clearTimeout(this._frTimer);
        this._frTimer = setTimeout(() => root.classList.remove('fast-reflow'), Math.max(50, duration|0));
      } catch (_) {}
    },
 
    async updateDynamicData() {
      const $ = (sel, ctx = document) => ctx.querySelector(sel);
      if (this._firstRoundBlockActive) {
        console.info('[归墟] 首轮门禁激活：跳过动态数据抓取/渲染');
        return;
      }
      try {
        const currentId = window.GuixuAPI.getCurrentMessageId();
        let messages = await window.GuixuAPI.getChatMessages(currentId);
        let rawState = messages?.[0]?.data || null;


        if (rawState) {
          const normalizedState = rawState;
          // 渲染用：深度过滤掉占位符，避免任何界面看到占位符
          const toRender = this._deepStripMeta(normalizedState.stat_data);

          window.GuixuState.update('currentMvuState', normalizedState);
          // 便捷调试/外部页面自检：暴露当前MVU与其 stat_data（参考 guimi.html 的做法）
          try {
            window.currentMvuState = normalizedState;
            window.currentStatData = toRender;
          } catch (_) {}
          this.renderUI(toRender);

          // 同步填充右下角提取区文本
          await this.loadAndDisplayCurrentScene();
        } else {
          console.warn('[归墟] 当前聊天中未找到 mvu data。');
        }

        // 同步 UI 复选框状态
        const state = window.GuixuState.getState();
        const autoWriteCheckbox = $('#auto-write-checkbox');
        if (autoWriteCheckbox) autoWriteCheckbox.checked = !!state.isAutoWriteEnabled;
        const novelModeCheckbox = $('#novel-mode-enabled-checkbox');
        if (novelModeCheckbox) novelModeCheckbox.checked = !!state.isNovelModeEnabled;
        const autoToggleCheckbox = $('#auto-toggle-lorebook-checkbox');
        if (autoToggleCheckbox) autoToggleCheckbox.checked = !!state.isAutoToggleLorebookEnabled;
        const autoSaveCheckbox = $('#auto-save-checkbox');
        if (autoSaveCheckbox) autoSaveCheckbox.checked = !!state.isAutoSaveEnabled;
        // 同步“世界书读写序号”输入框
        const unifiedIndexInput = $('#unified-index-input');
        if (unifiedIndexInput) unifiedIndexInput.value = String(state.unifiedIndex || 1);
      } catch (error) {
        console.error('[归墟] 更新动态数据时出错:', error);
      }
    },

    renderUI(data) {
      // 全域“渲染前过滤”：无论从哪里调用 renderUI，都先深度移除占位符，避免出现在界面
      data = this._deepStripMeta(data);
      const $ = (sel, ctx = document) => ctx.querySelector(sel);
      if (!data) return;

      const updateText = (id, value, style = '') => {
        const el = document.getElementById(id);
        if (el) {
          el.innerText = value ?? '';
          if (style) el.setAttribute('style', style);
        }
      };

      // 顶部状态
      const jingjieValue = window.GuixuHelpers.SafeGetValue(data, '当前境界', '...');
      const match = jingjieValue.match(/^(\S{2})/);
      const jingjieTier = match ? match[1] : '';
      const jingjieStyle = window.GuixuHelpers.getTierStyle(jingjieTier);
      updateText('val-jingjie', jingjieValue, jingjieStyle);

      updateText('val-jinian', window.GuixuHelpers.SafeGetValue(data, '当前时间纪年', '...'));

      const charge = window.GuixuHelpers.SafeGetValue(data, '归墟充能时间', '0');
      updateText('val-guixu-charge-text', `${charge}%`);
      const chargeFill = $('#bar-guixu-charge .guixu-fill');
      if (chargeFill) chargeFill.style.width = `${charge}%`;

      // 左侧面板（属性/天赋/灵根/装备）
      if (window.GuixuAttributeService?.updateDisplay) {
        window.GuixuAttributeService.updateDisplay();
      }


      // 渲染天赋与灵根
      this.renderTalentsAndLinggen(data);
      this.loadEquipmentFromMVU(data);

      // 状态效果
      const statusWrapper = document.getElementById('status-effects-wrapper');
      if (statusWrapper) {
        const statuses = (window.GuixuHelpers && typeof window.GuixuHelpers.readList === 'function')
          ? window.GuixuHelpers.readList(data, '当前状态')
          : [];
        if (Array.isArray(statuses) && statuses.length > 0) {
          statusWrapper.innerHTML = statuses
            .map(s => {
              let name = '未知状态';
              let type = 'NEUTRAL';
              let title = '';
              if (typeof s === 'string') {
                name = s;
              } else if (typeof s === 'object' && s !== null) {
                name = window.GuixuHelpers.SafeGetValue(s, 'name', '未知状态');
                type = String(window.GuixuHelpers.SafeGetValue(s, 'type', 'NEUTRAL') || 'NEUTRAL').toUpperCase();
                const known = new Set(['BUFF', 'DEBUFF', 'NEUTRAL', 'AURA', 'TERRAIN']);
                if (!known.has(type)) type = 'NEUTRAL';
                const desc = window.GuixuHelpers.SafeGetValue(s, 'description', '');
                const dur = window.GuixuHelpers.SafeGetValue(s, 'duration', '');
                const durText = (dur || dur === 0) ? ` 持续: ${dur}h` : '';
                title = `${name}${durText}${desc ? ' - ' + desc : ''}`;
              }
              const cls = `status-effect status-effect--${type}`;
              const escAttr = (s) => String(s)
                .replace(/&/g, '&')
                .replace(/"/g, '"')
                .replace(/</g, '<')
                .replace(/>/g, '>');
              const safeTitle = escAttr(title);
              return `<div class="${cls}"${title ? ` title="${safeTitle}"` : ''}><div class="effect-icon"></div><span>${name}</span></div>`;
            })
            .join('');
        } else {
          statusWrapper.innerHTML =
            '<div class="status-effect"><div class="effect-icon"></div><span>当前无状态效果</span></div>';
        }

        // 新增：同步底部“状态一览”按钮文案，显示当前状态数量
        try {
          const count = Array.isArray(statuses) ? statuses.filter(Boolean).length : 0;
          const popBtn = document.getElementById('btn-status-pop');
          if (popBtn) {
            const labelSpan = popBtn.querySelector('span');
            if (labelSpan) {
              // 中文文案：根据实时状态数量显示
              // 若为 0，则显示“当前无状态效果”，否则显示数量
              labelSpan.textContent = count > 0 ? `当前有${count}个状态效果` : '当前无状态效果';
            }
          }
        } catch (_) {}
      }
    },

    loadEquipmentFromMVU(data) {
      const $ = (sel, ctx = document) => ctx.querySelector(sel);

      // 将同一槽位的候选MVU键合并到一起，防止后续遍历用“空键”覆盖了已渲染的有效物品
      const candidatesBySlot = {
        wuqi: ['武器'],
        zhuxiuGongfa: ['主修功法'],
        fuxiuXinfa: ['辅修心法'],
        fangju: ['防具'],
        shipin: ['饰品'],
        fabao1: ['法宝'],
      };

      const defaultTextMap = {
        wuqi: '武器',
        fangju: '防具',
        shipin: '饰品',
        fabao1: '法宝',
        zhuxiuGongfa: '主修功法',
        fuxiuXinfa: '辅修心法',
      };

      // 新增：即时覆盖本地 equippedItems，避免等待 MVU 写回造成的渲染延迟
      const st = window.GuixuState?.getState?.();
      const localEq = (st && st.equippedItems) ? st.equippedItems : {};

      for (const [slotKey, mvuKeys] of Object.entries(candidatesBySlot)) {
        const slot = $(`#equip-${slotKey}`);
        if (!slot) continue;

        // 优先使用本地状态（equippedItems），否则从 MVU 读取
        let item = localEq && localEq[slotKey] ? localEq[slotKey] : null;
        if (!item && window.GuixuHelpers && typeof window.GuixuHelpers.readEquipped === 'function') {
          for (const mvuKey of mvuKeys) {
            const found = window.GuixuHelpers.readEquipped(data, mvuKey);
            if (found && typeof found === 'object') { item = found; break; }
          }
        }

        if (item) {
          const tier = window.GuixuHelpers.SafeGetValue(item, 'tier', '凡品');
          const tierStyle = window.GuixuHelpers.getTierStyle(tier);
          slot.textContent = window.GuixuHelpers.SafeGetValue(item, 'name');
          slot.setAttribute('style', tierStyle);
          slot.classList.add('equipped');
          slot.dataset.itemDetails = JSON.stringify(item).replace(/'/g, "'");
        } else {
          slot.textContent = defaultTextMap[slotKey];
          slot.classList.remove('equipped');
          slot.removeAttribute('style');
          delete slot.dataset.itemDetails;
        }
      }
    },

    renderTalentsAndLinggen(data) {
      const container = document.getElementById('talent-linggen-list');
      if (!container) return;
      let html = '';

      // 灵根列表
      try {
        const linggenList = (window.GuixuHelpers && typeof window.GuixuHelpers.readList === 'function')
          ? window.GuixuHelpers.readList(data, '灵根列表')
          : [];
        if (Array.isArray(linggenList) && linggenList.length > 0) {
          const parsed = [];
          const source = Array.isArray(linggenList) ? linggenList : [];

          // 简易 YAML/文本解析器：将松散格式解析为对象，尽可能捕捉 attributes_bonus / 百分比加成 / special_effects
          const parseLooseLinggen = (text) => {
            try {
              if (typeof text !== 'string') return null;
              // 去掉列表前缀与制表缩进
              const lines = text
                .split('\n')
                .map(l => l.replace(/^\s*-\s*-\s*/, '').replace(/^\s*-\s*/, '').replace(/^\t+/, '').trim())
                .filter(l => l.length > 0);

              const obj = {};
              let mode = null; // 'effects' | 'flat' | 'percent'
              obj['attributes_bonus'] = {};
              obj['百分比加成'] = {};
              obj['special_effects'] = [];

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // 匹配 "key: value"
                const kv = line.match(/^([^:：]+)\s*[:：]\s*(.*)$/);
                if (kv) {
                  const key = kv[1].trim();
                  const val = kv[2].trim();

                  // 进入分节模式
                  if (key === 'attributes_bonus' || key === '属性加成') {
                    mode = 'flat';
                    continue;
                  }
                  if (key === '百分比加成' || key === 'percent_bonus') {
                    mode = 'percent';
                    continue;
                  }
                  if (key === 'special_effects' || key === '特殊词条') {
                    mode = 'effects';
                    continue;
                  }

                  // 普通键值
                  mode = null;
                  if (key === '名称' || key.toLowerCase() === 'name' || key === '灵根名称' || key === 'title') {
                    obj['名称'] = val;
                  } else if (key === '品阶' || key.toLowerCase() === 'tier' || key === '等级' || key.toLowerCase() === 'rank') {
                    obj['品阶'] = val;
                  } else if (key === '描述' || key.toLowerCase() === 'description' || key === '说明') {
                    obj['描述'] = val;
                  } else if (key === 'id' || key.toLowerCase() === 'uid') {
                    obj['id'] = val;
                  } else {
                    // 其他未知键，直接挂到对象根部
                    obj[key] = val;
                  }
                  continue;
                }

                // 分节模式下的条目
                if (mode === 'effects') {
                  // 以 "- " 开头的当作词条
                  const em = line.replace(/^\-\s*/, '').trim();
                  if (em) obj['special_effects'].push(em);
                  continue;
                }
                if (mode === 'flat' || mode === 'percent') {
                  // 形如 "神海: 4" 或 "神海: 10%"
                  const kv2 = line.match(/^([^:：]+)\s*[:：]\s*(.*)$/);
                  if (kv2) {
                    const k2 = kv2[1].trim();
                    const v2raw = kv2[2].trim();
                    if (mode === 'flat') {
                      const n = parseInt(v2raw, 10);
                      obj['attributes_bonus'][k2] = Number.isFinite(n) ? n : v2raw;
                    } else {
                      obj['百分比加成'][k2] = v2raw;
                    }
                  }
                  continue;
                }
              }

              // 清理空容器
              if (Object.keys(obj['attributes_bonus']).length === 0) delete obj['attributes_bonus'];
              if (Object.keys(obj['百分比加成']).length === 0) delete obj['百分比加成'];
              if (Array.isArray(obj['special_effects']) && obj['special_effects'].length === 0) delete obj['special_effects'];

              // 保底名称
              if (!obj['名称']) obj['名称'] = '未知灵根';
              if (!obj['品阶']) obj['品阶'] = '凡品';
              if (!obj['描述']) obj['描述'] = '';

              return obj;
            } catch (_) {
              return null;
            }
          };

          source.forEach(raw => {
            if (!raw) return;
            try {
              // 优先 JSON
              const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
              if (obj && typeof obj === 'object') {
                parsed.push(obj);
              } else if (typeof raw === 'string') {
                const loose = parseLooseLinggen(raw);
                parsed.push(loose || { '名称': raw, '品阶': '凡品', '描述': '' });
              }
            } catch (e) {
              // 尝试松散解析
              const loose = (typeof raw === 'string') ? parseLooseLinggen(raw) : null;
              if (loose) {
                parsed.push(loose);
              } else if (typeof raw === 'string') {
                parsed.push({ '名称': raw, '品阶': '凡品', '描述': '' });
              } else {
                console.warn('[归墟] 解析灵根失败:', raw, e);
              }
            }
          });
          const sorted = window.GuixuHelpers.sortByTier(parsed, it => {
            const cnTier = window.GuixuHelpers.SafeGetValue(it, '品阶', '');
            return cnTier || window.GuixuHelpers.SafeGetValue(it, 'tier', '凡品');
          });
          sorted.forEach(item => {
            const unwrap = (v) => (Array.isArray(v) ? (v.length ? v[0] : '') : v);
            const gv = (obj, path, def = '') => {
              try { const val = window.GuixuHelpers.SafeGetValue(obj, path, def); return unwrap(val); } catch (_) { return def; }
            };
            const pick = (obj, candidates, def = '') => {
              for (const p of candidates) {
                const val = gv(obj, p, '');
                if (val !== '' && val !== 'N/A') return val;
              }
              return def;
            };
            const normalized = (Array.isArray(item) && item.length) ? item[0] : item;
            const name = pick(normalized, ['名称', 'name', '灵根名称', 'title', 'data.名称', 'data.name'], '未知灵根');
            const tier = pick(normalized, ['品阶', 'tier', '等级', 'rank', 'data.品阶', 'data.tier'], '凡品');
            const desc = pick(normalized, ['描述', 'description', '说明', 'data.描述', 'data.description'], '无描述');
            const color = window.GuixuHelpers.getTierColorStyle(tier);
            const details = window.GuixuRenderers?.renderItemDetailsForInventory
              ? window.GuixuRenderers.renderItemDetailsForInventory(normalized)
              : '';
            html += `
              <details class="details-container">
                <summary>
                  <span class="attribute-name">灵根</span>
                  <span class="attribute-value" style="${color}">【${tier}】 ${name}</span>
                </summary>
                <div class="details-content">
                  <p>${desc}</p>
                  ${details ? `<div class="item-details">${details}</div>` : ''}
                </div>
              </details>
            `;
          });
        } else {
          html += `
            <div class="attribute-item">
              <span class="attribute-name">灵根</span>
              <span class="attribute-value">未觉醒</span>
            </div>
          `;
        }
      } catch (e) {
        console.warn('[归墟] 渲染灵根失败:', e);
      }

      // 天赋列表（仅读取本项目的“天赋列表”，不引入其它项目字段）
      try {
        const readList = (k) => (window.GuixuHelpers && typeof window.GuixuHelpers.readList === 'function')
          ? window.GuixuHelpers.readList(data, k)
          : [];
        const talents = readList('天赋列表');
        const talentLabel = '天赋';
        if (Array.isArray(talents) && talents.length > 0) {
          const parsed = [];
          const source = talents;
          const gv = (obj, candidates, def = '') => {
            for (const p of candidates) {
              const v = window.GuixuHelpers.SafeGetValue(obj, p, 'N/A');
              if (v !== 'N/A' && v !== '' && v != null) return v;
            }
            return def;
          };
          source.forEach(raw => {
            try {
              let obj = raw;
              if (typeof raw === 'string') {
                try { obj = JSON.parse(raw); } catch { obj = { name: raw }; }
              }
              if (obj && typeof obj === 'object') {
                // 统一映射到 name/tier/description
                const name = gv(obj, ['name', '名称', 'title', 'data.名称', 'data.name'], '未知天赋');
                const tier = gv(obj, ['tier', '等阶', '等级', 'rank', 'data.品阶', 'data.tier'], '凡品');
                const desc = gv(obj, ['description', '描述', '说明', 'data.描述', 'data.description'], '无描述');
                parsed.push({ ...obj, name, tier, description: desc });
              }
            } catch (e) {
              if (typeof raw === 'string') {
                parsed.push({ name: raw, tier: '凡品', description: '' });
              }
            }
          });
          const sorted = window.GuixuHelpers.sortByTier(parsed, it => window.GuixuHelpers.SafeGetValue(it, 'tier', '凡品'));
          sorted.forEach(item => {
            const name = window.GuixuHelpers.SafeGetValue(item, 'name', '未知天赋');
            const tier = window.GuixuHelpers.SafeGetValue(item, 'tier', '凡品');
            const desc = window.GuixuHelpers.SafeGetValue(item, 'description', '无描述');
            const color = window.GuixuHelpers.getTierColorStyle(tier);
            const details = window.GuixuRenderers?.renderItemDetailsForInventory
              ? window.GuixuRenderers.renderItemDetailsForInventory(item)
              : '';
            html += `
              <details class="details-container">
                <summary>
                  <span class="attribute-name">${talentLabel}</span>
                  <span class="attribute-value" style="${color}">【${tier}】 ${name}</span>
                </summary>
                <div class="details-content">
                  <p>${desc}</p>
                  ${details ? `<div class="item-details">${details}</div>` : ''}
                </div>
              </details>
            `;
          });
        } else {
          html += `
            <div class="attribute-item">
              <span class="attribute-name">天赋</span>
              <span class="attribute-value">未觉醒</span>
            </div>
          `;
        }
      } catch (e) {
        console.warn('[归墟] 渲染天赋/特性失败:', e);
      }

      container.innerHTML = html;
    },

    async handleAction(userMessage = '') {
      this.showWaitingMessage();
      try {
        const { newMvuState, aiResponse } = await window.GuixuActionService.handleAction(userMessage);
        // 更新 UI
        this.renderUI(newMvuState.stat_data);
        await this.loadAndDisplayCurrentScene(aiResponse);
        // 清理输入与待处理指令（仅当 AI 返回有效文本时清除草稿）
        const input = document.getElementById('quick-send-input');
        const successText = typeof aiResponse === 'string' ? aiResponse.trim() : '';
        if (successText) {
          if (input) input.value = '';
          this.clearInputDraft();
        }
        window.GuixuState.update('pendingActions', []);
        window.GuixuHelpers.showTemporaryMessage('伟大梦星已回应。');
      } catch (error) {
        console.error('[归墟] 处理动作时出错:', error);
        window.GuixuHelpers.showTemporaryMessage(`和伟大梦星沟通失败: ${error.message}`);
        // 失败时恢复输入框内容
        try {
          const input = document.getElementById('quick-send-input');
          if (input && userMessage) {
            input.value = userMessage;
          }
        } catch (_) {}
      } finally {
        this.hideWaitingMessage();
        // 再次同步最新数据（兜底）
        await this.updateDynamicData();
      }
    },

    async loadAndDisplayCurrentScene(messageContent = null) {
      const $ = (sel, ctx = document) => ctx.querySelector(sel);
      const gameTextDisplay = document.getElementById('game-text-display');
      if (!gameTextDisplay) return;

      try {
        let contentToParse = messageContent;

        if (contentToParse === null) {
          const messages = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
          if (!messages || messages.length === 0) return;
          const lastAiMessage = [...messages].reverse().find(m => m.role === 'assistant');
          if (lastAiMessage) contentToParse = lastAiMessage.message;
        }

        if (contentToParse) {
          // 新增：检测主要标签的缺失或未闭合并提示（移动端/桌面端、全屏/非全屏通用）
          try {
            const requiredTags = ['thinking', 'gametxt', 'action', '本世历程', 'UpdateVariable', 'Analysis'];
            const res = window.GuixuHelpers?.validateTagClosures?.(contentToParse, requiredTags) || null;
            if (res && (Array.isArray(res.missing) && res.missing.length || Array.isArray(res.unclosed) && res.unclosed.length)) {
              const parts = [];
              if (Array.isArray(res.missing) && res.missing.length) parts.push(`未生成: ${res.missing.join(', ')}`);
              if (Array.isArray(res.unclosed) && res.unclosed.length) parts.push(`未闭合: ${res.unclosed.join(', ')}`);
              const msg = `检测到标签问题：${parts.join('；')}。请打开编辑功能（小铅笔）补齐这些标签，避免产生 bug。`;
              // 改用无转圈的“通知”样式顶部浮窗，并在 6 秒后自动隐藏
              try {
                this.showWaitingMessage(msg, { variant: 'warning' });
                setTimeout(() => { try { this.hideWaitingMessage(); } catch (_) {} }, 6000);
              } catch (_) {}
            }
          } catch (_) {}
          const { strippedText: contentWithoutGuidelines, items: guidelineItems } = this._parseActionGuidelines(contentToParse);
          const displayText = this._getDisplayText(contentWithoutGuidelines);
          const thinkingText = this._extractLastTagContent('thinking', contentToParse, true);
          const escapeHtml = (s) => String(s || '')
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '&#39;');
          let thinkingHtml = '';
          if (thinkingText) {
            thinkingHtml = `
              <div id="guixu-thinking-panel">
                <button id="guixu-thinking-toggle" class="interaction-btn thinking-chip-btn" aria-expanded="false" title="查看/隐藏思维链">
                  💡<span class="thinking-chip-text">思维链</span>
                </button>
              </div>
              <div id="guixu-thinking-content" class="thinking-box"><pre>${escapeHtml(thinkingText)}</pre></div>
            `;
          }
          gameTextDisplay.innerHTML = thinkingHtml + `<div class="story-paragraph">${this.formatMessageContent(displayText)}</div>`;

          // 新增：在渲染正文后显示 “行动方针” 按钮，并确保正文不再显示对应文本块
          try {
            const items = Array.isArray(guidelineItems) ? guidelineItems : [];
            try { window.GuixuState.update('lastActionGuidelines', items); } catch (_) {}
            if (items.length) {
              const container = document.createElement('div');
              container.id = 'guixu-action-guidelines';
              container.setAttribute('role', 'group');
              // 一项一行：纵向列表布局（桌面/移动端统一）
              container.style.cssText = 'margin-top:8px;border-top:1px solid rgba(201,170,113,0.3);padding-top:6px;display:flex;flex-direction:column;gap:8px;';

              const label = document.createElement('span');
              label.textContent = '行动选项';
              label.className = 'guideline-label';
              container.appendChild(label);

              items.forEach((it) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'interaction-btn action-guideline-btn';
                // 不截断，允许多行换行展示完整文本
                btn.textContent = it;
                btn.title = `执行：${it}`;
                btn.addEventListener('click', () => this.handleAction(it));
                container.appendChild(btn);
              });

              gameTextDisplay.appendChild(container);
            }
          } catch (e) {
            console.warn('[归墟] 渲染行动方针失败:', e);
          }

          // 绑定折叠事件
          try {
            const btn = document.getElementById('guixu-thinking-toggle');
            const box = document.getElementById('guixu-thinking-content');
            if (btn && box) {
              btn.addEventListener('click', () => {
                const show = getComputedStyle(box).display === 'none';
                box.style.display = show ? 'block' : 'none';
                btn.setAttribute('aria-expanded', String(show));
              });
              // 默认折叠
              box.style.display = 'none';
            }
          } catch (_) {}

          // 同步提取内容到 State（忽略思维链内容；兼容繁体标签）
          const __parseBase = String(contentToParse || '')
            .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '')
            .replace(/<\s*action[^>]*>[\s\S]*?<\/\s*action\s*>/gi, '');
          const __capturedGametxt = this._extractLastTagContent('gametxt', __parseBase);
          window.GuixuState.update('lastExtractedNovelText', __capturedGametxt);
          window.GuixuState.update('lastExtractedJourney',
            (window.GuixuHelpers?.extractLastTagContentByAliases?.('本世历程', __parseBase, true)
              ?? this._extractLastTagContent('本世历程', __parseBase))
          );
          window.GuixuState.update('lastExtractedPastLives',
            (window.GuixuHelpers?.extractLastTagContentByAliases?.('往世涟漪', __parseBase, true)
              ?? this._extractLastTagContent('往世涟漪', __parseBase))
          );
          window.GuixuState.update('lastExtractedVariables', this._extractLastTagContent('UpdateVariable', __parseBase, true));
          window.GuixuState.update('lastExtractedThinking', thinkingText || '');
          // 新增：若本次成功捕捉到 <gametxt>，为当前序号打上“已捕捉”标记（用于门禁判定）
          try {
            const idxSeen = window.GuixuState?.getState?.().unifiedIndex || 1;
            if (__capturedGametxt && String(__capturedGametxt).trim() !== '') {
              localStorage.setItem(`guixu_gate_gametxt_seen_${idxSeen}`, '1');
            }
          } catch (_) {}

          // 渲染后将滚动条置顶（移动端与桌面端）
          try {
            const mainEl = document.querySelector('.main-content');
            if (mainEl) {
              mainEl.scrollTop = 0;
              mainEl.scrollTo?.({ top: 0, behavior: 'auto' });
            }
            gameTextDisplay.scrollTop = 0;
          } catch (_) {}

          // 根据设置决定是否自动开关角色条目
          try {
            const enabled = !!(window.GuixuState?.getState?.().isAutoToggleLorebookEnabled);
            if (enabled) await this._autoToggleCharacterEntries(displayText);
          } catch (e) { console.warn('[归墟] 自动切换角色条目失败:', e); }
          // 新增：对话生成后触发关系面板的自动提取（无需打开面板）
          try { await window.RelationshipsComponent?._autoExtractFromStateIfNeeded?.(); } catch (e) { console.warn('[归墟] 自动提取触发失败:', e); }
        }
      } catch (error) {
        console.error('[归墟] 加载并显示当前场景时出错:', error);
        gameTextDisplay.innerHTML = '<gametxt>加载场景时出错。</gametxt>';
      }
    },

    formatMessageContent(text) {
      if (!text) return '';
      // 移除每一行行首的空格/制表符/中文全角空格，避免在 pre-wrap 下出现“首行缩进”
      // 说明：模型常在段首插入空格或全角空格(U+3000)，这些会被 white-space: pre-wrap 原样显示为缩进
      let s = String(text).replace(/\r/g, '');
      s = s.replace(/^[ \t\u3000]+/gm, ''); // 移除各行行首空白
      s = s.replace(/^\s+/, '');            // 再移除整体开头多余空白

      // 将转义的 \n 转为 <br />（实际换行由容器的 pre-wrap 保持）
      s = s.replace(/\\n/g, '<br />');

      // 文本着色（引号/心理/景语）
      s = s.replace(/(“[^”]+”|「[^」]+」)/g, match => `<span class="text-language">${match}</span>`);
      s = s.replace(/\*([^*]+)\*/g, (m, p1) => `<span class="text-psychology">${p1}</span>`);
      s = s.replace(/【([^】\d]+[^】]*)】/g, (m, p1) => `<span class="text-scenery">${p1}</span>`);

      return s;
    },

    showWaitingMessage(text = null, opts = {}) {
      try {
        const { variant = 'loading' } = (opts || {});
        const messages = window.GuixuConstants?.WAITING_MESSAGES || [];
        const msg = (text != null && String(text).trim() !== '')
          ? String(text)
          : (messages.length > 0 ? messages[Math.floor(Math.random() * messages.length)] : '正在请求伟大梦星...');
        let div = document.getElementById('waiting-popup');
        if (div) {
          // 更新文案与样式
          const span = div.querySelector('span');
          if (span) span.textContent = msg;
          const spinner = div.querySelector('.waiting-spinner');
          const icon = div.querySelector('.waiting-icon');
          if (spinner) spinner.style.display = (variant === 'loading') ? 'inline-block' : 'none';
          if (icon) {
            icon.style.display = (variant === 'loading') ? 'none' : 'inline-flex';
            icon.textContent = (variant === 'warning') ? '⚠' : 'ℹ';
          }
          div.style.display = 'flex';
          return;
        }
        // 新建浮窗
        div = document.createElement('div');
        div.id = 'waiting-popup';
        div.className = 'waiting-popup';
        div.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10120; /* 提升等待/通知浮窗层级，高于所有面板与确认弹窗 */
          background: rgba(26, 26, 46, 0.95);
          color: #c9aa71;
          border: 1px solid #c9aa71;
          border-radius: 8px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 0 20px rgba(201, 170, 113, 0.3);
          font-size: 13px;
          font-weight: 600;
        `;
        // 加载转圈
        const spinner = document.createElement('div');
        spinner.className = 'waiting-spinner';
        spinner.style.cssText = `
          width: 14px;
          height: 14px;
          border: 2px solid #c9aa71;
          border-right-color: transparent;
          border-radius: 50%;
          margin-right: 4px;
          display: ${variant === 'loading' ? 'inline-block' : 'none'};
        `;
        // 通知/警告图标（非加载态显示）
        const icon = document.createElement('span');
        icon.className = 'waiting-icon';
        icon.textContent = (variant === 'warning') ? '⚠' : 'ℹ';
        icon.style.cssText = `
          width: 14px;
          height: 14px;
          display: ${variant === 'loading' ? 'none' : 'inline-flex'};
          align-items: center;
          justify-content: center;
          margin-right: 4px;
        `;
        const span = document.createElement('span');
        span.textContent = msg;
        // 组装
        div.appendChild(spinner);
        div.appendChild(icon);
        div.appendChild(span);
        const container = document.querySelector('.guixu-root-container') || document.body;
        container.appendChild(div);
      } catch (e) {
        console.warn('[归墟] showWaitingMessage 失败:', e);
      }
    },

    hideWaitingMessage() {
      try {
        const existing = document.getElementById('waiting-popup');
        if (existing) existing.remove();
      } catch (_) {}
    },

    async _autoToggleCharacterEntries(displayText) {
      try {
        // 守卫：若关闭“自动开关角色条目”，则不进行任何切换
        const enabled = !!(window.GuixuState?.getState?.().isAutoToggleLorebookEnabled);
        if (!enabled) return;
        const text = String(displayText || '');
        const bookName = window.GuixuConstants?.LOREBOOK?.NAME;
        if (!bookName) return;

        const index = window.GuixuState?.getState?.().unifiedIndex || 1;
        const allEntries = await window.GuixuAPI.getLorebookEntries(bookName);
        // 兼容“【角色】”与旧前缀“角色:”；若带(索引)则仅管理与当前 unifiedIndex 匹配
        const ROLE_PREFIX_NEW = '【角色】';
        const ROLE_PREFIX_OLD = '角色:';
        const charEntries = (allEntries || []).filter(e => {
          const c = String(e.comment || '');
          return typeof e.comment === 'string' && (c.startsWith(ROLE_PREFIX_NEW) || c.startsWith(ROLE_PREFIX_OLD));
        });
        if (!charEntries.length) return;

        const nameFromComment = (comment) => {
          try {
            let s = String(comment || '');
            if (s.startsWith(ROLE_PREFIX_NEW)) s = s.slice(ROLE_PREFIX_NEW.length);
            else if (s.startsWith(ROLE_PREFIX_OLD)) s = s.slice(ROLE_PREFIX_OLD.length);
            const m = s.match(/\((\d+)\)$/);
            if (m) s = s.slice(0, s.lastIndexOf('('));
            return s;
          } catch (_) { return ''; }
        };
        const indexMatches = (comment) => {
          const m = String(comment || '').match(/\((\d+)\)$/);
          if (!m) return true; // 无索引则所有序列共用，直接纳入管理
          return parseInt(m[1], 10) === index;
        };

        const updates = [];
        charEntries.forEach(entry => {
          if (!indexMatches(entry.comment)) return;
          const name = nameFromComment(entry.comment);
          if (!name) return;
          const shouldEnable = text.includes(name);
          if (!!entry.enabled !== !!shouldEnable) {
            updates.push({ uid: entry.uid, enabled: shouldEnable });
          }
        });

        if (updates.length) {
          await window.GuixuAPI.setLorebookEntries(bookName, updates);
        }
      } catch (e) {
        console.warn('[归墟] _autoToggleCharacterEntries 出错:', e);
      }
    },

    // 从 TavernHelper 全局变量同步用户偏好（跨设备漫游），若存在则覆盖本地
    async syncUserPreferencesFromRoaming() {
      try {
        if (!window.TavernHelper || typeof window.TavernHelper.getVariables !== 'function') return;
        const vars = window.TavernHelper.getVariables({ type: 'global' });
        const roamingPrefs = vars && vars.Guixu && vars.Guixu.userPreferences;
        if (roamingPrefs && typeof roamingPrefs === 'object') {
          const state = window.GuixuState?.getState?.();
          const merged = Object.assign({}, state?.userPreferences || {}, roamingPrefs);
          window.GuixuState.update('userPreferences', merged);
        }
      } catch (e) {
        console.warn('[归墟] 同步用户偏好(全局变量)失败:', e);
      }
    },

    // 应用用户主题偏好（背景、遮罩、字号）
    applyUserPreferences(prefsOverride = null) {
      try {
        const container = document.querySelector('.guixu-root-container');
        if (!container) return;
        const state = window.GuixuState?.getState?.();
        // 新增 hiddenFunctionButtons 默认值
        const defaults = { backgroundUrl: '', bgMaskOpacity: 0.7, storyFontSize: 14, storyFontColor: '#e0dcd1', storyDefaultColor: '#e0dcd1', storyQuoteColor: '#ff4d4f', thinkingTextColor: '#e0dcd1', thinkingBgOpacity: 0.85, guidelineTextColor: '#e0dcd1', guidelineBgOpacity: 0.6, bgFitMode: 'cover', customFontName: '', customFontDataUrl: '', hiddenFunctionButtons: {} };
        const prefs = Object.assign({}, defaults, (prefsOverride || state?.userPreferences || {}));

        // 遮罩透明度（0~0.8）
        const mask = Math.min(0.8, Math.max(0, Number(prefs.bgMaskOpacity ?? defaults.bgMaskOpacity)));
        container.style.setProperty('--guixu-bg-mask', String(mask));

        // 正文字号（12~20px）
        const fontPx = Math.round(Number(prefs.storyFontSize ?? defaults.storyFontSize));
        container.style.setProperty('--guixu-story-font-size', `${fontPx}px`);

        // 背景适配方式（bgFitMode -> CSS 变量）
        const mode = String(prefs.bgFitMode || 'cover');
        let size = 'cover', repeat = 'no-repeat', position = 'center';
        switch (mode) {
          case 'contain':
            size = 'contain'; repeat = 'no-repeat'; position = 'center'; break;
          case 'repeat':
            size = 'auto'; repeat = 'repeat'; position = 'left top'; break;
          case 'stretch':
            size = '100% 100%'; repeat = 'no-repeat'; position = 'center'; break;
          case 'center':
            size = 'auto'; repeat = 'no-repeat'; position = 'center'; break;
          case 'cover':
          default:
            size = 'cover'; repeat = 'no-repeat'; position = 'center'; break;
        }
        container.style.setProperty('--guixu-bg-size', size);
        container.style.setProperty('--guixu-bg-repeat', repeat);
        container.style.setProperty('--guixu-bg-position', position);

        // 背景图
        const bg = (prefs.backgroundUrl || '').trim();
        if (!bg) {
          container.style.backgroundImage = '';
        } else if (bg.startsWith('lorebook://')) {
          // 异步从世界书加载资源
          const entryComment = bg.slice('lorebook://'.length);
          (async () => {
            try {
              const dataUrl = await this._resolveLorebookDataUrl(entryComment);
              if (dataUrl) {
                container.style.backgroundImage = `url("${dataUrl}")`;
              } else {
                container.style.backgroundImage = '';
              }
            } catch (e) {
              console.warn('[归墟] 读取世界书背景失败:', e);
            }
          })();
        } else {
          // 已移除外部 URL/dataURL 背景支持，仅允许 lorebook:// 来源
          container.style.backgroundImage = '';
        }

        // 自定义正文字体颜色（用于全局基础文本）
        const storyColor = String(prefs.storyFontColor || defaults.storyFontColor);
        container.style.setProperty('--guixu-story-color', storyColor);
        // 默认正文颜色（未被特殊着色包裹的文本）
        const storyDefaultColor = String(prefs.storyDefaultColor || prefs.storyFontColor || defaults.storyDefaultColor);
        container.style.setProperty('--guixu-story-default-color', storyDefaultColor);

        const storyQuoteColor = String(prefs.storyQuoteColor || defaults.storyQuoteColor || '#ff4d4f');
        container.style.setProperty('--guixu-story-quote-color', storyQuoteColor);

        const thinkingColor = String(prefs.thinkingTextColor || defaults.thinkingTextColor);
        container.style.setProperty('--guixu-thinking-color', thinkingColor);

        const tbg = Math.min(1, Math.max(0, Number(prefs.thinkingBgOpacity ?? defaults.thinkingBgOpacity)));
        container.style.setProperty('--guixu-thinking-bg-opacity', String(tbg));

        // 行动选项（按钮）颜色与背景透明度
        const guidelineTextColor = String(prefs.guidelineTextColor || defaults.guidelineTextColor);
        container.style.setProperty('--guixu-guideline-text-color', guidelineTextColor);
        const guidelineBgOpacity = Math.min(1, Math.max(0, Number(prefs.guidelineBgOpacity ?? defaults.guidelineBgOpacity)));
        container.style.setProperty('--guixu-guideline-bg-opacity', String(guidelineBgOpacity));

        // 自定义字体（以 dataURL 持久化）
        try {
          const fontDataUrl = String(prefs.customFontDataUrl || '');
          const fontFamilyName = 'GuixuUserFont';
          let fontStyle = document.getElementById('guixu-custom-font-style');
          if (fontDataUrl) {
            if (!fontStyle) {
              fontStyle = document.createElement('style');
              fontStyle.id = 'guixu-custom-font-style';
              document.head.appendChild(fontStyle);
            }
            fontStyle.textContent = `
              @font-face {
                font-family: '${fontFamilyName}';
                src: url('${fontDataUrl}') format('woff2'), url('${fontDataUrl}') format('woff'), url('${fontDataUrl}');
                font-display: swap;
              }
            `;
            container.style.setProperty('--guixu-font-family', `'${fontFamilyName}', "Microsoft YaHei", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif`);
container.style.fontFamily = `'${fontFamilyName}', "Microsoft YaHei", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif`;
          } else {
            if (fontStyle) { try { fontStyle.remove(); } catch(_) {} }
            container.style.setProperty('--guixu-font-family', `"Microsoft YaHei", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif`);
container.style.fontFamily = `"Microsoft YaHei", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif`;
          }
        } catch (_) {}

        // 应用非全屏分辨率与等比缩放
        this._applyViewportSizing(prefs);

        // 新增：根据用户偏好隐藏右侧功能面板按钮，并在移动端保证每行最多两个按钮/单按钮独占一行
        this._applyFunctionButtonsVisibility(prefs.hiddenFunctionButtons || {});
        this._adjustMobileFunctionPanelGrid();
      } catch (e) {
        console.warn('[归墟] 应用用户主题偏好失败:', e);
      }
    },

    // 新增：在“一键刷新”后的首帧，如果用户未选择背景，则自动读取世界书中带前缀的第一条背景并应用
    async _applyDefaultBackgroundIfFlagged() {
      try {
        const idx = window.GuixuState?.getState?.().unifiedIndex || 1;
        const flagKey = `guixu_apply_default_bg_once_${idx}`;
        const flagged = localStorage.getItem(flagKey) === '1';
        if (!flagged) return;
        // 一次性执行
        localStorage.removeItem(flagKey);

        // 若已有背景选择，则不覆盖用户选择
        const st = window.GuixuState?.getState?.();
        const prefsNow = (st && st.userPreferences) ? st.userPreferences : {};
        if (prefsNow && prefsNow.backgroundUrl) return;

        const bookName = window.GuixuConstants?.LOREBOOK?.NAME;
        const newPrefix = String(window.GuixuConstants?.BACKGROUND?.PREFIX || '【背景图片】');
        const legacyPrefixes = Array.isArray(window.GuixuConstants?.BACKGROUND?.LEGACY_PREFIXES) ? window.GuixuConstants.BACKGROUND.LEGACY_PREFIXES : ['归墟背景/'];
        if (!bookName || !window.GuixuAPI) return;

        const allEntries = await window.GuixuAPI.getLorebookEntries(bookName);
        const isBg = (c) => {
          const s = String(c || '');
          if (!s) return false;
          if (s.startsWith(newPrefix)) return true;
          return legacyPrefixes.some(p => s.startsWith(p));
        };
        const list = Array.isArray(allEntries) ? allEntries.filter(e => isBg(e.comment)) : [];
        if (!list.length) return;

        const first = list[0];
        const newPrefs = Object.assign({}, prefsNow || {}, { backgroundUrl: `lorebook://${first.comment}` });
        try { window.GuixuState.update('userPreferences', newPrefs); } catch (_) {}
        this.applyUserPreferences(newPrefs);
        // 尝试持久化到全局（可选）
        try {
          if (window.TavernHelper && typeof window.TavernHelper.insertOrAssignVariables === 'function') {
            await window.TavernHelper.insertOrAssignVariables({ Guixu: { userPreferences: newPrefs } }, { type: 'global' });
          }
        } catch (_) {}
        // 预置设置中心的下拉选中值（若DOM存在）
        try {
          const sel = document.getElementById('pref-bg-select');
          if (sel) sel.value = String(first.comment || '');
        } catch (_) {}
      } catch (e) {
        console.warn('[归墟] 默认背景应用失败:', e);
      }
    },

    async _resolveLorebookDataUrl(entryComment) {
      try {
        const bookName = window.GuixuConstants?.LOREBOOK?.NAME;
        if (!bookName || !entryComment) return '';
        const entries = await window.GuixuAPI.getLorebookEntries(bookName);
        const entry = entries.find(e => (e.comment || '') === entryComment);
        return entry ? (entry.content || '') : '';
      } catch (e) {
        console.warn('[归墟] _resolveLorebookDataUrl 出错:', e);
        return '';
      }
    },

    // 新增：统一自适应视口（移除窗口模式分辨率缩放/固定）
    _applyViewportSizing(prefs) {
      try {
        const viewport = document.getElementById('guixu-viewport');
        const root = document.querySelector('.guixu-root-container');
        if (!viewport || !root) return;

        // 统一自适应：取消任何缩放与固定尺寸，交由 CSS 和父容器决定
        root.style.transformOrigin = 'top left';
        root.style.transform = 'none';
        root.style.left = '0px';
        root.style.top = '0px';

        // 清除通过 CSS 变量/内联设置的目标分辨率
        try {
          viewport.style.removeProperty('--viewport-w');
          viewport.style.removeProperty('--viewport-h');
        } catch (_) {}
        viewport.style.width = '100%';
        viewport.style.height = 'auto';

        // 全屏同样保持自然尺寸（不再做额外缩放）
        if (document.fullscreenElement) {
          return;
        }

        // 移动端/桌面端均不再根据预设/自定义分辨率进行缩放
        return;
      } catch (e) {
        console.warn('[归墟] _applyViewportSizing 出错:', e);
      }
    },

    // 更新：根据设置隐藏右侧功能面板按钮（移动端与桌面端均生效；不隐藏“设置中心”，避免丢失入口）
    // 说明：桌面端 CSS 在 desktop.css 中对 .interaction-btn 使用了 display: inline-flex !important；
    // 为了正确隐藏，需要以 JS 设置内联 !important（setProperty 第三个参数为 'important'）
    _applyFunctionButtonsVisibility(hiddenMap = {}) {
      try {
        const ids = [
          'btn-inventory',
          'btn-relationships',
          'btn-command-center',
          'btn-guixu-system',
          'btn-show-extracted',
          'btn-save-load-manager',
          'btn-intro-guide'
        ];
        ids.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const hide = !!hiddenMap[id];
          if (hide) {
            // 桌面端存在 display: inline-flex !important，需要用内联 !important 覆盖
            el.style.setProperty('display', 'none', 'important'); // 隐藏（含 !important）
            el.setAttribute('aria-hidden', 'true');               // 语义隐藏（可选）
          } else {
            // 显示：移除内联 display，让样式表生效
            el.style.removeProperty('display');
            el.removeAttribute('aria-hidden');
          }
        });
      } catch (_) {}
    },

    // 新增：移动端功能面板最后一个“落单”按钮独占一行，确保“一行一个或最多两个”
    _adjustMobileFunctionPanelGrid() {
      try {
        const root = document.querySelector('.guixu-root-container');
        if (!root || !root.classList.contains('mobile-view')) return;
        const panel = document.querySelector('.interaction-panel');
        if (!panel) return;
        // 仅选取面板直接子级的功能按钮，忽略后续的 .panel-section 区块
        const buttons = Array.from(panel.querySelectorAll(':scope > .interaction-btn'))
          .filter(el => getComputedStyle(el).display !== 'none');
        // 清除先前设置
        buttons.forEach(b => { try { b.style.removeProperty('grid-column'); } catch(_) {} });
        // 若为奇数个，最后一个按钮占满整行
        if (buttons.length % 2 === 1 && buttons.length > 0) {
          const last = buttons[buttons.length - 1];
          last.style.gridColumn = '1 / -1';
        }
      } catch (_) {}
    },

    // 输入草稿：加载/保存/清除
    loadInputDraft() {
      try {
        const draft = localStorage.getItem('guixu_input_draft');
        if (draft) {
          const input = document.getElementById('quick-send-input');
          if (input && !input.value) {
            input.value = draft;
          }
        }
      } catch (e) {
        console.warn('[归墟] 加载输入草稿失败:', e);
      }
    },
    saveInputDraft() {
      try {
        const input = document.getElementById('quick-send-input');
        const val = input ? input.value : '';
        if (val && val.trim() !== '') {
          localStorage.setItem('guixu_input_draft', val);
        } else {
          localStorage.removeItem('guixu_input_draft');
        }
      } catch (e) {
        console.warn('[归墟] 保存输入草稿失败:', e);
      }
    },
    clearInputDraft() {
      try { localStorage.removeItem('guixu_input_draft'); } catch (_) {}
    },

    _extractLastTagContent(tagName, text, ignoreCase = false) {
      return window.GuixuHelpers.extractLastTagContent(tagName, text, ignoreCase);
    },
    _getDisplayText(text) {
      const gt = this._extractLastTagContent('gametxt', text);
      if (gt) return gt;
      try {
        return String(text || '').replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '').trim();
      } catch (_) {
        return text || '';
      }
    },

    // 更新：严格提取 <action> 内容并返回剔除后的原文（不再兼容旧“行动方针”标签）
    _parseActionGuidelines(rawText) {
      try {
        const stripThinking = (s) => String(s || '').replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '');
        const text = stripThinking(rawText);
        // 改为仅捕捉标准 <action> 标签
        const block = window.GuixuHelpers?.extractLastTagContent?.('action', text, true) || '';
        // 移除所有 <action> 块
        const reAll = /<\s*action[^>]*>[\s\S]*?<\/\s*action\s*>/gi;
        const strippedText = block ? text.replace(reAll, '') : text;
        const items = this._normalizeGuidelineItems(block);
        return { strippedText, items };
      } catch (_) {
        return { strippedText: String(rawText || ''), items: [] };
      }
    },

    // 新增：归一化“行动方针”条目，兼容 1./1、/①/一、等编号，并清除内嵌标签
    _normalizeGuidelineItems(txt) {
      try {
        if (!txt) return [];
        let s = String(txt).replace(/\r/g, '').trim();

        // 若没有换行，则在可能的编号前注入换行，便于切分
        const injectBreaks = (input) => input
          .replace(/(?:^|[\n\r]|[\s　])([一二三四五六七八九十百千两兩壹贰叁肆伍陆柒捌玖拾〇零]+)[\.．、\)\）]\s*/g, '\n$1、')
          .replace(/(?:^|[\n\r]|[\s　])(\d+|[①②③④⑤⑥⑦⑧⑨⑩])[\.．、\)\）]\s*/g, '\n$1、');

        s = injectBreaks(s);

        const rawLines = s.split(/\n+/).map(l => l.trim()).filter(Boolean);

        const clean = (l) => l
          .replace(/^\s*(?:\d+|[①②③④⑤⑥⑦⑧⑨⑩]|[一二三四五六七八九十百千两兩壹贰叁肆伍陆柒捌玖拾〇零]+)[\.．、\)\）]?\s*/, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        const items = [];
        const seen = new Set();
        for (const line of rawLines) {
          const t = clean(line);
          if (!t || t.length < 2) continue;
          if (seen.has(t)) continue;
          seen.add(t);
          items.push(t);
        }
        return items;
      } catch (_) {
        return [];
      }
    },

    // Quick Commands
    showQuickCommands() {
      const popup = document.getElementById('quick-command-popup');
      if (!popup) return;
      const state = window.GuixuState.getState();
      const cmds = state?.pendingActions || [];
      if (cmds.length === 0) {
        popup.innerHTML = '<div class="quick-command-empty">暂无待执行的指令</div>';
      } else {
        let listHtml = '<ul class="quick-command-list">';
        cmds.forEach(cmd => {
          let actionText = '';
          switch (cmd.action) {
            case 'equip':
              actionText = `装备 [${cmd.itemName}] 到 [${cmd.category}] 槽位。`;
              break;
            case 'unequip':
              actionText = `卸下 [${cmd.itemName}] 从 [${cmd.category}] 槽位。`;
              break;
            case 'use':
              actionText = `使用 ${cmd.quantity} 个 [${cmd.itemName}]。`;
              break;
            case 'discard':
              actionText = cmd.quantity && cmd.quantity > 1
                ? `丢弃 ${cmd.quantity} 个 [${cmd.itemName}]。`
                : `丢弃 [${cmd.itemName}]。`;
              break;
            case 'trade_buy': {
              const npcName = cmd.npcName || '未知之人';
              const itemName = cmd.itemName || '未知物品';
              const tier = cmd.tier || '练气';
              const qty = Number(cmd.quantity || 1);
              const unit = Number(cmd.unitPrice || 0);
              const price = Number(cmd.totalPrice || 0);
              actionText = `与 [${npcName}] 交易，购买 ${qty} 个 [${itemName}]（品阶：${tier}，单价：${unit} 灵石），总价 ${price} 灵石。`;
              break;
            }
            case 'trade_sell': {
              const npcName = cmd.npcName || '未知之人';
              const itemName = cmd.itemName || '未知物品';
              const tier = cmd.tier || '练气';
              const qty = Number(cmd.quantity || 1);
              const unit = Number(cmd.unitPrice || 0);
              const price = Number(cmd.totalPrice || 0);
              actionText = `与 [${npcName}] 交易，出售 ${qty} 个 [${itemName}]（品阶：${tier}，单价：${unit} 灵石），总价 ${price} 灵石。`;
              break;
            }
            case 'trade_abuse': {
              const npcName = cmd.npcName || '未知之人';
              const attempts = Number(cmd.attempts || 0);
              const deducted = Number(cmd.deductedFavor || 0);
              actionText = `【交易-违规】多次尝试低买/高卖，已触怒 [${npcName}]，好感度 -${deducted}（累计 ${attempts} 次），本轮禁止交易。`;
              break;
            }
            default:
              actionText = '[未知指令]';
          }
          listHtml += `<li class="quick-command-item">${actionText}</li>`;
        });
        listHtml += '</ul>';
        popup.innerHTML = listHtml;
      }
      popup.style.display = 'block';
    },

    hideQuickCommands() {
      const popup = document.getElementById('quick-command-popup');
      if (popup) popup.style.display = 'none';
    },

    // 装备槽 Tooltip（使用 GuixuRenderers）
    showEquipmentTooltip(element, event) {
      const tooltip = document.getElementById('equipment-tooltip');
      const itemDataString = element?.dataset?.itemDetails;
      if (!tooltip || !itemDataString) return;

      try {
        const item = JSON.parse(itemDataString.replace(/'/g, "'"));
        const html = window.GuixuRenderers?.renderTooltipContent
          ? window.GuixuRenderers.renderTooltipContent(item)
          : `<div class="tooltip-title">${window.GuixuHelpers.SafeGetValue(item, 'name')}</div>`;
        tooltip.innerHTML = html;
        tooltip.style.display = 'block';

        // 将 Tooltip 限制在 .guixu-root-container 内部，避免在移动端溢出屏幕
        const root = document.querySelector('.guixu-root-container');
        const containerRect = root
          ? root.getBoundingClientRect()
          : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

        const pt = event.touches ? event.touches[0] : event;

        // 计算相对于容器左上角的位置
        let relLeft = (pt.clientX - containerRect.left) + 15;
        let relTop = (pt.clientY - containerRect.top) + 15;

        // 读取尺寸后进行边界收敛
        const ttRect = tooltip.getBoundingClientRect();
        const ttW = ttRect.width || 260;
        const ttH = ttRect.height || 160;

        const maxLeft = Math.max(8, containerRect.width - ttW - 8);
        const maxTop = Math.max(8, containerRect.height - ttH - 8);
        relLeft = Math.min(Math.max(8, relLeft), maxLeft);
        relTop = Math.min(Math.max(8, relTop), maxTop);

        tooltip.style.left = `${relLeft}px`;
        tooltip.style.top = `${relTop}px`;
      } catch (e) {
        console.error('[归墟] 解析装备Tooltip数据失败:', e);
      }
    },

    hideEquipmentTooltip() {
      const tooltip = document.getElementById('equipment-tooltip');
      if (tooltip) tooltip.style.display = 'none';
    },

    // 全屏切换：进入/退出全屏
    toggleFullscreen() {
      try {
        const root = document.querySelector('.guixu-root-container') || document.documentElement;
        if (!document.fullscreenElement) {
          if (root.requestFullscreen) root.requestFullscreen();
          else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      } catch (e) {
        console.warn('[归墟] 全屏切换失败:', e);
        window.GuixuHelpers?.showTemporaryMessage?.('暂不支持全屏或被浏览器拦截');
      }
    },

    // 新增：在全屏模式下尝试锁定为横屏；退出全屏或不需要时解除
    _tryLockLandscapeOrientation() {
      try {
        if (!document.fullscreenElement) return;
        const lock = screen.orientation && typeof screen.orientation.lock === 'function'
          ? screen.orientation.lock.bind(screen.orientation)
          : (screen.lockOrientation || screen.mozLockOrientation || screen.msLockOrientation);
        if (lock) {
          const maybePromise = lock('landscape');
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(() => {
              try { window.GuixuHelpers?.showTemporaryMessage?.('已切换桌面视图，尝试横屏显示'); } catch (_) {}
            }).catch(() => {});
          }
        }
      } catch (_) {}
    },
    _tryUnlockOrientation() {
      try {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
          screen.orientation.unlock();
        }
      } catch (_) {}
    },
    // 新增：在全屏模式下尝试锁定为竖屏（用于移动端全屏强制竖屏UI）
    _tryLockPortraitOrientation() {
      try {
        if (!document.fullscreenElement) return;
        const lock = screen.orientation && typeof screen.orientation.lock === 'function'
          ? screen.orientation.lock.bind(screen.orientation)
          : (screen.lockOrientation || screen.mozLockOrientation || screen.msLockOrientation);
        if (lock) {
          const maybePromise = lock('portrait');
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(() => {}).catch(() => {});
          }
        }
      } catch (_) {}
    },

    // 移动端横屏全屏模式移除：不再支持横屏模式下的移动端UI
    _isMobileEnv() {
      try {
        return (window.SillyTavern?.isMobile?.() === true) ||
               window.matchMedia('(pointer: coarse)').matches ||
               window.matchMedia('(max-width: 900px)').matches;
      } catch (_) { return false; }
    },
    _updateMobileLandscapeFullscreenClass() {
      try {
        const root = document.querySelector('.guixu-root-container');
        if (!root) return;
        // 直接移除横屏移动端全屏类，禁用该模式
        root.classList.remove('mobile-landscape-fullscreen');
      } catch (_) {}
    },

    // 根据全屏状态更新按钮图标与提示
    _updateFullscreenButtonState() {
      const btn = document.getElementById('fullscreen-btn');
      if (!btn) return;
      const isFull = !!document.fullscreenElement;
      btn.title = isFull ? '退出全屏' : '进入全屏';
      btn.textContent = isFull ? '⤡' : '⛶';
    },

    // 通用自定义确认弹窗（优先使用自带模态，其次回退到浏览器 confirm）
    showCustomConfirm(message, onOk, onCancel) {
      try {
        const overlay = document.getElementById('custom-confirm-modal');
        const msgEl = document.getElementById('custom-confirm-message');
        const okBtn = document.getElementById('custom-confirm-btn-ok');
        const cancelBtn = document.getElementById('custom-confirm-btn-cancel');

        if (!overlay || !okBtn || !cancelBtn) {
          if (confirm(message)) {
            if (typeof onOk === 'function') onOk();
          } else {
            if (typeof onCancel === 'function') onCancel();
          }
          return;
        }

        if (msgEl) {
          msgEl.textContent = String(message ?? '');
        }

        function cleanup() {
          overlay.style.display = 'none';
          okBtn.removeEventListener('click', okHandler);
          cancelBtn.removeEventListener('click', cancelHandler);
        }
        function okHandler() {
          cleanup();
          if (typeof onOk === 'function') onOk();
        }
        function cancelHandler() {
          cleanup();
          if (typeof onCancel === 'function') onCancel();
        }

        okBtn.addEventListener('click', okHandler, { once: true });
        cancelBtn.addEventListener('click', cancelHandler, { once: true });

        // 始终置于最顶层，避免被其他模态遮挡
        overlay.style.zIndex = '9000';
        overlay.style.display = 'flex';
      } catch (e) {
        console.error('[归墟] 自定义确认弹窗失败:', e);
        if (confirm(message)) {
          if (typeof onOk === 'function') onOk();
        } else {
          if (typeof onCancel === 'function') onCancel();
        }
      }
      },


      // 自定义数字输入弹窗（与UI一致），返回 Promise<number|null>
      async showNumberPrompt({ title = '请输入数量', message = '', min = 1, max = 99, defaultValue = 1 } = {}) {
        return new Promise((resolve) => {
          try {
            // 防重：若此前遗留了数量弹窗，先移除，避免叠加导致需要点两次关闭
            try { const ex = document.getElementById('custom-number-prompt-modal'); if (ex) ex.remove(); } catch(_) {}
            const root = document.querySelector('.guixu-root-container') || document.body;

            // 外层遮罩
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.id = 'custom-number-prompt-modal';

            // 内容容器（复用确认弹窗风格）
            const content = document.createElement('div');
            content.className = 'modal-content confirm-modal-content';
            content.style.width = 'auto';
            content.style.maxWidth = '420px';
            content.style.height = 'auto';
            content.style.maxHeight = 'none';

            // 头部
            const header = document.createElement('div');
            header.className = 'modal-header';

            const titleEl = document.createElement('div');
            titleEl.className = 'modal-title';
            titleEl.textContent = String(title || '请输入数量');

            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close-btn';
            closeBtn.innerHTML = '&times;';

            header.appendChild(titleEl);
            header.appendChild(closeBtn);

            // 主体
            const body = document.createElement('div');
            body.className = 'modal-body';

            const msg = document.createElement('div');
            msg.className = 'confirm-modal-message';
            msg.textContent = String(message || '');

            const input = document.createElement('input');
            input.type = 'number';
            input.value = String(defaultValue ?? min ?? 1);
            input.min = String(min ?? 1);
            input.max = String(max ?? 9999);
            input.step = '1';
            input.style.cssText = 'margin-top:10px;width:100%;height:36px;padding:0 10px;background:rgba(0,0,0,0.4);border:1px solid #8b7355;border-radius:4px;color:#e0dcd1;box-sizing:border-box;font-size:14px;';

            body.appendChild(msg);
            body.appendChild(input);

            // 底部按钮
            const footer = document.createElement('div');
            footer.className = 'confirm-modal-buttons';

            const okBtn = document.createElement('button');
            okBtn.className = 'interaction-btn';
            okBtn.style.cssText = 'min-width:120px;height:36px;padding:0 12px;box-sizing:border-box;';
            okBtn.textContent = '确定';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'danger-btn';
            cancelBtn.style.cssText = 'min-width:120px;height:36px;padding:0 12px;box-sizing:border-box;';
            cancelBtn.textContent = '取消';

            footer.appendChild(okBtn);
            footer.appendChild(cancelBtn);

            // 组装
            content.appendChild(header);
            content.appendChild(body);
            content.appendChild(footer);
            overlay.appendChild(content);
            root.appendChild(overlay);

            const cleanup = (ret = null) => {
              try { overlay.remove(); } catch (_) {}
              resolve(ret);
            };

            closeBtn.addEventListener('click', () => cleanup(null));
            cancelBtn.addEventListener('click', () => cleanup(null));
            overlay.addEventListener('click', (e) => {
              if (e.target === overlay) cleanup(null);
            });
            okBtn.addEventListener('click', () => {
              const n = parseInt(input.value, 10);
              const minN = Number(min ?? 1);
              const maxN = Number(max ?? 9999);
              if (!Number.isFinite(n) || n < minN || n > maxN) {
                window.GuixuHelpers?.showTemporaryMessage?.(`请输入 ${minN}-${maxN} 的整数`);
                return;
              }
              cleanup(n);
            });

            // 显示与交互
            overlay.style.display = 'flex';
            overlay.style.zIndex = '9000';
            setTimeout(() => input.focus(), 0);
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') okBtn.click();
              if (e.key === 'Escape') cancelBtn.click();
            });
          } catch (e) {
            console.warn('[归墟] showNumberPrompt 失败，回退到 prompt:', e);
            const fallback = prompt(message || '请输入数量', String(defaultValue ?? min ?? 1));
            const n = parseInt(String(fallback || ''), 10);
            if (!Number.isFinite(n)) resolve(null);
            else resolve(n);
          }
        });
      },

      // 新增：文本编辑弹窗（用于重掷前允许修改上一轮输入）
      async showTextPrompt({ title = '编辑输入', message = '', defaultValue = '', placeholder = '在此输入...', okText = '确定', cancelText = '取消' } = {}) {
        return new Promise((resolve) => {
          try {
            // 防重：若此前遗留了文本弹窗，先移除
            try { const ex = document.getElementById('custom-text-prompt-modal'); if (ex) ex.remove(); } catch(_) {}
            const root = document.querySelector('.guixu-root-container') || document.body;

            // 外层遮罩
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.id = 'custom-text-prompt-modal';

            // 内容容器（复用确认弹窗风格）
            const content = document.createElement('div');
            content.className = 'modal-content confirm-modal-content';
            content.style.width = 'auto';
            content.style.maxWidth = '600px';
            content.style.height = 'auto';
            content.style.maxHeight = '80vh';

            // 头部
            const header = document.createElement('div');
            header.className = 'modal-header';

            const titleEl = document.createElement('div');
            titleEl.className = 'modal-title';
            titleEl.textContent = String(title || '编辑输入');

            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close-btn';
            closeBtn.innerHTML = '&times;';

            header.appendChild(titleEl);
            header.appendChild(closeBtn);

            // 主体
            const body = document.createElement('div');
            body.className = 'modal-body';

            const msg = document.createElement('div');
            msg.className = 'confirm-modal-message';
            msg.textContent = String(message || '');

            const textarea = document.createElement('textarea');
            textarea.style.cssText = 'margin-top:10px;width:100%;height:220px;padding:8px 10px;background:rgba(0,0,0,0.4);border:1px solid #8b7355;border-radius:4px;color:#e0dcd1;box-sizing:border-box;font-size:13px;line-height:1.5;resize:vertical;';
            textarea.placeholder = String(placeholder || '');
            textarea.value = String(defaultValue || '');

            body.appendChild(msg);
            body.appendChild(textarea);

            // 底部按钮
            const footer = document.createElement('div');
            footer.className = 'confirm-modal-buttons';

            const okBtn = document.createElement('button');
            okBtn.className = 'interaction-btn';
            okBtn.style.cssText = 'min-width:120px;height:36px;padding:0 12px;box-sizing:border-box;';
            okBtn.textContent = String(okText || '确定');

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'danger-btn';
            cancelBtn.style.cssText = 'min-width:120px;height:36px;padding:0 12px;box-sizing:border-box;';
            cancelBtn.textContent = String(cancelText || '取消');

            footer.appendChild(okBtn);
            footer.appendChild(cancelBtn);

            // 组装
            content.appendChild(header);
            content.appendChild(body);
            content.appendChild(footer);
            overlay.appendChild(content);
            root.appendChild(overlay);

            const cleanup = (ret = null) => {
              try { overlay.remove(); } catch (_) {}
              resolve(ret);
            };

            closeBtn.addEventListener('click', () => cleanup(null));
            cancelBtn.addEventListener('click', () => cleanup(null));
            overlay.addEventListener('click', (e) => {
              if (e.target === overlay) cleanup(null);
            });
            okBtn.addEventListener('click', () => cleanup(textarea.value));

            // 显示与交互
            overlay.style.display = 'flex';
            overlay.style.zIndex = '9000';
            setTimeout(() => textarea.focus(), 0);
            textarea.addEventListener('keydown', (e) => {
              // Ctrl/Cmd+Enter 或 Shift+Enter 快速确认
              if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || (e.key === 'Enter' && e.shiftKey)) {
                e.preventDefault();
                okBtn.click();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn.click();
              }
            });
          } catch (e) {
            console.warn('[归墟] showTextPrompt 失败，回退到 prompt:', e);
            const fallback = prompt(message || '请输入内容', String(defaultValue || ''));
            if (fallback == null) return resolve(null);
            resolve(String(fallback));
          }
        });
      },

      // 浏览器端本地缓存刷新（后备实现）
      refreshLocalStorage() {
        try {
          this.showCustomConfirm('这是为了刷新上一个聊天缓存数据，如果不是打开新聊天，请不要点击', () => {
            try {
              localStorage.removeItem('guixu_equipped_items');
              localStorage.removeItem('guixu_pending_actions');
              localStorage.removeItem('guixu_auto_write_enabled');
              window.GuixuHelpers.showTemporaryMessage('缓存已清除，页面即将刷新...');
              setTimeout(() => window.location.reload(), 1000);
            } catch (e) {
              console.error('[归墟] 清除本地存储失败:', e);
              window.GuixuHelpers.showTemporaryMessage('清除缓存失败！');
            }
          });
        } catch (e) {
          console.error('[归墟] refreshLocalStorage 出错:', e);
        }
      },

      async trimJourneyAutomation() {
      try {
        const idxEl = document.getElementById('trim-journey-index-input');
        const targetIndex = idxEl ? parseInt(idxEl.value, 10) : (window.GuixuState?.getState?.().unifiedIndex || 1);
        const bookName = window.GuixuConstants.LOREBOOK.NAME;
        const key = targetIndex > 1
          ? `${window.GuixuConstants.LOREBOOK.ENTRIES.JOURNEY}(${targetIndex})`
          : window.GuixuConstants.LOREBOOK.ENTRIES.JOURNEY;

        const entries = await window.GuixuAPI.getLorebookEntries(bookName);
        const entry = entries.find(e => (e.comment || '').trim() === key.trim());
        if (!entry) {
          window.GuixuHelpers.showTemporaryMessage('未找到本世历程条目，无法修剪');
          return;
        }

        const trimmed = window.GuixuLorebookService?.getTrimmedJourneyContent
          ? window.GuixuLorebookService.getTrimmedJourneyContent(entry.content || '')
          : (entry.content || '');

        if (trimmed !== entry.content) {
          await window.GuixuAPI.setLorebookEntries(bookName, [{ uid: entry.uid, content: trimmed }]);
          window.GuixuHelpers.showTemporaryMessage('已修剪自动化系统内容');
        } else {
          window.GuixuHelpers.showTemporaryMessage('无需修剪');
        }
      } catch (e) {
        console.error('[归墟] trimJourneyAutomation 失败:', e);
        window.GuixuHelpers.showTemporaryMessage('修剪失败');
      }
    },

    // 桌面端：左右侧栏开合控制
    ensurePaneToggleControls() {
      try {
        const root = document.querySelector('.guixu-root-container');
        const game = document.querySelector('.game-container');
        if (!root || !game) return;

        // 创建左侧按钮
        let leftBtn = document.getElementById('pane-toggle-left');
        if (!leftBtn) {
          leftBtn = document.createElement('button');
          leftBtn.id = 'pane-toggle-left';
          leftBtn.className = 'pane-toggle-btn pane-toggle-left';
          leftBtn.type = 'button';
          leftBtn.addEventListener('click', () => this.toggleLeftPane());
          game.appendChild(leftBtn);
        }

        // 创建右侧按钮
        let rightBtn = document.getElementById('pane-toggle-right');
        if (!rightBtn) {
          rightBtn = document.createElement('button');
          rightBtn.id = 'pane-toggle-right';
          rightBtn.className = 'pane-toggle-btn pane-toggle-right';
          rightBtn.type = 'button';
          rightBtn.addEventListener('click', () => this.toggleRightPane());
          game.appendChild(rightBtn);
        }

        // 恢复上次状态
        try {
          const leftCollapsed = localStorage.getItem('guixu_left_pane_collapsed') === '1';
          const rightCollapsed = localStorage.getItem('guixu_right_pane_collapsed') === '1';
          root.classList.toggle('left-pane-collapsed', leftCollapsed);
          root.classList.toggle('right-pane-collapsed', rightCollapsed);
        } catch (_) {}

        this._updatePaneToggleLabels();
      } catch (e) {
        console.warn('[归墟] ensurePaneToggleControls 失败:', e);
      }
    },

    // 更新开合按钮的图标与标题（根据当前状态）
    _updatePaneToggleLabels() {
      try {
        const root = document.querySelector('.guixu-root-container');
        if (!root) return;
        const leftCollapsed = root.classList.contains('left-pane-collapsed');
        const rightCollapsed = root.classList.contains('right-pane-collapsed');
        const leftBtn = document.getElementById('pane-toggle-left');
        const rightBtn = document.getElementById('pane-toggle-right');

        if (leftBtn) {
          leftBtn.textContent = leftCollapsed ? '»' : '«';
          leftBtn.title = leftCollapsed ? '展开左侧栏' : '折叠左侧栏';
          leftBtn.setAttribute('aria-pressed', String(!leftCollapsed));
        }
        if (rightBtn) {
          rightBtn.textContent = rightCollapsed ? '«' : '»';
          rightBtn.title = rightCollapsed ? '展开右侧栏' : '折叠右侧栏';
          rightBtn.setAttribute('aria-pressed', String(!rightCollapsed));
        }
      } catch (_) {}
    },

    // 切换左侧栏
    toggleLeftPane() {
      try {
        const root = document.querySelector('.guixu-root-container');
        if (!root) return;
        root.classList.toggle('left-pane-collapsed');
        try {
          const val = root.classList.contains('left-pane-collapsed') ? '1' : '0';
          localStorage.setItem('guixu_left_pane_collapsed', val);
        } catch (_) {}
        this._updatePaneToggleLabels();
        this._pulseFastReflow(150);
      } catch (e) {
        console.warn('[归墟] toggleLeftPane 失败:', e);
      }
    },

    // 切换右侧栏
    toggleRightPane() {
      try {
        const root = document.querySelector('.guixu-root-container');
        if (!root) return;
        root.classList.toggle('right-pane-collapsed');
        try {
          const val = root.classList.contains('right-pane-collapsed') ? '1' : '0';
          localStorage.setItem('guixu_right_pane_collapsed', val);
        } catch (_) {}
        this._updatePaneToggleLabels();
        this._pulseFastReflow(150);
      } catch (e) {
        console.warn('[归墟] toggleRightPane 失败:', e);
      }
    },
  };

  // 导出全局
  window.GuixuMain = GuixuMain;

  // SillyTavern 环境入口
  if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined' && tavern_events.APP_READY) {
    eventOn(tavern_events.APP_READY, () => GuixuMain.init());
  } else {
    // 兜底：非 ST 环境/本地调试
    document.addEventListener('DOMContentLoaded', () => GuixuMain.init());
  }
})(window);
