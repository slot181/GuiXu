(function (window) {
  'use strict';

  const STORAGE_KEY = 'guixu_intro_v1_shown';

  const IntroModalComponent = {
    ensure() {
      try {
        let overlay = document.getElementById('intro-modal');
        if (overlay) return overlay;

        const root = document.querySelector('.guixu-root-container') || document.body;

        // 外层遮罩（沿用 .modal-overlay 风格）
        overlay = document.createElement('div');
        overlay.id = 'intro-modal';
        overlay.className = 'modal-overlay';
        // 置顶以避免被其他浮层挡住（高于移动端FAB与菜单 10060/10065）
        overlay.style.zIndex = '10080';

        // 内容容器（遵循 .modal-content 风格，适度收窄）
        const content = document.createElement('div');
        // 使用通用模态尺寸，保持与其他桌面端面板一致
        content.className = 'modal-content';

        // 头部
        const header = document.createElement('div');
        header.className = 'modal-header';

        const titleEl = document.createElement('div');
        titleEl.className = 'modal-title';
        titleEl.textContent = '支持与游玩指南';

        const closeBtn = document.createElement('button');
        closeBtn.id = 'intro-close-btn';
        closeBtn.className = 'modal-close-btn';
        closeBtn.innerHTML = '&times;';

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // 主体
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.innerHTML = `
          <div class="panel-section">
            <div class="section-title">快速上手</div>
            <ol class="intro-ol">
              <li>底部输入区输入后点击“发送”即可与伟大梦星交流。</li>
              <li>右上角按钮可在<strong>移动端/桌面端</strong>间切换；移动端有悬浮“角色/功能/设置”按钮。</li>
              <li>点击右上角“⛶”进入全屏（横屏设备下更沉浸）。退出全屏后将自动恢复视图布局。</li>
            </ol>
          </div>

          <div class="panel-section">
            <div class="section-title">重要注意事项</div>
            <ol class="intro-ol">
              <li><strong>首次导入（必做）</strong>：第一次导入本卡，请务必先<strong>清理酒馆的浏览器缓存</strong>，以确保所有内容正常加载。</li>
              <li><strong>加载与刷新（必读）</strong>：开新档界面空白，请先点击<strong>“一键刷新”</strong>。当系统提示刷新时，<strong>请务必刷新整个浏览器页面</strong>，直接点“确定”极易卡死。</li>
              <li><strong>网络要求</strong>：系统脚本通过<strong>JsDelivr</strong>加载，请务必保持良好的网络连接，否则可能导致功能异常。</li>
              <li><strong>存档管理</strong>：开启新档可通过修改“读写序号”或使用“<strong>一键清除所有存档</strong>”功能。若读档后发现数据遗漏，请尝试<strong>重新读取一遍该存档</strong>。</li>
            </ol>
          </div>

          <div class="panel-section">
            <div class="section-title">常见问题排查</div>
            <ol class="intro-ol">
              <li><strong>UI渲染错乱</strong>：若UI渲染错乱，请尝试点击右上角小铅笔，检查<strong>UpdateVariable</strong>标签是否存在。</li>
              <li><strong>正文错乱</strong>：如正文出现变量代码，请使用<strong>编辑功能（小铅笔）</strong>检查，确保正文被<strong>gametxt</strong>标签完整包裹。若问题依旧，请优先手动删除思维链里的所有内容。</li>
              <li><strong>行动选项</strong>：若正文没有行动选项按钮，请同样检查并确保该选项被<strong>action</strong>标签正确包裹。若无效，处理方法同上。</li>
            </ol>
          </div>

          <div class="panel-section">
            <div class="section-title">支持作者</div>
            <ol class="intro-ol">
              <li>喜欢本项目，欢迎到 <a href="https://github.com/slot181/GuiXu" target="_blank" rel="noopener noreferrer">GitHub 仓库</a> 点赞并分享给朋友。</li>
              <li>在使用中遇到任何问题，可来 Discord 提出你的问题 <a href="https://discord.com/channels/1134557553011998840/1395002325751300227" target="_blank" rel="noopener noreferrer">原贴讨论</a>。</li>
              <li>最后，赞美梦星！</li>
            </ol>
          </div>

          <label class="intro-dont-show">
            <input id="intro-dont-show" type="checkbox" checked />
            <span>下次不再提示</span>
          </label>
        `;

        // 底部按钮区（复用 command-center-footer 风格以统一）
        const footer = document.createElement('div');
        footer.className = 'confirm-modal-buttons';
        footer.style.marginTop = '16px';
        const okBtn = document.createElement('button');
        okBtn.id = 'intro-ok-btn';
        okBtn.className = 'interaction-btn primary-btn';
        okBtn.textContent = '立即开始';

        const laterBtn = document.createElement('button');
        laterBtn.id = 'intro-later-btn';
        laterBtn.className = 'interaction-btn';
        laterBtn.textContent = '稍后再看';

        footer.appendChild(laterBtn);
        footer.appendChild(okBtn);

        // 组装
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        overlay.appendChild(content);
        root.appendChild(overlay);

        // 行为：关闭/确认
        const closeOverlay = (persist) => {
          try {
            if (overlay && overlay.dataset && overlay.dataset.allowClose === '0') return;
            const dont = document.getElementById('intro-dont-show');
            if (persist && dont && dont.checked) {
              try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
            }
            overlay.style.display = 'none';
          } catch (_) {}
        };
        closeBtn.addEventListener('click', () => closeOverlay(true));
        okBtn.addEventListener('click', () => closeOverlay(true));
        laterBtn.addEventListener('click', () => closeOverlay(false));

        return overlay;
      } catch (e) {
        console.warn('[归墟] IntroModalComponent.ensure 失败:', e);
        return null;
      }
    },

    show() {
      try {
        this.ensure();
        if (window.GuixuBaseModal && typeof window.GuixuBaseModal.open === 'function') {
          window.GuixuBaseModal.open('intro-modal');
        } else {
          // 后备：直接显示
          const overlay = document.getElementById('intro-modal');
          if (overlay) overlay.style.display = 'flex';
        }
      } catch (e) {
        console.warn('[归墟] IntroModalComponent.show 失败:', e);
      }
    },

    showFirstTimeIfNeeded(delayMs = 300) {
      try {
        const shown = localStorage.getItem(STORAGE_KEY) === '1';
        if (shown) return;
        // 延时展示，等待布局稳定与宿主样式应用
        setTimeout(() => {
          this.show();
          try { this.lockCloseFor(5000); } catch (_) {}
        }, Math.max(0, delayMs|0));
      } catch (e) {
        console.warn('[归墟] IntroModalComponent.showFirstTimeIfNeeded 失败:', e);
      }
    },
    // 锁定首次弹窗关闭，倒计时期间禁止关闭
    lockCloseFor(ms = 5000) {
      try {
        const overlay = document.getElementById('intro-modal') || this.ensure();
        if (!overlay) return;
        overlay.dataset.allowClose = '0';
        const closeBtn = overlay.querySelector('#intro-close-btn');
        const okBtn = overlay.querySelector('#intro-ok-btn');
        const laterBtn = overlay.querySelector('#intro-later-btn');
        const dont = overlay.querySelector('#intro-dont-show');

        if (closeBtn) closeBtn.style.display = 'none';
        if (okBtn) { okBtn.disabled = true; okBtn.style.pointerEvents = 'none'; }
        if (laterBtn) { laterBtn.disabled = true; laterBtn.style.pointerEvents = 'none'; }
        if (dont) { dont.disabled = true; dont.style.opacity = '0.6'; }

        let remain = Math.max(1, Math.round(ms / 1000));
        const okBase = okBtn ? (okBtn.dataset.baseText || okBtn.textContent || '立即开始') : '立即开始';
        const laterBase = laterBtn ? (laterBtn.dataset.baseText || laterBtn.textContent || '稍后再看') : '稍后再看';
        if (okBtn) okBtn.dataset.baseText = okBase;
        if (laterBtn) laterBtn.dataset.baseText = laterBase;

        const tick = () => {
          if (okBtn) okBtn.textContent = `${okBase}(${remain})`;
          if (laterBtn) laterBtn.textContent = `${laterBase}(${remain})`;
          remain -= 1;
          if (remain < 0) {
            this._unlockIntroLock();
            return;
          }
          this._introLockTimer = setTimeout(tick, 1000);
        };
        clearTimeout(this._introLockTimer);
        this._introLockTimer = setTimeout(tick, 0);
      } catch (_) {}
    },

    _unlockIntroLock() {
      try {
        clearTimeout(this._introLockTimer);
      } catch (_) {}
      try {
        const overlay = document.getElementById('intro-modal');
        if (!overlay) return;
        overlay.dataset.allowClose = '1';
        const closeBtn = overlay.querySelector('#intro-close-btn');
        const okBtn = overlay.querySelector('#intro-ok-btn');
        const laterBtn = overlay.querySelector('#intro-later-btn');
        const dont = overlay.querySelector('#intro-dont-show');

        if (closeBtn) closeBtn.style.display = '';
        if (okBtn) {
          okBtn.disabled = false; okBtn.style.pointerEvents = '';
          if (okBtn.dataset.baseText) okBtn.textContent = okBtn.dataset.baseText;
        }
        if (laterBtn) {
          laterBtn.disabled = false; laterBtn.style.pointerEvents = '';
          if (laterBtn.dataset.baseText) laterBtn.textContent = laterBtn.dataset.baseText;
        }
        if (dont) { dont.disabled = false; dont.style.opacity = ''; }
      } catch (_) {}
    }
  };

  window.IntroModalComponent = IntroModalComponent;
})(window);
