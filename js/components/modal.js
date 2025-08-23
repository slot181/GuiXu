// 类脑/旅程梦星作品，禁止二传，禁止商业化，均无偿免费开源分享
(function (window) {
  'use strict';

  if (!window.GuixuDOM) {
    console.error('[归墟] BaseModal 初始化失败：缺少 GuixuDOM 依赖。');
    return;
  }

  const BaseModal = {
    open(modalId) {
      try {
        this.closeAll();
        const modal = GuixuDOM.$('#' + modalId);
        if (modal) {
          modal.style.display = 'flex';
        } else {
          console.warn('[归墟] 未找到模态框: #' + modalId);
        }
      } catch (e) {
        console.error('[归墟] 打开模态框失败:', e);
      }
    },

    closeAll() {
      try {
        const overlays = GuixuDOM.$$('.modal-overlay');
        overlays.forEach(m => (m.style.display = 'none'));
      } catch (e) {
        console.error('[归墟] 关闭所有模态框失败:', e);
      }
    },

    setBodyHTML(modalId, html) {
      try {
        const body = GuixuDOM.$(`#${modalId} .modal-body`);
        if (body) {
          body.innerHTML = html;
        } else {
          console.warn('[归墟] 未找到模态框主体: #' + modalId + ' .modal-body');
        }
      } catch (e) {
        console.error('[归墟] 设置模态框内容失败:', e);
      }
    },

    setTitle(modalId, title) {
      try {
        const titleEl = GuixuDOM.$(`#${modalId} .modal-title`);
        if (titleEl) titleEl.textContent = title;
      } catch (e) {
        console.error('[归墟] 设置模态框标题失败:', e);
      }
    }
  };

  window.GuixuBaseModal = BaseModal;
})(window);
