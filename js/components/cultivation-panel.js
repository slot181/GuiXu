// 类脑/旅程梦星作品，禁止二传，禁止商业化，均无偿免费开源分享
// 修为详情面板：为左侧“修为详情”模块填充进度与瓶颈信息
(function (window) {
  'use strict';

  function clampPercent(v) {
    const n = parseFloat(v);
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function updateCultivationFromStat(stat_data) {
    try {
      if (!stat_data) return;
      const progressRaw = window.GuixuHelpers?.SafeGetValue
        ? window.GuixuHelpers.SafeGetValue(stat_data, '修为进度', '0')
        : (stat_data['修为进度'] ?? '0');

      const bottleneck = window.GuixuHelpers?.SafeGetValue
        ? window.GuixuHelpers.SafeGetValue(stat_data, '修为瓶颈', '无')
        : (stat_data['修为瓶颈'] ?? '无');

      const progress = clampPercent(progressRaw);

      const progText = document.getElementById('cultivation-progress-text');
      if (progText) progText.innerText = `${progress}%`;

      const progFill = document.getElementById('cultivation-progress-fill');
      if (progFill) progFill.style.width = `${progress}%`;

      const bottleEl = document.getElementById('cultivation-bottleneck');
      if (bottleEl) bottleEl.innerText = bottleneck;
    } catch (e) {
      console.warn('[归墟] cultivation-panel 更新失败:', e);
    }
  }

  // 钩住 GuixuMain.renderUI，渲染时同步“修为详情”
  function tryHookRender() {
    const GM = window.GuixuMain;
    if (!GM || typeof GM.renderUI !== 'function') return false;

    // 避免重复包裹
    if (GM.__cultivation_hooked__) return true;
    const orig = GM.renderUI.bind(GM);
    GM.renderUI = function (data) {
      const ret = orig(data);
      try { updateCultivationFromStat(data); } catch (_) {}
      return ret;
    };
    GM.__cultivation_hooked__ = true;
    console.info('[归墟] cultivation-panel: 已挂载到 GuixuMain.renderUI。');
    return true;
  }

  // 初始化：若已存在 GuixuAPI，先尝试立即刷新一次
  async function initialUpdateOnce() {
    try {
      if (!window.GuixuAPI || typeof window.GuixuAPI.getChatMessages !== 'function') return;
      const msgs = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
      const stat = msgs && msgs[0] && msgs[0].data && msgs[0].data.stat_data;
      if (stat) updateCultivationFromStat(stat);
    } catch (e) {
      console.warn('[归墟] cultivation-panel 初始刷新失败:', e);
    }
  }

  // 尝试安装钩子；如未就绪则轮询一小段时间
  function bootstrap() {
    if (tryHookRender()) {
      initialUpdateOnce();
      return;
    }
    const deadline = Date.now() + 10000; // 最多等 10 秒
    const timer = setInterval(() => {
      if (tryHookRender() || Date.now() > deadline) {
        clearInterval(timer);
        initialUpdateOnce();
      }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})(window);
