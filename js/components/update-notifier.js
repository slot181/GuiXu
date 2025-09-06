(function (window) {
  'use strict';

  // 轻量的版本更新检查与提示组件
  // 规则：
  // - 仅在非首轮（已成功捕捉过一次 <gametxt>）之后才允许提示
  // - 不在首轮门禁评估阶段打扰（建议由 main.js 在门禁放行后调用）
  // - 缓存检查结果，默认6小时内不重复请求；对同一tag若用户“本次不再提示”，则不再提示
  // - UI遵循全局CSS的 .modal-overlay/.modal-content 等，不引入新全局样式

  const UpdateNotifier = {
    _API_URL: 'https://api.github.com/repos/slot181/GuiXu/releases/latest',
    _RELEASES_PAGE: 'https://github.com/slot181/GuiXu/releases',
    _CACHE_KEY: 'guixu_release_cache_v1',
    _CHECK_INTERVAL: 6 * 60 * 60 * 1000, // 6小时
    _modalId: 'update-modal',

    async checkAndMaybeNotify(force = false) {
      try {
        // 仅在已成功捕捉过一次 <gametxt> 时才允许提示（按世界序号）
        if (!this._hasSeenGametxtOnce()) return;

        // 频率限制
        if (!force && !this._shouldCheckNow()) return;

        const latest = await this._fetchLatestRelease();
        if (!latest || !latest.tag_name) return;

        const current = this._getCurrentVersion() || '';
        const latestTag = String(latest.tag_name || '').trim();

        // 对本tag若用户已“本次不再提示”，则跳过
        if (this._isDismissed(latestTag)) return;

        // 仅当最新版本“高于”当前版本时提示；若无法解析当前版本，则默认提示
        const shouldPrompt = !current || this._compareTags(latestTag, current) > 0;
        if (!shouldPrompt) return;

        // 构建并显示提示
        this._ensureModal();
        this._fillModal({
          current,
          latest: latestTag,
          html_url: latest.html_url || this._RELEASES_PAGE,
          name: latest.name || latestTag,
          body: latest.body || ''
        });
        this._openModal();
      } catch (e) {
        // 静默失败
        console.warn('[归墟] 版本更新检查失败：', e);
      }
    },

    // ——— 环境/条件 ———
    _hasSeenGametxtOnce() {
      try {
        const idx = window.GuixuState?.getState?.().unifiedIndex || 1;
        return localStorage.getItem(`guixu_gate_gametxt_seen_${idx}`) === '1';
      } catch (_) {
        return false;
      }
    },

    _shouldCheckNow() {
      try {
        const raw = localStorage.getItem(this._CACHE_KEY);
        if (!raw) return true;
        const cache = JSON.parse(raw);
        const last = Number(cache?.lastChecked || 0);
        return !(Date.now() - last < this._CHECK_INTERVAL);
      } catch (_) {
        return true;
      }
    },

    _markChecked(payload = {}) {
      try {
        const prev = JSON.parse(localStorage.getItem(this._CACHE_KEY) || 'null') || {};
        const next = Object.assign({}, prev, { lastChecked: Date.now(), lastResult: payload });
        localStorage.setItem(this._CACHE_KEY, JSON.stringify(next));
      } catch (_) {}
    },

    _dismissTag(tag) {
      try { localStorage.setItem(this._dismissKey(tag), '1'); } catch (_) {}
    },
    _isDismissed(tag) {
      try { return localStorage.getItem(this._dismissKey(tag)) === '1'; } catch (_) { return false; }
    },
    _dismissKey(tag) { return `guixu_release_dismiss_${String(tag || '').trim()}`; },

    // ——— 版本解析/比较 ———
    _getCurrentVersion() {
      try {
        // 从页面上任何 cdn.jsdelivr 的 GuiXu 资源中提取 @version
        // 例如: https://cdn.jsdelivr.net/gh/slot181/GuiXu@v3.4.5.2/js/main.js
        const sel = [
          'link[href*="cdn.jsdelivr.net/gh/slot181/GuiXu@"]',
          'script[src*="cdn.jsdelivr.net/gh/slot181/GuiXu@"]'
        ].join(',');
        const el = document.querySelector(sel);
        if (!el) return '';
        const url = el.href || el.src || '';
        const m = url.match(/GuiXu@([^/]+)/);
        return m ? m[1] : '';
      } catch (_) {
        return '';
      }
    },

    _normalizeTag(tag) {
      const s = String(tag || '').trim().replace(/^v/i, '');
      // 尝试按点分割
      const parts = s.split('.').map(x => x.replace(/[^\dA-Za-z\-]/g, ''));
      return parts;
    },

    // 返回值：>0 表示 a>b，0 表示相等，<0 表示 a<b
    _compareTags(a, b) {
      try {
        const A = this._normalizeTag(a);
        const B = this._normalizeTag(b);
        const len = Math.max(A.length, B.length);
        for (let i = 0; i < len; i++) {
          const ai = A[i] ?? '0';
          const bi = B[i] ?? '0';
          const nai = /^\d+$/.test(ai) ? parseInt(ai, 10) : ai;
          const nbi = /^\d+$/.test(bi) ? parseInt(bi, 10) : bi;
          if (nai === nbi) continue;
          if (typeof nai === 'number' && typeof nbi === 'number') return nai - nbi;
          // 数字优于字符串；否则按字典
          if (typeof nai === 'number') return 1;
          if (typeof nbi === 'number') return -1;
          return String(nai).localeCompare(String(nbi));
        }
        return 0;
      } catch (_) {
        // 若比较失败，保守地认为 a>b（以触发提示）
        return 1;
      }
    },

    // ——— 数据获取 ———
    async _fetchLatestRelease() {
      try {
        const res = await fetch(this._API_URL, {
          headers: {
            'Accept': 'application/vnd.github+json'
          }
        });
        if (!res.ok) {
          // 记录检查时间，防止短期内反复请求
          this._markChecked({ ok: false, status: res.status });
          return null;
        }
        const json = await res.json();
        this._markChecked({ ok: true, tag_name: json.tag_name, name: json.name });
        return json;
      } catch (e) {
        this._markChecked({ ok: false, error: String(e) });
        return null;
      }
    },

    _readCachedLatest() {
      try {
        const raw = localStorage.getItem(this._CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        return cache?.lastResult || null;
      } catch (_) {
        return null;
      }
    },

    // 供“版本小标签”点击时显式打开更新浮窗（不自动弹出）
    async openFromBadge() {
      try {
        const current = this._getCurrentVersion() || '';
        let latest = await this._fetchLatestRelease();
        let latestTag = String(latest?.tag_name || '').trim();

        if (!latestTag) {
          const cached = this._readCachedLatest();
          if (cached && cached.tag_name) {
            latest = Object.assign(
              { html_url: this._RELEASES_PAGE, body: '', name: cached.name || cached.tag_name },
              cached
            );
            latestTag = String(cached.tag_name).trim();
          }
        }

        // 构建并显示提示（若仍无最新信息，则给出前往 Releases 的兜底）
        this._ensureModal();
        if (latestTag) {
          this._fillModal({
            current,
            latest: latestTag,
            html_url: latest?.html_url || this._RELEASES_PAGE,
            name: latest?.name || latestTag,
            body: latest?.body || ''
          });
        } else {
          this._fillModal({
            current,
            latest: '',
            html_url: this._RELEASES_PAGE,
            name: 'Releases',
            body: '暂时无法获取最新版本详情，请前往 Releases 查看。'
          });
        }
        this._openModal();
      } catch (e) {
        console.warn('[归墟] 打开更新浮窗失败：', e);
        try {
          this._ensureModal();
          this._fillModal({
            current: this._getCurrentVersion() || '',
            latest: '',
            html_url: this._RELEASES_PAGE,
            name: 'Releases',
            body: '暂时无法获取最新版本详情，请前往 Releases 查看。'
          });
          this._openModal();
        } catch (_) {}
      }
    },

    // ——— UI ———
    _ensureModal() {
      try {
        if (document.getElementById(this._modalId)) return;
        const root = document.querySelector('.guixu-root-container') || document.body;

        const overlay = document.createElement('div');
        overlay.id = this._modalId;
        overlay.className = 'modal-overlay';

        const content = document.createElement('div');
        content.className = 'modal-content';

        const header = document.createElement('div');
        header.className = 'modal-header';

        const title = document.createElement('h2');
        title.className = 'modal-title';
        title.textContent = '发现新版本';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => this._closeModal());

        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body';
        body.innerHTML = `
          <div class="panel-section">
            <div class="section-title">版本信息</div>
            <div id="update-version-info" class="attributes-list u-p-10"></div>
          </div>
          <div class="panel-section">
            <div class="section-title">更新说明（节选）</div>
            <div id="update-brief-body" class="attributes-list u-p-10 u-prewrap u-text-12 u-color-default"></div>
          </div>
        `;

        const footer = document.createElement('div');
        footer.className = 'confirm-modal-buttons';

        const dontLabel = document.createElement('label');
        dontLabel.className = 'dont-remind u-flex u-gap-8 u-mr-auto';
        const dontInput = document.createElement('input');
        dontInput.type = 'checkbox';
        dontInput.id = 'update-dont-remind-this-tag';
        const dontSpan = document.createElement('span');
        dontSpan.textContent = '本次不再提示此版本';
        dontSpan.className = 'auto-write-label';
        dontLabel.appendChild(dontInput);
        dontLabel.appendChild(dontSpan);

        const goBtn = document.createElement('a');
        goBtn.id = 'update-go-btn';
        goBtn.className = 'interaction-btn primary-btn';
        goBtn.textContent = '前往更新';
        goBtn.target = '_blank';
        goBtn.rel = 'noopener noreferrer';

        const laterBtn = document.createElement('button');
        laterBtn.id = 'update-later-btn';
        laterBtn.className = 'interaction-btn';
        laterBtn.textContent = '稍后';

        laterBtn.addEventListener('click', () => {
          try {
            const tag = document.getElementById(this._modalId)?.dataset?.tag || '';
            const dont = document.getElementById('update-dont-remind-this-tag');
            if (dont && dont.checked && tag) this._dismissTag(tag);
          } catch (_) {}
          this._closeModal();
        });

        footer.appendChild(dontLabel);
        footer.appendChild(laterBtn);
        footer.appendChild(goBtn);

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        overlay.appendChild(content);
        root.appendChild(overlay);
      } catch (e) {
        console.warn('[归墟] UpdateNotifier.ensureModal 失败:', e);
      }
    },

    _fillModal(data) {
      try {
        const overlay = document.getElementById(this._modalId);
        if (!overlay) return;
        overlay.dataset.tag = String(data.latest || '');
        const info = document.getElementById('update-version-info');
        const brief = document.getElementById('update-brief-body');
        const go = document.getElementById('update-go-btn');

        if (info) {
          const current = String(data.current || '').trim() || '未知';
          const latest = String(data.latest || '').trim();
          info.innerHTML = `
            <div class="attribute-item">
              <span class="attribute-name">当前版本</span>
              <span class="attribute-value">${this._escape(current)}</span>
            </div>
            <div class="attribute-item">
              <span class="attribute-name">最新版本</span>
              <span class="attribute-value">${this._escape(latest)}</span>
            </div>
          `;
        }
        if (brief) {
          // 仅显示部分说明，完整内容前往 Releases 页面查看
          const body = String(data.body || '').trim();
          const preview = body.length > 600 ? (body.slice(0, 600) + '...') : body;
          brief.textContent = preview || '无更新说明';
        }
        if (go) {
          go.href = data.html_url || this._RELEASES_PAGE;
        }
      } catch (e) {
        console.warn('[归墟] UpdateNotifier.fillModal 失败:', e);
      }
    },

    _openModal() {
      try {
        if (window.GuixuBaseModal && typeof window.GuixuBaseModal.open === 'function') {
          window.GuixuBaseModal.open(this._modalId);
        } else {
          const overlay = document.getElementById(this._modalId);
          if (overlay) overlay.style.display = 'flex';
        }
      } catch (_) {}
    },
    _closeModal() {
      try {
        const overlay = document.getElementById(this._modalId);
        if (overlay) overlay.style.display = 'none';
      } catch (_) {}
    },

    _escape(s) {
      return String(s || '')
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#39;');
    }
  };

  window.UpdateNotifier = UpdateNotifier;
})(window);
