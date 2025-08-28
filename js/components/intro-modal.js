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
        content.style.maxWidth = '640px';
        content.style.width = '92%';
        content.style.height = 'auto';
        content.style.maxHeight = '90vh';

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
            <div style="color:#a09c91; font-size:12px; line-height:1.7;">
              <ol style="margin:6px 0 0 18px; padding-left: 1em; list-style: decimal;">
                <li style="margin-bottom: 4px;"><strong>必须开启新档</strong>: 此版本为重构版，<strong>无法兼容旧存档</strong>。请务必在导入本卡前，删除或重命名旧版“1归墟”世界书。</li>
                <li style="margin-bottom: 4px;"><strong>网络要求</strong>: 本卡通过 <strong>JsDelivr</strong> 加载脚本，游玩时请确保网络连接通畅。</li>
                <li style="margin-bottom: 4px;"><strong>加载/显示问题</strong>: 若首次加载时 UI 渲染失败或出现思维链等错乱内容，请点击右上角<strong>小铅笔图标</strong>刷新。若问题依旧，请检查正文是否被 <code><gametxt></gametxt></code> 标签包裹。</li>
                <li style="margin-bottom: 4px;"><strong>存档与读档</strong>: 正文界面的存档系统为<strong>世界书云存档</strong>，与开局的前端本地存档不通用。请在正文前端进行读档操作。</li>
                <li style="margin-bottom: 4px;"><strong>开启干净存档</strong>: 若要开启一个全新的存档，请修改世界书控制的<strong>读写序号</strong>，或在存档管理中<strong>一键清除所有存档</strong>。</li>
                <li style="margin-bottom: 4px;"><strong>浏览器设置</strong>: 建议将你的酒馆地址（如 <code>http://192.xxx.xx.xxx:8000</code>）在浏览器中设置为“不安全的来源视为安全的来源 (Insecure origins treated as secure)”，以确保功能正常。</li>
              </ol>
            </div>
          </div>

          <div class="panel-section" style="margin-bottom:12px;">
            <div class="section-title">支持作者</div>
            <div style="color:#a09c91; font-size:12px; line-height:1.7; margin-top:6px;">
              喜欢本项目的话，欢迎分享给朋友、为代码仓库点赞(<a href="https://github.com/slot181/GuiXu" target="_blank" rel="noopener noreferrer">https://github.com/slot181/GuiXu</a>)、在使用中反馈问题或提出建议。
              最后，赞美牢星！
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
