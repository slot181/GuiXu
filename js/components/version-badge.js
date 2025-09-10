(function (window) {
  'use strict';

  // 顶部左侧“版本小标签”（桌面与移动端都显示；移动端放在顶部状态栏左侧）
  // - 文本：显示当前版本；若可更新则追加“可更新”小胶囊
  // - 点击：跳转到 GitHub Releases 页面
  // - 规则：遵循 UpdateNotifier 的门禁/频率策略；首轮仅显示当前版本，不发起远程请求
  const VersionBadge = {
    _elId: 'guixu-version-badge',
    _releases: 'https://github.com/slot181/GuiXu/releases',

    _escape(s) {
      return String(s || '')
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#39;');
    },

    ensureContainer() {
      try {
        const bottom = document.getElementById('bottom-status-container');
        if (!bottom) return null;
        let el = document.getElementById(this._elId);
        if (!el) {
          el = document.createElement('a');
          el.id = this._elId;
          el.className = 'version-badge';
          el.href = (window.UpdateNotifier && (UpdateNotifier._RELEASES_PAGE || '')) || this._releases;
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
          el.setAttribute('aria-label', '版本信息');
          bottom.appendChild(el);
        }
        // 点击行为：若可更新则拦截并弹出更新浮窗；否则保持跳转到 Releases
        if (el && !el._vbClickBound) {
          el.addEventListener('click', (e) => {
            try {
              if (el.classList.contains('is-update') && window.UpdateNotifier?.openFromBadge) {
                e.preventDefault();
                UpdateNotifier.openFromBadge();
              }
            } catch (_) {}
          });
          el._vbClickBound = true;
        }
        return el;
      } catch (_) {
        return null;
      }
    },

    renderBase(current) {
      const el = this.ensureContainer();
      if (!el) return;
      const cur = String(current || '').trim() || '未知';
      el.classList.remove('is-update');
      el.innerHTML = `<span class="vb-text">版本 ${this._escape(cur)}</span>`;
      // 桌面端：渲染后根据空间判定是否折叠为小图标
      this._updateCompactMode?.();
    },

    renderUpdate(current) {
      const el = this.ensureContainer();
      if (!el) return;
      const cur = String(current || '').trim() || '未知';
      el.classList.add('is-update');
      el.href = (window.UpdateNotifier && (UpdateNotifier._RELEASES_PAGE || '')) || this._releases;
      el.innerHTML =
        `<span class="vb-text">版本 ${this._escape(cur)}</span>` +
        `<span class="vb-pill">可更新</span>`;
      // 桌面端：渲染后根据空间判定是否折叠为小图标
      this._updateCompactMode?.();
    },

    _getCurrent() {
      try {
        return window.UpdateNotifier?._getCurrentVersion?.() || '';
      } catch (_) {
        return '';
      }
    },

    _hasSeenOnce() {
      try {
        return !!(window.UpdateNotifier?._hasSeenGametxtOnce?.());
      } catch (_) {
        return false;
      }
    },

    _shouldCheckNow() {
      try {
        // 若 UpdateNotifier 不可用，允许检查（返回 true）
        const fn = window.UpdateNotifier?._shouldCheckNow;
        if (typeof fn === 'function') return !!fn.call(UpdateNotifier);
        return true;
      } catch (_) {
        return true;
      }
    },

    _readCachedLatestTag() {
      try {
        const key = (window.UpdateNotifier && UpdateNotifier._CACHE_KEY) || 'guixu_release_cache_v1';
        const raw = localStorage.getItem(key);
        if (!raw) return '';
        const cache = JSON.parse(raw);
        const lr = cache?.lastResult;
        if (lr && lr.ok && lr.tag_name) return String(lr.tag_name);
        return '';
      } catch (_) {
        return '';
      }
    },

    async _fetchLatestTag() {
      try {
        const fn = window.UpdateNotifier?._fetchLatestRelease;
        if (typeof fn !== 'function') return '';
        const json = await fn.call(UpdateNotifier);
        return (json && json.tag_name) ? String(json.tag_name) : '';
      } catch (_) {
        return '';
      }
    },

    _isNewer(latest, current) {
      try {
        const cmp = window.UpdateNotifier?._compareTags?.(latest, current);
        if (typeof cmp === 'number') return cmp > 0;
        // 若比较不可用但拿到了 latest，则保守视为可更新
        return !!latest && latest !== current;
      } catch (_) {
        // 比较失败时保守触发
        return true;
      }
    },

    // 桌面端：根据底部栏剩余空间自动切换“紧凑图标模式”，避免遮挡输入区/按钮
    _updateCompactMode() {
      try {
        const root = document.querySelector('.guixu-root-container');
        const bottom = document.getElementById('bottom-status-container');
        const qs = bottom ? bottom.querySelector('.quick-send-container') : null;
        const el = document.getElementById(this._elId);
        if (!root || !bottom || !qs || !el) return;

        // 移动端不启用折叠
        if (root.classList.contains('mobile-view')) {
          el.classList.remove('compact');
          return;
        }

        // 测量“非折叠”时的自然宽度（使用离屏克隆，避免触发布局/观察者循环）
        let naturalWidth = 0;
        try {
          const clone = el.cloneNode(true);
          clone.classList.remove('compact');
          clone.style.position = 'absolute';
          clone.style.visibility = 'hidden';
          clone.style.pointerEvents = 'none';
          clone.style.left = '-99999px';
          clone.style.top = '0';
          (document.body || bottom).appendChild(clone);
          naturalWidth = Math.max(0, clone.getBoundingClientRect().width || 0);
          clone.remove();
        } catch (_) {
          // 兜底：取当前宽度或下限
          naturalWidth = Math.max(80, el.getBoundingClientRect().width || 0);
        }

        const bottomRect = bottom.getBoundingClientRect();
        const qsRect = qs.getBoundingClientRect();
        // 右侧剩余空间（底部容器右边缘到快速发送容器右边缘）
        const margin = 12; // 给输入组与徽标之间预留安全间距
        const availableRight = Math.max(0, bottomRect.right - qsRect.right - margin);
        // 阈值：需要至少容纳自然宽度；最低也给一个下限，避免误触发
        const needed = Math.max(80, Math.round(naturalWidth || 0)); // 80px 作为保底需求

        const shouldCompact = availableRight < needed;
        el.classList.toggle('compact', shouldCompact);
      } catch (_) {}
    },
 
    async update() {
      try {
        const current = this._getCurrent();

        // 首轮仅显示当前版本，不做远程请求
        const seenOnce = this._hasSeenOnce();
        if (!seenOnce) {
          this.renderBase(current);
          return;
        }

        // 优先读取缓存；若到期或没有，再发起请求
        let latestTag = this._readCachedLatestTag();
        const needFetch = !latestTag && this._shouldCheckNow();
        if (needFetch) {
          const fetched = await this._fetchLatestTag();
          if (fetched) latestTag = fetched;
        }

        const hasUpdate = !current || (latestTag && this._isNewer(latestTag, current));
        if (hasUpdate) this.renderUpdate(current);
        else this.renderBase(current);
      } catch (_) {
        // 失败兜底：仅显示当前版本
        this.renderBase(this._getCurrent());
      }
    },

    init() {
      const onReady = () => {
        this.ensureContainer();
        // 初次同步
        this.update();
        // 首次折叠判定
        this._updateCompactMode?.();

        // 监听窗口尺寸与方向变化，动态折叠/还原
        if (!this._resBound) {
          this._resBound = true;
          const apply = () => this._updateCompactMode?.();
          window.addEventListener('resize', apply);
          window.addEventListener('orientationchange', apply);
        }

        // 监听底部栏与快速发送容器“尺寸变化”（避免使用 MutationObserver 导致的循环触发）
        try {
          const bottom = document.getElementById('bottom-status-container');
          const qs = bottom ? bottom.querySelector('.quick-send-container') : null;
          if (!this._roBound && (bottom || qs) && typeof ResizeObserver !== 'undefined') {
            this._roBound = true;
            this._ro = new ResizeObserver(() => this._updateCompactMode?.());
            if (bottom) this._ro.observe(bottom);
            if (qs) this._ro.observe(qs);
            setTimeout(() => this._updateCompactMode?.(), 0);
          }
        } catch (_) {}

        // 二次同步：等主入口与 UpdateNotifier 的远程检查完成后再刷新一次（防止门禁/频控导致的延迟）
        setTimeout(() => { this.update(); this._updateCompactMode?.(); }, 1500);
        setTimeout(() => { this.update(); this._updateCompactMode?.(); }, 5000);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
      else onReady();
    }
  };

  window.VersionBadge = VersionBadge;
  VersionBadge.init();
})(window);
