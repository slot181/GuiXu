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

        // 二次同步：等主入口与 UpdateNotifier 的远程检查完成后再刷新一次（防止门禁/频控导致的延迟）
        setTimeout(() => this.update(), 1500);
        setTimeout(() => this.update(), 5000);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
      else onReady();
    }
  };

  window.VersionBadge = VersionBadge;
  VersionBadge.init();
})(window);
