(function (window) {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  const DEFAULTS = Object.freeze({
    backgroundUrl: '',
    bgMaskOpacity: 0.7,
    storyFontSize: 14,
    storyFontColor: '#e0dcd1',
    storyDefaultColor: '#e0dcd1',
    storyQuoteColor: '#ff4d4f',
    thinkingTextColor: '#e0dcd1',
    thinkingBgOpacity: 0.85,
    // 行动选项样式
    guidelineTextColor: '#e0dcd1',
    guidelineBgOpacity: 0.6,
    bgFitMode: 'cover',
    // 自定义字体（以 dataURL 形式缓存）
    customFontName: '',
    customFontDataUrl: '',
    // 背景压缩设置
    bgCompressQuality: 0.9, // 0.6 - 1.0
    bgKeepSize: false       // 保留原始尺寸（不缩放）
  });

  function clamp(num, min, max) {
    const n = Number(num);
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  const BG_PREFIX = String(window.GuixuConstants?.BACKGROUND?.PREFIX || '归墟背景/');

  const SettingsComponent = {
    _bound: false,
    _bgEntriesCache: [],
    _selectedComment: '',

    show() {
      const overlay = $('#settings-modal');
      if (!overlay) return;
      this.ensureBound();
      this.loadFromState();
      // 打开时加载世界书背景列表
      this.refreshBackgroundList().finally(() => {
        overlay.style.display = 'flex';
      });
    },

    hide() {
      const overlay = $('#settings-modal');
      if (overlay) overlay.style.display = 'none';
    },

    ensureBound() {
      if (this._bound) return;
      this._bound = true;

      const overlay = $('#settings-modal');
      const bgSelect = $('#pref-bg-select');
      const bgUploadBtn = $('#pref-bg-upload');
      const bgDeleteBtn = $('#pref-bg-delete');
      const bgClearBtn = $('#pref-bg-clear');
      const previewEl = $('#pref-bg-preview');

      const maskRange = $('#pref-bg-mask');
      const maskVal = $('#pref-bg-mask-val');
      const fontRange = $('#pref-story-font-size');
      const fontVal = $('#pref-story-font-size-val');
      const btnReset = $('#pref-reset-defaults');
      const btnApply = $('#pref-apply');
      const btnSaveClose = $('#pref-save-close');
      const fitSelect = $('#pref-bg-fit-mode');


      // 动态注入：正文字体与颜色面板（保持与现有风格一致）
      try {
        const modalBody = overlay?.querySelector('.modal-body');
        if (modalBody && !document.getElementById('panel-story-font-color')) {
          const panel = document.createElement('div');
          panel.className = 'panel-section';
          panel.id = 'panel-story-font-color';
          panel.innerHTML = `
            <div class="section-title" id="section-title-story-font">正文字体与颜色</div>
            <div class="attributes-list">
              <!-- 1) 纯正文颜色（未被任何符号包裹） -->
              <div class="attribute-item">
                <span class="attribute-name attr-name--min90">正文颜色</span>
                <input id="pref-story-default-color" type="color" value="#e0dcd1">
                <span id="pref-story-default-color-val" class="attribute-value">#e0dcd1</span>
              </div>
              <!-- 2) 方括号文本颜色（【…】等特殊文本，映射 text-scenery） -->
              <div class="attribute-item">
                <span class="attribute-name attr-name--min90">方括号文本颜色</span>
                <input id="pref-story-font-color" type="color" value="#e0dcd1">
                <span id="pref-story-font-color-val" class="attribute-value">#e0dcd1</span>
              </div>
              <div class="attribute-item">
                <span class="attribute-name attr-name--min90">引号文本颜色</span>
                <input id="pref-story-quote-color" type="color" value="#ff4d4f">
                <span id="pref-story-quote-color-val" class="attribute-value">#FF4D4F</span>
              </div>
              <div class="attribute-item">
                <span class="attribute-name attr-name--min90">思维链文字颜色</span>
                <input id="pref-thinking-text-color" type="color" value="#e0dcd1">
                <span id="pref-thinking-text-color-val" class="attribute-value">#E0DCD1</span>
              </div>
              <div class="attribute-item">
                <span class="attribute-name attr-name--min90">思维链背景透明</span>
                <input id="pref-thinking-bg-opacity" type="range" min="0" max="1" step="0.05" value="0.85" class="u-flex-1">
                <span id="pref-thinking-bg-opacity-val" class="attribute-value">0.85</span>
              </div>
              <!-- 3) 行动选项（按钮）颜色与背景透明度 -->
              <div class="attribute-item">
                <span class="attribute-name attr-name--min90">行动选项文字</span>
                <input id="pref-guideline-text-color" type="color" value="#e0dcd1">
                <span id="pref-guideline-text-color-val" class="attribute-value">#E0DCD1</span>
              </div>
              <div class="attribute-item">
                <span class="attribute-name attr-name--min90">行动选项背景</span>
                <input id="pref-guideline-bg-opacity" type="range" min="0" max="1" step="0.05" value="0.60" class="u-flex-1">
                <span id="pref-guideline-bg-opacity-val" class="attribute-value">0.60</span>
              </div>
              <div class="attribute-item">
                <span class="attribute-name attr-name--min90">自定义字体</span>
                <button id="pref-font-upload" class="interaction-btn is-compact">本地上传</button>
                <button id="pref-font-clear" class="interaction-btn danger-btn is-compact">清除字体</button>
                <span id="pref-font-name" class="attribute-value minw-120">（未选择）</span>
              </div>
            </div>
          `;
          // 插入在“故事文本字号”之后更合适
          const afterNode = modalBody.querySelector('#pref-story-font-size')?.closest('.panel-section');
          if (afterNode && afterNode.nextSibling) {
            modalBody.insertBefore(panel, afterNode.nextSibling);
          } else {
            modalBody.appendChild(panel);
          }
        }
      } catch (_) {}

      // 内部状态：暂存字体 DataURL/名称（避免读值过程中丢失）
      this._tempFontDataUrl = this._tempFontDataUrl || '';
      this._tempFontName = this._tempFontName || '';

      // 颜色选择预览
      const storyColorInput = $('#pref-story-font-color');
      const storyColorVal = $('#pref-story-font-color-val');
      const storyDefaultColorInput = $('#pref-story-default-color');
      const storyDefaultColorVal = $('#pref-story-default-color-val');
      const storyQuoteColorInput = $('#pref-story-quote-color');
      const storyQuoteColorVal = $('#pref-story-quote-color-val');
      const thinkingTextColorInput = $('#pref-thinking-text-color');
      const thinkingTextColorVal = $('#pref-thinking-text-color-val');
      const thinkingBgOpacityRange = $('#pref-thinking-bg-opacity');
      const thinkingBgOpacityVal = $('#pref-thinking-bg-opacity-val');
      const guidelineTextColorInput = $('#pref-guideline-text-color');
      const guidelineTextColorVal = $('#pref-guideline-text-color-val');
      const guidelineBgOpacityRange = $('#pref-guideline-bg-opacity');
      const guidelineBgOpacityVal = $('#pref-guideline-bg-opacity-val');
      const qualityRange = $('#pref-bg-quality');
      const qualityVal = $('#pref-bg-quality-val');
      const keepSizeCheckbox = $('#pref-bg-keep-size');

      storyColorInput?.addEventListener('input', () => {
        const val = String(storyColorInput.value || '').trim() || '#e0dcd1';
        if (storyColorVal) storyColorVal.textContent = val.toUpperCase();
        this.applyPreview(this.readValues());
      });
      storyDefaultColorInput?.addEventListener('input', () => {
        const val = String(storyDefaultColorInput.value || '').trim() || '#e0dcd1';
        if (storyDefaultColorVal) storyDefaultColorVal.textContent = val.toUpperCase();
        this.applyPreview(this.readValues());
      });
      storyQuoteColorInput?.addEventListener('input', () => {
        const val = String(storyQuoteColorInput.value || '').trim() || '#ff4d4f';
        if (storyQuoteColorVal) storyQuoteColorVal.textContent = val.toUpperCase();
        this.applyPreview(this.readValues());
      });
      thinkingTextColorInput?.addEventListener('input', () => {
        const val = String(thinkingTextColorInput.value || '').trim() || '#e0dcd1';
        if (thinkingTextColorVal) thinkingTextColorVal.textContent = val.toUpperCase();
        this.applyPreview(this.readValues());
      });
      thinkingBgOpacityRange?.addEventListener('input', () => {
        const v = Math.min(1, Math.max(0, Number(thinkingBgOpacityRange.value ?? DEFAULTS.thinkingBgOpacity)));
        if (thinkingBgOpacityVal) thinkingBgOpacityVal.textContent = v.toFixed(2);
        this.applyPreview(this.readValues());
      });
      // 行动选项颜色/背景透明
      guidelineTextColorInput?.addEventListener('input', () => {
        const val = String(guidelineTextColorInput.value || '').trim() || '#e0dcd1';
        if (guidelineTextColorVal) guidelineTextColorVal.textContent = val.toUpperCase();
        this.applyPreview(this.readValues());
      });
      guidelineBgOpacityRange?.addEventListener('input', () => {
        const v = Math.min(1, Math.max(0, Number(guidelineBgOpacityRange.value ?? DEFAULTS.guidelineBgOpacity)));
        if (guidelineBgOpacityVal) guidelineBgOpacityVal.textContent = v.toFixed(2);
        this.applyPreview(this.readValues());
      });

      // 背景压缩质量显示（仅用于显示，不会立刻改变现有背景，影响上传时的编码）
      qualityRange?.addEventListener('input', () => {
        const v = Math.min(1, Math.max(0.6, Number(qualityRange.value ?? DEFAULTS.bgCompressQuality)));
        if (qualityVal) qualityVal.textContent = v.toFixed(2);
      });

      // 字体上传
      const fontUploadBtn = $('#pref-font-upload');
      const fontClearBtn = $('#pref-font-clear');
      const fontNameEl = $('#pref-font-name');
      fontUploadBtn?.addEventListener('click', async () => {
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.ttf,.otf,.woff,.woff2,application/font-woff,application/font-woff2,font/ttf,font/otf';
          input.className = 'u-hidden';
          document.body.appendChild(input);
          input.click();
          await new Promise(res => input.addEventListener('change', res, { once: true }));
          const file = input.files?.[0];
          setTimeout(() => { try { input.remove(); } catch(_) {} }, 0);
          if (!file) return;
          const name = file.name || '自定义字体';
          const reader = new FileReader();
          const dataUrl = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          // 记录到临时状态，待 readValues 提交
          this._tempFontName = name;
          this._tempFontDataUrl = dataUrl;
          if (fontNameEl) fontNameEl.textContent = name;
          this.applyPreview(this.readValues());
          try { window.GuixuHelpers?.showTemporaryMessage?.('字体已加载（预览中，保存后持久化）'); } catch(_) {}
        } catch (e) {
          console.warn('[归墟][设置中心] 字体上传失败：', e);
          try { window.GuixuHelpers?.showTemporaryMessage?.('字体上传失败'); } catch(_) {}
        }
      });
      fontClearBtn?.addEventListener('click', () => {
        this._tempFontName = '';
        this._tempFontDataUrl = '';
        if (fontNameEl) fontNameEl.textContent = '（未选择）';
        this.applyPreview(this.readValues());
      });

      // 设置中心说明浮窗（问号图标）
      const ensureInfoTooltipInfra = () => {
        if (document.getElementById('guixu-info-tooltip')) return;
        const tip = document.createElement('div');
        tip.id = 'guixu-info-tooltip';
        /* 样式移至 CSS（settings.css） */
        (document.querySelector('.guixu-root-container') || document.body).appendChild(tip);
      };
      const showInfoTooltip = (ev, text) => {
        ensureInfoTooltipInfra();
        const tip = document.getElementById('guixu-info-tooltip');
        if (!tip) return;
        tip.textContent = String(text || '');
        tip.classList.add('is-open');
        const vw = window.innerWidth;
        const rect = ev.target.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        const left = Math.max(8, Math.min(vw - tipRect.width - 8, rect.left + rect.width / 2 - tipRect.width / 2));
        const top = Math.max(8, rect.bottom + 8);
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
        // 点击外部隐藏
        const onDocClick = (e2) => {
          if (!tip.contains(e2.target)) {
            tip.classList.remove('is-open');
            document.removeEventListener('click', onDocClick);
          }
        };
        setTimeout(() => document.addEventListener('click', onDocClick), 0);
      };
      const attachInfoIcon = (titleEl, text) => {
        if (!titleEl || titleEl.querySelector('.info-icon')) return;
        const icon = document.createElement('span');
        icon.className = 'info-icon';
        icon.textContent = '?';
        icon.title = '点击查看说明';
        icon.addEventListener('click', (e) => {
          e.stopPropagation();
          showInfoTooltip(e, text);
        });
        titleEl.appendChild(icon);
      };

      // 为设置中心各标题添加说明图标
      try {
        const panelMap = [
          { selector: '.panel-section .section-title', match: '背景图', text: '从世界书中选择或上传背景图，支持自动压缩为 WebP 格式。' },
          { selector: '.panel-section .section-title', match: '背景遮罩透明度', text: '调整背景上方的暗色遮罩透明度，数值越大文字越清晰。' },
          { selector: '.panel-section .section-title', match: '背景显示方式', text: '设置背景图的铺放方式（cover/contain/repeat/stretch/center）。' },
          { selector: '.panel-section .section-title', match: '背景压缩', text: '上传本地图片时按此质量进行压缩（默认WebP，范围0.60-1.00）；勾选“保留原始尺寸”则不缩放，仅按质量压缩。仅影响上传后的存储，不改变当前已选背景清晰度。' },
          { selector: '.panel-section .section-title', match: '故事文本字号', text: '控制中央正文区域的基础字号大小。' },
          { selector: '.panel-section .section-title', match: '流式请求', text: '此开关只是以流式请求的方式进行请求，并不会真的流式输出在正文窗口里。' },
          { selector: '#section-title-story-font', match: null, text: '可分别设置：正文颜色、方括号文本颜色、引号文本颜色、思维链文字颜色以及其背景透明度；并可上传本地字体文件（TTF/OTF/WOFF/WOFF2）。字体以本地缓存方式加载，刷新后仍有效（强制清缓存除外）。' },
        ];
        panelMap.forEach(cfg => {
          const list = Array.from(document.querySelectorAll(cfg.selector));
          const el = cfg.match ? list.find(n => (n.textContent || '').includes(cfg.match)) : list[0];
          if (el) attachInfoIcon(el, cfg.text);
        });
      } catch (_) {}

      // 选择变化 -> 预览
      bgSelect?.addEventListener('change', async () => {
        const comment = String(bgSelect.value || '');
        this._selectedComment = comment;
        await this.updatePreviewByComment(comment);
        this.applyPreview(this.readValues());
      });

      // 背景适配方式变化 -> 预览
      fitSelect?.addEventListener('change', () => {
        this.applyPreview(this.readValues());
      });

      // 遮罩/字号实时预览
      maskRange?.addEventListener('input', () => {
        const v = clamp(maskRange.value, 0, 0.8);
        if (maskVal) maskVal.textContent = v.toFixed(2);
        this.applyPreview(this.readValues());
      });
      fontRange?.addEventListener('input', () => {
        const v = clamp(fontRange.value, 12, 20);
        if (fontVal) fontVal.textContent = `${Math.round(v)}px`;
        this.applyPreview(this.readValues());
      });


      // 本地上传 -> 压缩 -> 新建世界书条目（不覆盖）
      bgUploadBtn?.addEventListener('click', () => this.uploadBackground());

      // 删除当前选择的背景（从世界书中删除该条目）
      bgDeleteBtn?.addEventListener('click', async () => {
        const comment = String(bgSelect?.value || '');
        if (!comment) {
          try { window.GuixuHelpers?.showTemporaryMessage?.('请先从下拉框选择要删除的背景'); } catch(_) {}
          return;
        }
        const confirmDelete = (onOk) => {
          if (typeof window.GuixuMain?.showCustomConfirm === 'function') {
            window.GuixuMain.showCustomConfirm(`确定要删除背景「${comment}」吗？此操作不可撤销。`, onOk, () => {});
          } else {
            if (confirm(`确定要删除背景「${comment}」吗？此操作不可撤销。`)) onOk();
          }
        };
        confirmDelete(async () => {
          try {
            await this.deleteBackgroundEntry(comment);
            try { window.GuixuHelpers?.showTemporaryMessage?.('背景已删除'); } catch(_) {}
            // 刷新列表并清空选择
            await this.refreshBackgroundList();
            if (bgSelect) bgSelect.value = '';
            this._selectedComment = '';
            await this.updatePreviewByComment('');
            this.applyPreview(this.readValues());
          } catch (e) {
            console.warn('[归墟][设置中心] 删除背景失败：', e);
            try { window.GuixuHelpers?.showTemporaryMessage?.('删除失败'); } catch(_) {}
          }
        });
      });

      // 清除背景（不删除世界书条目，仅清空当前选择）
      bgClearBtn?.addEventListener('click', async () => {
        if (bgSelect) bgSelect.value = '';
        this._selectedComment = '';
        await this.updatePreviewByComment('');
        this.applyPreview(this.readValues());
      });

      // 恢复默认
      btnReset?.addEventListener('click', async () => {
        this.syncUI(DEFAULTS);
        await this.updatePreviewByComment('');
        this.applyPreview(DEFAULTS);
      });

      // 应用（不保存，仅一次性应用）
      btnApply?.addEventListener('click', () => {
        const prefs = this.readValues();
        window.GuixuMain?.applyUserPreferences?.(prefs);
        try { window.GuixuHelpers?.showTemporaryMessage?.('已应用设置（未保存）'); } catch (_) {}
      });

      // 保存并关闭（写入状态 + 应用 + 漫游持久化）
      btnSaveClose?.addEventListener('click', async () => {
        const prefs = this.readValues();
        try {
          window.GuixuState?.update?.('userPreferences', prefs);
        } catch (e) {
          console.warn('[归墟][设置中心] 保存 userPreferences 失败:', e);
        }
        window.GuixuMain?.applyUserPreferences?.(prefs);
        try {
          await this.persistToRoaming(prefs);
          try { window.GuixuHelpers?.showTemporaryMessage?.('设置已保存（本地+全局），刷新后仍生效'); } catch (_) {}
        } catch (e) {
          console.warn('[归墟][设置中心] 保存到全局变量失败，仅本地已保存:', e);
          try { window.GuixuHelpers?.showTemporaryMessage?.('设置已保存到本地（全局保存失败）'); } catch (_) {}
        }
        this.hide();
      });

      // 关闭按钮由全局委托处理（main.js 中的 .modal-close-btn 委托），此处无需重复绑定
      // 点击遮罩空白关闭同样由全局委托处理
      overlay?.addEventListener('keydown', (e) => {
        const btnSaveCloseNow = $('#pref-save-close');
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          btnSaveCloseNow?.click();
        }
      });

      // 新增：对话流式输出开关面板（移动/桌面通用）
      try {
        const modalBody = overlay?.querySelector('.modal-body');
        if (modalBody && !document.getElementById('panel-streaming-toggle')) {
          const panel = document.createElement('div');
          panel.className = 'panel-section';
          panel.id = 'panel-streaming-toggle';
          panel.innerHTML = `
            <div class="section-title">流式请求</div>
            <div class="attributes-list">
              <div class="attribute-item">
                <input id="pref-streaming-enabled" type="checkbox" />
                <label for="pref-streaming-enabled" class="auto-write-label">流式请求开关</label>
              </div>
            </div>
          `;
          // 插入在“桌面视图分辨率”面板之前更合理
          const resPanel = modalBody.querySelector('#pref-ui-res-preset')?.closest('.panel-section');
          if (resPanel) {
            modalBody.insertBefore(panel, resPanel);
          } else {
            modalBody.appendChild(panel);
          }
          try {
            const streamingTitle = panel.querySelector('.section-title');
            attachInfoIcon(streamingTitle, '此开关只是以流式请求的方式进行请求，并不会真的流式输出在正文窗口里。');
          } catch (_) {}
        }
        // 绑定开关事件
        const streamingCheckbox = document.getElementById('pref-streaming-enabled');
        if (streamingCheckbox && !streamingCheckbox.dataset.guixuBind) {
          streamingCheckbox.addEventListener('change', (e) => {
            const enabled = !!e.target.checked;
            try { window.GuixuState.update('isStreamingEnabled', enabled); } catch (_) {}
            try { window.GuixuHelpers?.showTemporaryMessage?.(`流式传输已${enabled ? '开启' : '关闭'}`); } catch (_) {}
          });
          streamingCheckbox.dataset.guixuBind = '1';
        }
      } catch (_) {}

      // 预览容器样式统一由 CSS (.bg-preview) 提供
    },

    loadFromState() {
      const state = window.GuixuState?.getState?.() || {};
      const prefs = Object.assign({}, DEFAULTS, state.userPreferences || {});
      this.syncUI(prefs);
    },

    syncUI(prefs) {
      const maskRange = $('#pref-bg-mask');
      const maskVal = $('#pref-bg-mask-val');
      const fontRange = $('#pref-story-font-size');
      const fontVal = $('#pref-story-font-size-val');
      const fitSelect = $('#pref-bg-fit-mode');
      const bgSelect = $('#pref-bg-select');

      // 新增：颜色与字体 UI
      const storyColorInput = $('#pref-story-font-color');
      const storyColorVal = $('#pref-story-font-color-val');
      const storyDefaultColorInput = $('#pref-story-default-color');
      const storyDefaultColorVal = $('#pref-story-default-color-val');
      const storyQuoteColorInput = $('#pref-story-quote-color');
      const storyQuoteColorVal = $('#pref-story-quote-color-val');
      const thinkingTextColorInput = $('#pref-thinking-text-color');
      const thinkingTextColorVal = $('#pref-thinking-text-color-val');
      const thinkingBgOpacityRange = $('#pref-thinking-bg-opacity');
      const thinkingBgOpacityVal = $('#pref-thinking-bg-opacity-val');
      const guidelineTextColorInput = $('#pref-guideline-text-color');
      const guidelineTextColorVal = $('#pref-guideline-text-color-val');
      const guidelineBgOpacityRange = $('#pref-guideline-bg-opacity');
      const guidelineBgOpacityVal = $('#pref-guideline-bg-opacity-val');
      const fontNameEl = $('#pref-font-name');
      const qualityRange = $('#pref-bg-quality');
      const qualityVal = $('#pref-bg-quality-val');
      const keepSizeCheckbox = $('#pref-bg-keep-size');

      // 当前选择从 prefs 解析（lorebook://COMMENT）
      const urlVal = String(prefs.backgroundUrl || '');
      let selectedComment = '';
      if (urlVal.startsWith('lorebook://')) {
        selectedComment = urlVal.slice('lorebook://'.length);
      }

      if (fitSelect) fitSelect.value = String(prefs.bgFitMode || 'cover');
      if (maskRange) maskRange.value = String(clamp(prefs.bgMaskOpacity, 0, 0.8));
      if (maskVal) maskVal.textContent = String(clamp(prefs.bgMaskOpacity, 0, 0.8).toFixed(2));
      if (fontRange) fontRange.value = String(clamp(prefs.storyFontSize, 12, 20));
      if (fontVal) fontVal.textContent = `${Math.round(clamp(prefs.storyFontSize, 12, 20))}px`;

      // 正文颜色（特殊标注文本基础色）
      const color = String(prefs.storyFontColor || DEFAULTS.storyFontColor);
      if (storyColorInput) storyColorInput.value = color;
      if (storyColorVal) storyColorVal.textContent = color.toUpperCase();

      // 默认正文颜色（未被特殊着色包裹）
      const defaultColor = String(prefs.storyDefaultColor || prefs.storyFontColor || DEFAULTS.storyFontColor);
      if (storyDefaultColorInput) storyDefaultColorInput.value = defaultColor;
      if (storyDefaultColorVal) storyDefaultColorVal.textContent = defaultColor.toUpperCase();

      // 引号文本颜色（“...”/「...」）
      const quoteColor = String(prefs.storyQuoteColor || DEFAULTS.storyQuoteColor);
      if (storyQuoteColorInput) storyQuoteColorInput.value = quoteColor;
      if (storyQuoteColorVal) storyQuoteColorVal.textContent = quoteColor.toUpperCase();

      // 思维链颜色与背景透明度
      const thinkColor = String(prefs.thinkingTextColor || DEFAULTS.thinkingTextColor);
      if (thinkingTextColorInput) thinkingTextColorInput.value = thinkColor;
      if (thinkingTextColorVal) thinkingTextColorVal.textContent = thinkColor.toUpperCase();

      const tbg = Math.min(1, Math.max(0, Number(prefs.thinkingBgOpacity ?? DEFAULTS.thinkingBgOpacity)));
      if (thinkingBgOpacityRange) thinkingBgOpacityRange.value = String(tbg);
      if (thinkingBgOpacityVal) thinkingBgOpacityVal.textContent = tbg.toFixed(2);

      // 行动选项颜色与背景透明度
      const gcolor = String(prefs.guidelineTextColor || DEFAULTS.guidelineTextColor);
      if (guidelineTextColorInput) guidelineTextColorInput.value = gcolor;
      if (guidelineTextColorVal) guidelineTextColorVal.textContent = gcolor.toUpperCase();

      const gbg = Math.min(1, Math.max(0, Number(prefs.guidelineBgOpacity ?? DEFAULTS.guidelineBgOpacity)));
      if (guidelineBgOpacityRange) guidelineBgOpacityRange.value = String(gbg);
      if (guidelineBgOpacityVal) guidelineBgOpacityVal.textContent = gbg.toFixed(2);

      // 字体名称/数据
      this._tempFontName = String(prefs.customFontName || '');
      this._tempFontDataUrl = String(prefs.customFontDataUrl || '');
      if (fontNameEl) fontNameEl.textContent = this._tempFontName || '（未选择）';

      // 背景压缩质量与保留原尺寸
      const q = Math.min(1, Math.max(0.6, Number(prefs.bgCompressQuality ?? DEFAULTS.bgCompressQuality)));
      if (qualityRange) qualityRange.value = String(q);
      if (qualityVal) qualityVal.textContent = q.toFixed(2);
      if (keepSizeCheckbox) keepSizeCheckbox.checked = !!(prefs.bgKeepSize ?? DEFAULTS.bgKeepSize);

      this._selectedComment = selectedComment;

      // 在刷新列表后设值更稳妥，这里先预置选中值
      if (bgSelect) {
        bgSelect.value = selectedComment || '';
      }


      // 流式输出开关回显
      try {
        const streamingCheckbox = document.getElementById('pref-streaming-enabled');
        if (streamingCheckbox) {
          const st = window.GuixuState?.getState?.();
          streamingCheckbox.checked = !!(st && st.isStreamingEnabled);
        }
      } catch (_) {}
    },

    readValues() {
      const maskRange = $('#pref-bg-mask');
      const fontRange = $('#pref-story-font-size');
      const bgMaskOpacity = clamp(maskRange?.value || DEFAULTS.bgMaskOpacity, 0, 0.8);
      const storyFontSize = Math.round(clamp(fontRange?.value || DEFAULTS.storyFontSize, 12, 20));
      const bgFitMode = String(($('#pref-bg-fit-mode')?.value) || DEFAULTS.bgFitMode);
      const storyFontColor = String(($('#pref-story-font-color')?.value) || DEFAULTS.storyFontColor);
      const storyDefaultColor = String(($('#pref-story-default-color')?.value) || DEFAULTS.storyDefaultColor || storyFontColor);
      const storyQuoteColor = String(($('#pref-story-quote-color')?.value) || DEFAULTS.storyQuoteColor);
      const thinkingTextColor = String(($('#pref-thinking-text-color')?.value) || DEFAULTS.thinkingTextColor);
      const thinkingBgOpacity = Math.min(1, Math.max(0, Number($('#pref-thinking-bg-opacity')?.value ?? DEFAULTS.thinkingBgOpacity)));
      const guidelineTextColor = String(($('#pref-guideline-text-color')?.value) || DEFAULTS.guidelineTextColor);
      const guidelineBgOpacity = Math.min(1, Math.max(0, Number($('#pref-guideline-bg-opacity')?.value ?? DEFAULTS.guidelineBgOpacity)));

      const selectedComment = String($('#pref-bg-select')?.value || this._selectedComment || '');
      const backgroundUrl = selectedComment ? `lorebook://${selectedComment}` : '';


      const customFontName = String(this._tempFontName || DEFAULTS.customFontName);
      const customFontDataUrl = String(this._tempFontDataUrl || DEFAULTS.customFontDataUrl);
      const bgCompressQuality = Math.min(1, Math.max(0.6, Number($('#pref-bg-quality')?.value ?? DEFAULTS.bgCompressQuality)));
      const bgKeepSize = !!($('#pref-bg-keep-size')?.checked);

      return { backgroundUrl, bgMaskOpacity, storyFontSize, storyFontColor, storyDefaultColor, storyQuoteColor, thinkingTextColor, thinkingBgOpacity, guidelineTextColor, guidelineBgOpacity, bgFitMode, customFontName, customFontDataUrl, bgCompressQuality, bgKeepSize };
    },

    applyPreview(prefs) {
      // 仅作为预览，不写入状态
      window.GuixuMain?.applyUserPreferences?.(prefs);
    },

    // 持久化到酒馆全局变量（跨设备漫游）
    async persistToRoaming(prefs) {
      if (!prefs) return;
      try {
        if (window.TavernHelper && typeof window.TavernHelper.insertOrAssignVariables === 'function') {
          await window.TavernHelper.insertOrAssignVariables(
            { Guixu: { userPreferences: prefs } },
            { type: 'global' }
          );
        }
      } catch (e) {
        throw e;
      }
    },

    // 加载以“归墟背景/”为前缀的所有世界书条目
    async loadBackgroundEntries() {
      const bookName = window.GuixuConstants?.LOREBOOK?.NAME;
      if (!bookName || !window.GuixuAPI) return [];
      const entries = await window.GuixuAPI.getLorebookEntries(bookName);
      const list = Array.isArray(entries) ? entries.filter(e => (e.comment || '').startsWith(BG_PREFIX)) : [];
      this._bgEntriesCache = list;
      return list;
    },

    // 刷新下拉列表并同步当前选中项
    async refreshBackgroundList() {
      const entries = await this.loadBackgroundEntries();
      // 若当前未选择且存在条目，默认选择第一张
      if (!this._selectedComment && Array.isArray(entries) && entries.length > 0) {
        this._selectedComment = String(entries[0].comment || '');
        const sel = document.getElementById('pref-bg-select');
        if (sel) sel.value = this._selectedComment;
      }
      this.populateSelectOptions(entries, this._selectedComment);
      await this.updatePreviewByComment(this._selectedComment);
      // 默认选择时，立即将背景应用到主容器（未保存，仅预览）
      try { this.applyPreview(this.readValues()); } catch(_) {}
    },

    // 将 entries 渲染到选择框
    populateSelectOptions(entries, selectedComment = '') {
      const sel = $('#pref-bg-select');
      if (!sel) return;
      sel.innerHTML = '';
      const optNone = document.createElement('option');
      optNone.value = '';
      optNone.textContent = '（未选择）';
      sel.appendChild(optNone);

      entries.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.comment || '';
        // 标签使用去前缀后的名字，找不到则用完整 comment
        let label = opt.value.startsWith(BG_PREFIX) ? opt.value.slice(BG_PREFIX.length) : opt.value;
        if (!label) label = opt.value;
        opt.textContent = label;
        sel.appendChild(opt);
      });

      sel.value = selectedComment || '';
    },

    // 将选中的 comment 的缩略图设置到预览框
    async updatePreviewByComment(comment) {
      const previewEl = $('#pref-bg-preview');
      if (!previewEl) return;
      if (!comment) {
        previewEl.style.setProperty('--gx-bg-preview-image', 'none');
        return;
      }
      const target = this._bgEntriesCache.find(e => (e.comment || '') === comment);
      const dataUrl = target?.content || '';
      previewEl.style.setProperty('--gx-bg-preview-image', dataUrl ? `url("${dataUrl}")` : 'none');
    },

    // 上传并创建新世界书条目（不会覆盖已有）
    async uploadBackground() {
      try {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.className = 'u-hidden';

        const once = () => new Promise((resolve) => {
          fileInput.addEventListener('change', () => resolve(), { once: true });
        });

        document.body.appendChild(fileInput);
        fileInput.click();
        await once();

        const file = fileInput.files?.[0];
        setTimeout(() => fileInput.remove(), 1000);
        if (!file) return;

        try { window.GuixuHelpers?.showTemporaryMessage?.('正在读取并压缩图片...'); } catch(_) {}

        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const prefsNow = this.readValues();
        const compressed = await this.compressDataUrl(
          dataUrl,
          {
            maxWidth: prefsNow.bgKeepSize ? 0 : 1920,
            maxHeight: prefsNow.bgKeepSize ? 0 : 1080,
            quality: Math.min(1, Math.max(0.6, Number(prefsNow.bgCompressQuality ?? DEFAULTS.bgCompressQuality))),
            mime: 'image/webp'
          }
        );

        const bookName = window.GuixuConstants?.LOREBOOK?.NAME;
        if (!bookName || !window.GuixuAPI) throw new Error('世界书API不可用');

        // 生成唯一 comment：归墟背景/<文件名或时间戳>(-n)
        const baseName = (file.name || `背景_${Date.now()}`).replace(/\.[^.]+$/, '');
        const entries = await this.loadBackgroundEntries();
        const existingComments = new Set(entries.map(e => e.comment || ''));
        const uniqueComment = this.makeUniqueComment(baseName, existingComments);

        await window.GuixuAPI.createLorebookEntries(bookName, [{
          comment: uniqueComment,
          content: compressed,
          keys: [uniqueComment],
          enabled: false,
          position: 'before_character_definition',
          order: 6
        }]);

        try { window.GuixuHelpers?.showTemporaryMessage?.('背景上传成功'); } catch(_) {}

        // 刷新列表并选中新条目
        await this.refreshBackgroundList();
        const sel = $('#pref-bg-select');
        if (sel) sel.value = uniqueComment;
        this._selectedComment = uniqueComment;
        await this.updatePreviewByComment(uniqueComment);
        this.applyPreview(this.readValues());
      } catch (e) {
        console.warn('[归墟][设置中心] 上传背景失败：', e);
        try { window.GuixuHelpers?.showTemporaryMessage?.('上传失败'); } catch(_) {}
      }
    },

    // 删除指定 comment 的条目
    async deleteBackgroundEntry(comment) {
      const bookName = window.GuixuConstants?.LOREBOOK?.NAME;
      if (!bookName || !window.GuixuAPI || !comment) return;

      // 找 uid
      const entries = await window.GuixuAPI.getLorebookEntries(bookName);
      const target = entries.find(e => (e.comment || '') === comment);
      if (!target) throw new Error('未找到对应条目');
      await window.GuixuAPI.deleteLorebookEntries(bookName, [target.uid]);
    },

    // 基于现有 comment 集合生成唯一 comment
    makeUniqueComment(baseName, existingComments) {
      const sanitize = (s) => String(s || '').trim().replace(/[\/\\?%*:|"<>]/g, '_');
      const base = `${BG_PREFIX}${sanitize(baseName)}`;
      if (!existingComments.has(base)) return base;
      let i = 2;
      while (true) {
        const candidate = `${base}-${i}`;
        if (!existingComments.has(candidate)) return candidate;
        i += 1;
      }
    },

    // 将 dataURL 压缩到指定尺寸/质量，尽量使用 WebP，回退 JPEG
    async compressDataUrl(dataUrl, { maxWidth = 1920, maxHeight = 1080, quality = 0.82, mime = 'image/webp' } = {}) {
      try {
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = dataUrl;
        });
        let { width, height } = img;
        let scale = 1;
        if (Number(maxWidth) > 0 && Number(maxHeight) > 0) {
          scale = Math.min(1, maxWidth / width, maxHeight / height);
        }
        const targetW = Math.max(1, Math.round(width * scale));
        const targetH = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let out = '';
        try {
          out = canvas.toDataURL(mime, quality);
        } catch (_) {
          out = '';
        }
        if (!out || out.length >= dataUrl.length) {
          // 回退到 JPEG，并比较大小，择优
          const jpeg = canvas.toDataURL('image/jpeg', quality);
          if (jpeg && jpeg.length < (out || '').length) out = jpeg;
          if (!out) out = jpeg || dataUrl;
        }
        return out;
      } catch (e) {
        console.warn('[归墟][设置中心] compressDataUrl 失败，回退原图:', e);
        return dataUrl;
      }
    },
  };

  window.SettingsComponent = SettingsComponent;
})(window);
