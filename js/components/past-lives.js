(function (window) {
  'use strict';

  if (!window.GuixuDOM || !window.GuixuBaseModal || !window.GuixuAPI || !window.GuixuConstants || !window.GuixuState) {
    console.error('[归墟] PastLivesComponent 初始化失败：缺少依赖(GuixuDOM/GuixuBaseModal/GuixuAPI/GuixuConstants/GuixuState)。');
    return;
  }

  // 简单解析“往世涟漪”块的工具（与原 guixu.js 的 parsePastLifeEntry 行为一致）
  function parsePastLifeEntry(contentString) {
    if (!contentString || typeof contentString !== 'string') return {};
    try {
      const data = {};
      const lines = contentString.trim().split('\n');
      lines.forEach(line => {
        const parts = line.split('|');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('|').trim();
          data[key] = value;
        }
      });
      return data;
    } catch (e) {
      console.error('[归墟] 解析往世涟漪条目失败:', e);
      return {};
    }
  }

  const PastLivesComponent = {
    async show() {
      const { $ } = window.GuixuDOM;
      window.GuixuBaseModal.open('history-modal');

      const titleEl = $('#history-modal-title');
      if (titleEl) titleEl.textContent = '往世涟漪';

      const actionsContainer = $('#history-modal-actions');
      if (actionsContainer) {
        actionsContainer.innerHTML = `
          <div class="history-toolbar">
          </div>
          <div class="history-search">
            <input type="text" id="history-search-input" placeholder="搜索往世..." />
            <button id="history-search-clear" class="interaction-btn btn-compact">清除</button>
          </div>
        `;
        // 搜索栏绑定（对时间线内文本进行模糊匹配）
        const searchInput = document.getElementById('history-search-input');
        const searchClear = document.getElementById('history-search-clear');
        const doFilter = () => {
          const q = (searchInput?.value || '').trim().toLowerCase();
          const container = $('.timeline-container');
          if (!container) return;
          container.querySelectorAll('.timeline-event').forEach(ev => {
            const text = (ev.textContent || '').toLowerCase();
            ev.style.display = !q || text.includes(q) ? '' : 'none';
          });
        };
        searchInput?.addEventListener('input', doFilter);
        searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doFilter(); });
        searchClear?.addEventListener('click', () => { if (searchInput) searchInput.value = ''; doFilter(); });
      }

      const body = $('#history-modal-body');
      if (!body) return;
      body.innerHTML =
        '<p class="modal-placeholder">正在回溯时光长河...</p>';

      try {
        const bookName = window.GuixuConstants.LOREBOOK.NAME;
        const index = window.GuixuState.getState().unifiedIndex || 1;
        const pastLivesKey =
          index > 1
            ? `${window.GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES}(${index})`
            : window.GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES;

        const allEntries = await window.GuixuAPI.getLorebookEntries(bookName);
        const pastLivesEntry = allEntries.find(entry => (entry.comment || '').trim() === pastLivesKey.trim());

        body.innerHTML = this.renderPastLives(pastLivesEntry);

        // 若存在搜索关键字，初始过滤
        try {
          const _si = document.getElementById('history-search-input');
          if (_si && _si.value) {
            const q = _si.value.trim().toLowerCase();
            const container = $('.timeline-container');
            if (container) {
              container.querySelectorAll('.timeline-event').forEach(ev => {
                const text = (ev.textContent || '').toLowerCase();
                ev.style.display = !q || text.includes(q) ? '' : 'none';
              });
            }
          }
        } catch (_) {}
      } catch (error) {
        console.error('[归墟] 读取“往世涟漪”时出错:', error);
        body.innerHTML = `<p class="modal-placeholder">回溯时光长河时出现错误：${error.message}</p>`;
      }
    },

    renderPastLives(entry) {
      if (!entry || !entry.content)
        return '<p class="modal-placeholder">未发现任何往世的痕迹。</p>';

      // 1) 首选使用通用解析：按“空行分隔的事件块 + 标签|内容”解析
      let events = window.GuixuHelpers.parseJourneyEntry(entry.content) || [];
      // 2) 兼容回退：若未能分块，但文本内包含多个“第x世|”，按该标记切分并逐块解析
      if (!Array.isArray(events) || events.length === 0) {
        const raw = String(entry.content || '').trim();
        const parts = raw.split(/(?=^第x世\|)/m).map(s => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          events = parts.map(p => {
            // 优先通用解析单块
            const parsedOnce = window.GuixuHelpers.parseJourneyEntry(p);
            if (Array.isArray(parsedOnce) && parsedOnce.length > 0) return parsedOnce[0];
            // 回落到原“逐行 标签|内容”解析
            return parsePastLifeEntry(p);
          }).filter(ev => ev && Object.keys(ev).length > 0);
        }
      }

      if (!Array.isArray(events) || events.length === 0)
        return '<p class="modal-placeholder">内容格式有误，无法解析往世记录。</p>';

      // 按“第x世”排序（若存在）
      events.sort((a, b) => (parseInt(a['第x世'], 10) || 0) - (parseInt(b['第x世'], 10) || 0));

      let html = '<div class="timeline-container"><div class="timeline-line"></div>';
      events.forEach((data, idx) => {
        const title = data['第x世']
          ? `第${data['第x世']}世`
          : (data['标题'] ? String(data['标题']) : `往世片段 ${idx + 1}`);

        // 标签 pills（若有）
        const tagsHtml = (data['标签'] || '')
          .split('|')
          .map(tag => tag.trim())
          .filter(Boolean)
          .map(tag => `<span class="tag-item">${tag}</span>`)
          .join('');

        // 已知字段的主展示
        const knownSections = [
          ['事件脉络', '事件脉络'],
          ['本世概述', '本世概述'],
          ['本世成就', '本世成就'],
          ['本世获得物品', '获得物品'],
          ['本世人物关系网', '人物关系'],
          ['死亡原因', '死亡原因'],
          ['本世总结', '本世总结'],
          ['本世评价', '本世评价'],
        ].map(([key, label]) => {
          const v = data[key];
          return v && String(v).trim() !== ''
            ? `<div class="detail-item"><strong>${label}:</strong> ${String(v)}</div>`
            : '';
        }).join('');

        // 额外未知字段自动渲染（排除已知字段与特殊字段）
        const KNOWN_KEYS = new Set(['第x世','事件脉络','本世概述','本世成就','本世获得物品','本世人物关系网','死亡原因','本世总结','本世评价','标签','自动化系统','标题','日期','地点','描述','人物','人物关系','重要信息','暗线与伏笔']);
        const extraDetails = Object.keys(data)
          .filter(k => !KNOWN_KEYS.has(k) && data[k] != null && String(data[k]).trim() !== '')
          .map(k => `<div class="detail-item"><strong>${k}:</strong> ${String(data[k])}</div>`)
          .join('');

        // 自动化系统：保持折叠/多行预格式化展示
        const autoSystem = data['自动化系统'] ? `
          <div class="detail-item">
            <strong>自动化系统:</strong>
            <pre class="timeline-auto-system">${String(data['自动化系统'])}</pre>
          </div>` : '';

        html += `
          <div class="timeline-event">
            <div class="timeline-content">
              <div class="timeline-header">
                <div class="timeline-title">${title}</div>
                <div class="timeline-tags">${tagsHtml}</div>
              </div>
              <div class="past-life-details">
                ${knownSections}
                ${extraDetails}
                ${autoSystem}
              </div>
            </div>
          </div>`;
      });
      html += '</div>';
      return html;
    }
  };

  window.PastLivesComponent = PastLivesComponent;
})(window);
