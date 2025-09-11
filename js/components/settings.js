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
    bgKeepSize: false,      // 保留原始尺寸（不缩放）
    // 移动端悬浮按钮尺寸（像素）
    mobileFabSize: 44,
    // 新增：功能面板按钮隐藏配置（key 为按钮ID，true 表示隐藏）
    hiddenFunctionButtons: {}
  });

  function clamp(num, min, max) {
    const n = Number(num);
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  // 新前缀：优先使用全局常量中的“【背景图片】”；兼容旧版“归墟背景/”
  const BG_PREFIX = String(window.GuixuConstants?.BACKGROUND?.PREFIX || '【背景图片】');
  const BG_LEGACY_PREFIXES = Array.isArray(window.GuixuConstants?.BACKGROUND?.LEGACY_PREFIXES)
    ? window.GuixuConstants.BACKGROUND.LEGACY_PREFIXES
    : ['归墟背景/'];
  // 判断是否为背景条目（兼容新旧前缀）
  const isBgEntry = (comment) => {
    const c = String(comment || '');
    if (!c) return false;
    if (c.startsWith(BG_PREFIX)) return true;
    return BG_LEGACY_PREFIXES.some(p => c.startsWith(p));
  };
  // 去掉背景前缀（兼容新旧前缀）
  const stripBgPrefix = (comment) => {
    let s = String(comment || '');
    if (s.startsWith(BG_PREFIX)) return s.slice(BG_PREFIX.length);
    for (const p of BG_LEGACY_PREFIXES) {
      if (s.startsWith(p)) return s.slice(p.length);
    }
    return s;
  };
  // 新增：功能面板按钮清单（右侧交互面板）。不包含“设置中心”，避免误隐藏导致无法再打开设置。
  const FUNC_BUTTONS = Object.freeze([
    { id: 'btn-inventory', label: '背包' },
    { id: 'btn-relationships', label: '人物关系' },
    { id: 'btn-command-center', label: '指令中心' },
    { id: 'btn-guixu-system', label: '归墟系统' },
    { id: 'btn-variable-manager', label: '变量编辑器' },
    { id: 'btn-show-extracted', label: '查看提取内容' },
    { id: 'btn-save-load-manager', label: '存档/读档' },
    { id: 'btn-intro-guide', label: '游玩指南' },
  ]);
  
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
            <div class="attributes-list" style="padding: 10px;">
              <!-- 1) 纯正文颜色（未被任何符号包裹） -->
              <div class="attribute-item" style="gap:10px; align-items:center;">
                <span class="attribute-name" style="min-width:90px;">正文颜色</span>
                <input id="pref-story-default-color" type="color" value="#e0dcd1" style="width:44px; height:28px; padding:0; background:transparent; border:1px solid #8b7355; border-radius: 4px;">
                <span id="pref-story-default-color-val" class="attribute-value">#e0dcd1</span>
              </div>
              <!-- 2) 方括号文本颜色（【…】等特殊文本，映射 text-scenery） -->
              <div class="attribute-item" style="gap:10px; align-items:center;">
                <span class="attribute-name" style="min-width:90px;">方括号文本颜色</span>
                <input id="pref-story-font-color" type="color" value="#e0dcd1" style="width:44px; height:28px; padding:0; background:transparent; border:1px solid #8b7355; border-radius: 4px;">
                <span id="pref-story-font-color-val" class="attribute-value">#e0dcd1</span>
              </div>
              <div class="attribute-item" style="gap:10px; align-items:center;">
                <span class="attribute-name" style="min-width:90px;">引号文本颜色</span>
                <input id="pref-story-quote-color" type="color" value="#ff4d4f" style="width:44px; height:28px; padding:0; background:transparent; border:1px solid #8b7355; border-radius: 4px;">
                <span id="pref-story-quote-color-val" class="attribute-value">#FF4D4F</span>
              </div>
              <div class="attribute-item" style="gap:10px; align-items:center;">
                <span class="attribute-name" style="min-width:90px;">思维链文字颜色</span>
                <input id="pref-thinking-text-color" type="color" value="#e0dcd1" style="width:44px; height:28px; padding:0; background:transparent; border:1px solid #8b7355; border-radius: 4px;">
                <span id="pref-thinking-text-color-val" class="attribute-value">#E0DCD1</span>
              </div>
              <div class="attribute-item" style="gap:10px; align-items:center;">
                <span class="attribute-name" style="min-width:90px;">思维链背景透明</span>
                <input id="pref-thinking-bg-opacity" type="range" min="0" max="1" step="0.05" value="0.85" style="width:160px;">
                <span id="pref-thinking-bg-opacity-val" class="attribute-value">0.85</span>
              </div>
              <!-- 3) 行动选项（按钮）颜色与背景透明度 -->
              <div class="attribute-item" style="gap:10px; align-items:center;">
                <span class="attribute-name" style="min-width:90px;">行动选项文字</span>
                <input id="pref-guideline-text-color" type="color" value="#e0dcd1" style="width:44px; height:28px; padding:0; background:transparent; border:1px solid #8b7355; border-radius: 4px;">
                <span id="pref-guideline-text-color-val" class="attribute-value">#E0DCD1</span>
              </div>
              <div class="attribute-item" style="gap:10px; align-items:center;">
                <span class="attribute-name" style="min-width:90px;">行动选项背景</span>
                <input id="pref-guideline-bg-opacity" type="range" min="0" max="1" step="0.05" value="0.60" style="width:160px;">
                <span id="pref-guideline-bg-opacity-val" class="attribute-value">0.60</span>
              </div>
              <div class="attribute-item" style="gap:8px; align-items:center; flex-wrap: wrap;">
                <span class="attribute-name" style="min-width:90px;">自定义字体</span>
                <button id="pref-font-upload" class="interaction-btn" style="padding: 4px 8px; font-size: 12px;">本地上传</button>
                <button id="pref-font-clear" class="interaction-btn danger-btn" style="padding: 4px 8px; font-size: 12px;">清除字体</button>
                <span id="pref-font-name" class="attribute-value" style="min-width: 120px;">（未选择）</span>
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

      // 新增：移动端悬浮按钮尺寸设置面板
      try {
        const modalBody = overlay?.querySelector('.modal-body');
        if (modalBody && !document.getElementById('panel-mobile-fab')) {
          const panel = document.createElement('div');
          panel.className = 'panel-section';
          panel.id = 'panel-mobile-fab';
          panel.innerHTML = `
            <div class="section-title">移动端悬浮按钮大小</div>
            <div class="attributes-list" style="padding:10px;">
              <div class="attribute-item" style="gap:10px; align-items:center;">
                <span class="attribute-name" style="min-width:120px;">按钮尺寸</span>
                <input id="pref-mobile-fab-size" type="range" min="32" max="80" step="1" value="44" style="width:200px;">
                <span id="pref-mobile-fab-size-val" class="attribute-value">44px</span>
              </div>
            </div>
          `;
          // 插入在“功能面板按钮”面板之前；若不存在则追加在“正文字体与颜色”面板之后
          const functionPanel = document.getElementById('panel-function-buttons');
          if (functionPanel && functionPanel.parentElement === modalBody) {
            modalBody.insertBefore(panel, functionPanel);
          } else {
            const afterFontPanel = modalBody.querySelector('#panel-story-font-color')?.closest('.panel-section');
            if (afterFontPanel && afterFontPanel.nextSibling) {
              modalBody.insertBefore(panel, afterFontPanel.nextSibling);
            } else {
              modalBody.appendChild(panel);
            }
          }
          try {
            const title = panel.querySelector('.section-title');
            attachInfoIcon(title, '用于调整移动端右下角三个悬浮按钮（角色/功能/设置）的大小。范围 32-80 像素。');
          } catch (_) {}
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

      // 悬浮按钮大小
      const fabSizeRange = $('#pref-mobile-fab-size');
      const fabSizeVal = $('#pref-mobile-fab-size-val');
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

      // 悬浮按钮大小实时预览
      fabSizeRange?.addEventListener('input', () => {
        const v = Math.min(80, Math.max(32, Number(fabSizeRange.value ?? DEFAULTS.mobileFabSize)));
        if (fabSizeVal) fabSizeVal.textContent = `${Math.round(v)}px`;
        this.applyPreview(this.readValues());
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
          input.style.display = 'none';
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
        // 提升层级：高于所有模态(10080)与自定义确认(10100)，确保问号说明不被设置面板等遮挡
        tip.style.cssText = 'position: fixed; z-index: 10110; max-width: 260px; padding: 8px 10px; background: rgba(15,15,35,0.96); color: #e0dcd1; border: 1px solid #8b7355; border-radius: 6px; font-size: 12px; line-height: 1.5; display: none; box-shadow: 0 6px 16px rgba(0,0,0,0.45);';
        (document.querySelector('.guixu-root-container') || document.body).appendChild(tip);
      };
      const showInfoTooltip = (ev, text) => {
        ensureInfoTooltipInfra();
        const tip = document.getElementById('guixu-info-tooltip');
        if (!tip) return;
        tip.textContent = String(text || '');
        tip.style.display = 'block';
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
            tip.style.display = 'none';
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
        icon.style.marginLeft = '8px';
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
          { selector: '.panel-section .section-title', match: '流式输出', text: '启用后采用流式请求，并实时在正文窗口渲染增量内容；生成完成后仍会写入并以最终文本替换预览。' },
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

      // 保存并关闭（仅保存到浏览器本地缓存，不再写入世界书）
      btnSaveClose?.addEventListener('click', async () => {
        const prefs = this.readValues();
        try {
          // 保存到全局状态；state.js 已将 userPreferences 持久化到 localStorage
          window.GuixuState?.update?.('userPreferences', prefs);
        } catch (e) {
          console.warn('[归墟][设置中心] 保存 userPreferences 失败:', e);
        }
        // 立即应用到当前界面（无需刷新）
        try { window.GuixuMain?.applyUserPreferences?.(prefs); } catch (_) {}
        // 提示：仅本地保存
        try { window.GuixuHelpers?.showTemporaryMessage?.('设置已保存到本地，刷新后仍生效'); } catch (_) {}
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
            <div class="section-title">流式输出</div>
            <div class="attributes-list" style="padding: 10px;">
              <div class="attribute-item" style="gap:10px; align-items:center;">
                <input id="pref-streaming-enabled" type="checkbox" />
                <label for="pref-streaming-enabled" class="auto-write-label">流式输出开关（实时渲染）</label>
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
            // 更新说明：启用后将以流式请求的方式实时把增量文本渲染到正文窗口中
            attachInfoIcon(streamingTitle, '启用后采用流式请求，并实时在正文窗口渲染增量内容；生成完成后仍会写入并以最终文本替换预览。');
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

      // 新增：功能面板按钮隐藏设置面板（移动/桌面通用）
      try {
        const modalBody = overlay?.querySelector('.modal-body');
        if (modalBody && !document.getElementById('panel-function-buttons')) {
          const panel = document.createElement('div');
          panel.className = 'panel-section';
          panel.id = 'panel-function-buttons';

          const title = document.createElement('div');
          title.className = 'section-title';
          title.textContent = '功能面板按钮';

          const list = document.createElement('div');
          list.className = 'attributes-list';
          list.style.padding = '10px';

          // 生成复选框：勾选表示“隐藏该按钮”
          FUNC_BUTTONS.forEach(btn => {
            const row = document.createElement('div');
            row.className = 'attribute-item';
            row.style.cssText = 'gap:10px; align-items:center;';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = `pref-hide-${btn.id}`;

            const label = document.createElement('label');
            label.className = 'auto-write-label';
            label.setAttribute('for', input.id);
            label.textContent = `隐藏「${btn.label}」按钮`;

            // 变更即预览
            input.addEventListener('change', () => this.applyPreview(this.readValues()));

            row.appendChild(input);
            row.appendChild(label);
            list.appendChild(row);
          });

          panel.appendChild(title);
          panel.appendChild(list);

          // 插入在“流式请求”面板之后更合理
          const streamPanel = document.getElementById('panel-streaming-toggle');
          if (streamPanel && streamPanel.parentElement === modalBody) {
            if (streamPanel.nextSibling) modalBody.insertBefore(panel, streamPanel.nextSibling);
            else modalBody.appendChild(panel);
          } else {
            modalBody.appendChild(panel);
          }

          try { attachInfoIcon(title, '勾选后将从右侧功能面板隐藏对应按钮（移动端与桌面端均生效）。'); } catch (_) {}
        }
      } catch (_) {}

      // 初始化预览容器样式兜底（若CSS未定义）
      if (previewEl && !previewEl.style.minHeight) {
        previewEl.style.minHeight = '120px';
        previewEl.style.background = 'rgba(0,0,0,0.3)';
        previewEl.style.border = '1px solid #8b7355';
        previewEl.style.borderRadius = '4px';
        previewEl.style.backgroundSize = 'cover';
        previewEl.style.backgroundPosition = 'center';
        previewEl.style.backgroundRepeat = 'no-repeat';
      }
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

      // 悬浮按钮大小
      const fabSize = Math.min(80, Math.max(32, Number(prefs.mobileFabSize ?? DEFAULTS.mobileFabSize)));
      if (document.getElementById('pref-mobile-fab-size')) {
        document.getElementById('pref-mobile-fab-size').value = String(fabSize);
      }
      if (document.getElementById('pref-mobile-fab-size-val')) {
        document.getElementById('pref-mobile-fab-size-val').textContent = `${Math.round(fabSize)}px`;
      }
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

     // 新增：功能面板按钮隐藏复选框回显
     try {
       const hiddenMap = (prefs && prefs.hiddenFunctionButtons) ? prefs.hiddenFunctionButtons : {};
       FUNC_BUTTONS.forEach(b => {
         const cb = document.getElementById(`pref-hide-${b.id}`);
         if (cb) cb.checked = !!hiddenMap[b.id];
       });
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
      const mobileFabSize = Math.min(80, Math.max(32, Number($('#pref-mobile-fab-size')?.value ?? DEFAULTS.mobileFabSize)));
      // 新增：功能面板按钮隐藏配置（勾选表示隐藏）
      const hiddenFunctionButtons = {};
      try {
        FUNC_BUTTONS.forEach(b => {
          const el = document.getElementById(`pref-hide-${b.id}`);
          if (el && el.checked) hiddenFunctionButtons[b.id] = true;
        });
      } catch (_) {}

      return { backgroundUrl, bgMaskOpacity, storyFontSize, storyFontColor, storyDefaultColor, storyQuoteColor, thinkingTextColor, thinkingBgOpacity, guidelineTextColor, guidelineBgOpacity, bgFitMode, customFontName, customFontDataUrl, bgCompressQuality, bgKeepSize, mobileFabSize, hiddenFunctionButtons };
    },

    applyPreview(prefs) {
      // 仅作为预览，不写入状态
      window.GuixuMain?.applyUserPreferences?.(prefs);
    },


    // 加载以“【背景图片】”为前缀的所有世界书条目（兼容旧版“归墟背景/”）
    async loadBackgroundEntries() {
      const bookName = window.GuixuConstants?.LOREBOOK?.NAME;
      if (!bookName || !window.GuixuAPI) return [];
      const entries = await window.GuixuAPI.getLorebookEntries(bookName);
      const list = Array.isArray(entries) ? entries.filter(e => isBgEntry(e.comment)) : [];
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
        // 标签使用去前缀后的名字（兼容新旧前缀），找不到则用完整 comment
        let label = stripBgPrefix(opt.value);
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
        previewEl.style.backgroundImage = '';
        return;
      }
      const target = this._bgEntriesCache.find(e => (e.comment || '') === comment);
      const dataUrl = target?.content || '';
      previewEl.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : '';
    },

    // 上传并创建新世界书条目（不会覆盖已有）
    async uploadBackground() {
      try {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';

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

        // 生成唯一 comment：前缀 + 原始文件名（不含扩展名）；若冲突自动追加 -n
        // 说明：优先使用用户选择的文件名，避免出现随机数字命名
        const rawName = String(file.name || '').split(/[/\\]/).pop(); // 处理 fakepath
        const noExt = rawName.replace(/\.[^.]+$/, '');                // 去掉扩展名
        const normalized = noExt
          .replace(/\s+/g, '_')                                       // 空白 -> 下划线
          .replace(/[\/\\?%*:|"<>\[\]{}\(\)]/g, '_')                  // 非法字符置换
          .replace(/_+/g, '_')                                        // 合并多余下划线
          .replace(/^_+|_+$/g, '');                                   // 去首尾下划线
        // 若文件名为空或仅包含非法字符，则回退到时间戳（避免随机数）
        const ts = (() => { const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; })();
        const baseName = normalized || `背景_${ts}`;
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
      // 更稳健的清洗：保留中英文、数字与下划线/短横线；其它替换成下划线并规整
      const sanitize = (s) => String(s || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[\/\\?%*:|"<>\[\]{}\(\)]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
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
