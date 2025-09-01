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

    async _flushSafe() {
      if (this._flushing) {
        // 避免并发，稍后再尝试
        setTimeout(() => this._flushSafe(), 60);
        return;
      }
      this._flushing = true;
      clearTimeout(this._timer); this._timer = null;
      clearTimeout(this._maxTimer); this._maxTimer = null;

      try {
        if (this._queue.length === 0) { this._flushing = false; return; }
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
        if (this._queue.length > 0) {
          this._timer = setTimeout(() => this._flushSafe(), this._defaults.delayMs);
        }
      }
    }
  };

  // 导出
  window.GuixuMvuIO = MvuIO;

})(window);
