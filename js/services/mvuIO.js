(function (window) {
  'use strict';

  // 归墟 MVU I/O 合并与节流模块
  // 目标：
  // 1) 将短时间内的多次写回合并为一次 setChatMessages，避免加载期卡顿
  // 2) 以 requestIdleCallback/setTimeout 节流，降低主线程阻塞风险
  // 3) 仅处理“写回 stat_data 的变更”，不改动消息正文（message）

  if (!window.GuixuAPI || !window.GuixuState) {
    console.warn('[归墟] MvuIO 未初始化：缺少 GuixuAPI 或 GuixuState。');
    return;
  }

  const MvuIO = {
    _queue: [],
    _timer: null,
    _maxTimer: null,
    _flushing: false,
    _defaults: {
      delayMs: 200,     // 短延时合并窗口
      maxDelayMs: 800,  // 最长等待时间，防止持续抖动
    },
    _pendingResolvers: [],

    /**
     * 调度一次“stat_data 变更写回”（合并/节流）
     * @param {(stat: object) => void} mutator - 对当前 stat_data 的变更函数（就地修改）
     * @param {{delayMs?:number,maxDelayMs?:number,reason?:string}} [opts]
     */
    scheduleStatUpdate(mutator, opts = {}) {
      try {
        if (typeof mutator !== 'function') return;
        const d = Object.assign({}, this._defaults, opts);

        this._queue.push({ mutator, reason: opts.reason || '' });

        const scheduleFlush = (ms) => {
          clearTimeout(this._timer);
          this._timer = setTimeout(() => this._flushSafe(), ms);
        };

        if (!this._timer) {
          scheduleFlush(d.delayMs | 0);
          if (!this._maxTimer) {
            this._maxTimer = setTimeout(() => this._flushSafe(), Math.max(d.delayMs | 0, d.maxDelayMs | 0));
          }
        } else {
          scheduleFlush(d.delayMs | 0);
        }
      } catch (e) {
        console.warn('[归墟] MvuIO.scheduleStatUpdate 异常:', e);
      }
    },

    /**
     * 立即尝试刷新队列，返回一个在本次刷新完成后 resolve 的 Promise
     */
    async flushNow() {
      try {
        // 终止等待中的定时器，立即触发一次刷新
        clearTimeout(this._timer); this._timer = null;
        clearTimeout(this._maxTimer); this._maxTimer = null;
        if (this._flushing) {
          return await new Promise(resolve => this._pendingResolvers.push(resolve));
        }
        const p = new Promise(resolve => this._pendingResolvers.push(resolve));
        await this._flushSafe();
        return p;
      } catch (_) {
        // 异常兜底：短延时等待
        return new Promise(res => setTimeout(res, this._defaults.delayMs));
      }
    },
 
    async _flushSafe() {
      if (this._flushing) {
        // 避免并发，稍后再尝试
        setTimeout(() => this._flushSafe(), 60);
        return;
      }
      this._flushing = true;
      clearTimeout(this._timer); this._timer = null;
      clearTimeout(this._maxTimer); this._maxTimer = null;

      // 门禁守卫调整：不再在首轮期间拦截任何写回（尤其是 stat_data）
      // 说明：根据最新策略，检测到 MVU/stat_data 写入时应立即放行，因此此处不做 gateActive 拦截
      try {
        if (this._queue.length === 0) {
          this._flushing = false;
          // 确保 flushNow() 的等待者能被正确唤醒，避免 Promise 悬挂造成内存占用与“假死”
          try {
            const resolvers = this._pendingResolvers.splice(0, this._pendingResolvers.length);
            resolvers.forEach(fn => { try { fn(); } catch (_) {} });
          } catch (_) {}
          return;
        }
        const jobs = this._queue.splice(0, this._queue.length);

        const st = window.GuixuState?.getState?.();
        // 以当前缓存为基准，合并所有变更
        let dataObj = (st?.currentMvuState && typeof st.currentMvuState === 'object')
          ? st.currentMvuState
          : { stat_data: {} };

        if (!dataObj.stat_data || typeof dataObj.stat_data !== 'object') {
          dataObj.stat_data = {};
        }

        // 应用全部变更（就地）
        for (const j of jobs) {
          try { j.mutator && j.mutator(dataObj.stat_data); } catch (_) {}
        }

        // 一次性写回当前楼层
        const currentId = window.GuixuAPI.getCurrentMessageId();
        const updates = [{ message_id: currentId, data: dataObj }];

        // 尽量在空闲时执行（如果可用）
        const doWrite = async () => {
          await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });
          try { window.GuixuState.update('currentMvuState', dataObj); } catch (_) {}
        };

        if (typeof window.requestIdleCallback === 'function') {
          await new Promise((resolve) => window.requestIdleCallback(() => resolve(), { timeout: 500 }));
          await doWrite();
        } else {
          await doWrite();
        }
      } catch (e) {
        console.warn('[归墟] MvuIO.flush 失败:', e);
      } finally {
        this._flushing = false;
        // 广播一次“已刷新”事件，供 UI 监听
        try {
          window.dispatchEvent(new CustomEvent('guixu:mvu-flushed', { detail: { remaining: this._queue.length } }));
        } catch (_) {}
        // 唤醒等待 flush 的调用方
        try {
          const resolvers = this._pendingResolvers.splice(0, this._pendingResolvers.length);
          resolvers.forEach(fn => { try { fn(); } catch (_) {} });
        } catch (_) {}
        if (this._queue.length > 0) {
          this._timer = setTimeout(() => this._flushSafe(), this._defaults.delayMs);
        }
      }
    }
  };

  // 导出
  window.GuixuMvuIO = MvuIO;

})(window);
