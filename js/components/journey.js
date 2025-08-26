(function (window) {
  'use strict';

  if (!window.GuixuDOM || !window.GuixuBaseModal || !window.GuixuAPI || !window.GuixuHelpers || !window.GuixuConstants || !window.GuixuState) {
    console.error('[归墟] JourneyComponent 初始化失败：缺少依赖(GuixuDOM/GuixuBaseModal/GuixuAPI/GuixuHelpers/GuixuConstants/GuixuState)。');
    return;
  }

  const JourneyComponent = {
    async show() {
      const { $ } = window.GuixuDOM;
      window.GuixuBaseModal.open('history-modal');

      const titleEl = $('#history-modal-title');
      if (titleEl) titleEl.textContent = '本世历程';

      // 注入头部动作区（自动修剪/手动修剪）
      const actionsContainer = $('#history-modal-actions');
      if (actionsContainer) {
        const isAutoTrimEnabled = window.GuixuState.getState().isAutoTrimEnabled;
        actionsContainer.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;" title="启用后，每次自动写入“本世历程”时，会自动修剪旧的自动化系统内容。">
            <input type="checkbox" id="auto-trim-checkbox" style="cursor: pointer;" ${isAutoTrimEnabled ? 'checked' : ''}>
            <label for="auto-trim-checkbox" class="auto-write-label" style="font-size: 12px;">自动修剪</label>
          </div>
          <button id="btn-show-trim-modal" class="interaction-btn" style="padding: 4px 8px; font-size: 12px;">手动修剪</button>
          <div class="history-search">
            <input type="text" id="history-search-input" placeholder="搜索事件..." />
            <button id="history-search-clear" class="interaction-btn" style="padding: 4px 8px; font-size: 12px;">清除</button>
          </div>
        `;

        // 绑定事件
        $('#auto-trim-checkbox')?.addEventListener('change', e => {
          const enabled = !!e.target.checked;
          window.GuixuState.update('isAutoTrimEnabled', enabled);
          window.GuixuHelpers.showTemporaryMessage(`自动修剪已${enabled ? '开启' : '关闭'}`);
        });
        $('#btn-show-trim-modal')?.addEventListener('click', () => {
          if (window.GuixuBaseModal && typeof window.GuixuBaseModal.open === 'function') {
            window.GuixuBaseModal.open('trim-journey-modal');
          } else {
            const overlay = $('#trim-journey-modal');
            if (overlay) overlay.style.display = 'flex';
          }
        });

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
      body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">正在读取命运之卷...</p>';

      try {
        const bookName = window.GuixuConstants.LOREBOOK.NAME;
        const index = window.GuixuState.getState().unifiedIndex || 1;
        const journeyKey = index > 1 ? `${window.GuixuConstants.LOREBOOK.ENTRIES.JOURNEY}(${index})` : window.GuixuConstants.LOREBOOK.ENTRIES.JOURNEY;

        const allEntries = await window.GuixuAPI.getLorebookEntries(bookName);
        const journeyEntry = allEntries.find(entry => (entry.comment || '').trim() === journeyKey.trim());

        body.innerHTML = this.renderJourneyFromEntry(journeyEntry);

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

        // 绑定时间轴点击展开
        const container = $('.timeline-container');
        if (container) {
          container.addEventListener('click', e => {
            const timelineEvent = e.target.closest('.timeline-event');
            if (!timelineEvent) return;
            const detailed = timelineEvent.querySelector('.timeline-detailed-info');
            if (!detailed) return;
            const isHidden = getComputedStyle(detailed).display === 'none';
            detailed.style.display = isHidden ? 'block' : 'none';
            timelineEvent.style.cursor = 'pointer';
          });
        }
      } catch (err) {
        console.error('[归墟] 读取“本世历程”时出错:', err);
        body.innerHTML = `<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">读取记忆时出现错误：${err.message}</p>`;
      }
    },

    renderJourneyFromEntry(entry) {
      if (!entry || !entry.content)
        return '<p style="text-align:center; color:#8b7355; font-size:12px;">此生尚未留下任何印记。</p>';

      const events = window.GuixuHelpers.parseJourneyEntry(entry.content);
      if (!Array.isArray(events) || events.length === 0)
        return '<p style="text-align:center; color:#8b7355; font-size:12px;">内容格式有误，无法解析事件。</p>';

      // 按序号排序
      events.sort((a, b) => (parseInt(a.序号, 10) || 0) - (parseInt(b.序号, 10) || 0));

      let html = '<div class="timeline-container"><div class="timeline-line"></div>';
      events.forEach((eventData, index) => {
        const eventId = `event-${entry.uid}-${index}`;
        const date = eventData['日期'] || '未知时间';
        const title = eventData['标题'] || '无标题';
        const location = eventData['地点'] || '未知地点';
        const description = eventData['描述'] || '无详细描述。';
        const characters = eventData['人物'] || '';
        const relationships = eventData['人物关系'] || '';
        const importantInfo = eventData['重要信息'] || '';
        const hiddenPlot = eventData['暗线与伏笔'] || '';
        const autoSystem = eventData['自动化系统'] || '';

        const tagsHtml = (eventData['标签'] || '')
          .split('|')
          .map(tag => tag.trim())
          .filter(tag => tag)
          .map(tag => `<span class="tag-item">${tag}</span>`)
          .join('');

        const basicInfo = `
          <div class="timeline-header">
            <div class="timeline-date">${date}</div>
            <div class="timeline-tags">${tagsHtml}</div>
          </div>
          <div class="timeline-title">${title}</div>
          <div class="timeline-location" style="font-size: 12px; color: #8b7355; margin: 5px 0;">地点：${location}</div>
          <div class="timeline-description">${description}</div>
        `;

        const detailedInfo = `
          <div class="timeline-detailed-info" id="detailed-${eventId}" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(201, 170, 113, 0.3);">
            ${characters ? `<div class="detail-section"><strong>人物：</strong>${characters}</div>` : ''}
            ${relationships ? `<div class="detail-section"><strong>人物关系：</strong>${relationships}</div>` : ''}
            ${importantInfo ? `<div class="detail-section"><strong>重要信息：</strong>${importantInfo}</div>` : ''}
            ${hiddenPlot ? `<div class="detail-section"><strong>暗线与伏笔：</strong>${hiddenPlot}</div>` : ''}
            ${autoSystem ? `<div class="detail-section"><strong>自动化系统：</strong><pre style="white-space: pre-wrap; font-size: 11px; color: #a09c91;">${autoSystem}</pre></div>` : ''}
          </div>
        `;

        html += `
          <div class="timeline-event" data-event-id="${eventId}" style="cursor: pointer;">
            <div class="timeline-content">
              ${basicInfo}
              ${detailedInfo}
            </div>
          </div>`;
      });
      html += '</div>';
      return html;
    }
  };

  window.JourneyComponent = JourneyComponent;
})(window);
