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
        content.className = 'modal-content';
        content.style.maxWidth = '480px';
        content.style.width = '92%';
        content.style.height = 'auto';
        content.style.maxHeight = '80vh';

        // 头部
        const header = document.createElement('div');
        header.className = 'modal-header';

        const titleEl = document.createElement('div');
        titleEl.className = 'modal-title';
        titleEl.textContent = '支持与游玩指南';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.innerHTML = '&times;';

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // 主体
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.innerHTML = `
          <div class="panel-section" style="margin-bottom:12px;">
            <div class="section-title">快速上手</div>
            <div class="attributes-list" style="gap:8px;">
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">发送与回复</span>
                <span class="attribute-value" style="font-weight:400;">底部输入区输入后点击“发送”即可与伟大梦星交流。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">视图切换</span>
                <span class="attribute-value" style="font-weight:400;">右上角按钮可在<strong>移动端/桌面端</strong>间切换；移动端有悬浮“角色/功能/设置”按钮。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">全屏模式</span>
                <span class="attribute-value" style="font-weight:400;">右上角“⛶”进入全屏（横屏设备下更沉浸）。退出全屏后将自动恢复视图布局。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">状态与历史</span>
                <span class="attribute-value" style="font-weight:400;">右侧“人物关系/背包/归墟系统/世界线回顾”面板可查看与管理进度。</span>
              </div>
            </div>
          </div>

          <div class="panel-section" style="margin-bottom:12px;">
            <div class="section-title">注意事项</div>
            <div class="attributes-list" style="gap:8px;">
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">升级必读</span>
                <span class="attribute-value" style="font-weight:400;"><strong>必须重开，旧存档不兼容</strong>。请务必删除旧版 "1归墟" 世界书。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">网络要求</span>
                <span class="attribute-value" style="font-weight:400;">此卡通过 <strong>JsDelivr</strong> 加载脚本，必须确保网络连接良好。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">渲染失败</span>
                <span class="attribute-value" style="font-weight:400;">若UI渲染失效或加载不全，请点击右上角<strong>小铅笔图标</strong>重新加载。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">正文错乱</span>
                <span class="attribute-value" style="font-weight:400;">若正文出现思维链等无关内容，请用小铅笔检查正文是否被 gametxt标签正常包裹。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">行动选项</span>
                <span class="attribute-value" style="font-weight:400;">若行动选项未触发，请用小铅笔检查action标签是否正确包裹。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">存档方式</span>
                <span class="attribute-value" style="font-weight:400;">正文使用<strong>世界书云存档</strong>，与开局本地存档不通用，请在正文前端读档。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">开启新档</span>
                <span class="attribute-value" style="font-weight:400;">要开启干净存档，请修改读写序号，或在存档管理中<strong>一键清除所有存档</strong>。</span>
              </div>
            </div>
          </div>

          <div class="panel-section" style="margin-bottom:12px;">
            <div class="section-title">支持作者</div>
            <div class="attributes-list" style="gap:8px;">
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">点赞与分享</span>
                <span class="attribute-value" style="font-weight:400;">喜欢本项目，欢迎到 <a href="https://github.com/slot181/GuiXu" target="_blank" rel="noopener noreferrer">GitHub 仓库</a> 点赞并分享给朋友。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">反馈</span>
                <span class="attribute-value" style="font-weight:400;">在使用中遇到任何问题，可来 Discord 提出你的问题 <a href="https://discord.com/channels/1134557553011998840/1395002325751300227" target="_blank" rel="noopener noreferrer">原贴讨论</a>。</span>
              </div>
              <div class="attribute-item" style="justify-content:flex-start; gap:10px;">
                <span class="attribute-name">鸣谢</span>
                <span class="attribute-value" style="font-weight:400;">最后，赞美梦星！</span>
              </div>
            </div>
          </div>

          <label style="display:flex; align-items:center; gap:8px; margin-top:8px;">
            <input id="intro-dont-show" type="checkbox" checked />
            <span style="color:#8b7355; font-size:12px;">下次不再提示</span>
          </label>
        `;

        // 底部按钮区（复用 command-center-footer 风格以统一）
        const footer = document.createElement('div');
        footer.className = 'confirm-modal-buttons';
        footer.style.marginTop = '16px';
        const okBtn = document.createElement('button');
        okBtn.className = 'interaction-btn primary-btn';
        okBtn.textContent = '立即开始';

        const laterBtn = document.createElement('button');
        laterBtn.className = 'interaction-btn';
        laterBtn.textContent = '稍后再看';

        footer.appendChild(laterBtn);
        footer.appendChild(okBtn);

        // 组装
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        overlay.appendChild(content);
        // 统一浮窗内链接颜色为蓝色并加下划线，避免继承金色主题
        const linkStyle = document.createElement('style');
        linkStyle.textContent = '#intro-modal a, #intro-modal a:visited { color:#3b82f6 !important; text-decoration: underline; } #intro-modal a:hover { color:#2563eb !important; }';
        content.appendChild(linkStyle);
        root.appendChild(overlay);

        // 行为：关闭/确认
        const closeOverlay = (persist) => {
          try {
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
        setTimeout(() => this.show(), Math.max(0, delayMs|0));
      } catch (e) {
        console.warn('[归墟] IntroModalComponent.showFirstTimeIfNeeded 失败:', e);
      }
    }
  };

  window.IntroModalComponent = IntroModalComponent;
})(window);
