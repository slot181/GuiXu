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
          <div class="history-toolbar">
            <div class="history-action-group" title="启用后，每次自动写入“本世历程”时，会自动修剪旧的自动化系统内容。">
              <input type="checkbox" id="auto-trim-checkbox" ${isAutoTrimEnabled ? 'checked' : ''}>
              <label for="auto-trim-checkbox" class="auto-write-label">自动修剪</label>
            </div>
            <button id="btn-show-trim-modal" class="interaction-btn btn-compact">手动修剪</button>
            <button id="history-toggle-batch" class="interaction-btn btn-compact">批量选择</button>
            <button id="history-delete-selected" class="interaction-btn danger-btn btn-compact" disabled>删除选中</button>
          </div>
          <div class="history-search">
            <input type="text" id="history-search-input" placeholder="搜索事件..." />
            <button id="history-search-clear" class="interaction-btn btn-compact">清除</button>
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

        // 批量选择/删除绑定
        const batchBtn = document.getElementById('history-toggle-batch');
        const delSelBtn = document.getElementById('history-delete-selected');
        const updateDeleteBtnState = () => {
          try {
            const container = $('.timeline-container');
            if (!container || !delSelBtn) return;
            const anyChecked = container.querySelectorAll('.timeline-select:checked').length > 0;
            delSelBtn.disabled = !anyChecked;
          } catch (_) {}
        };
        batchBtn?.addEventListener('click', () => {
          const container = $('.timeline-container');
          if (!container) return;
          const isOn = container.classList.toggle('batch-mode');
          // 显示/隐藏批量选择复选框
          /* 批量选择通过容器 .batch-mode 类控制显示，移除逐项内联样式切换 */
          updateDeleteBtnState();
        });
        delSelBtn?.addEventListener('click', async () => {
          try {
            const container = $('.timeline-container');
            if (!container) return;
            const checks = Array.from(container.querySelectorAll('.timeline-select:checked'));
            if (checks.length === 0) return;
            const seqs = checks.map(ch => String(ch.dataset.seq || '').trim()).filter(Boolean);
            if (seqs.length === 0) return;
            const msg = `将删除 ${seqs.length} 条历程事件。此操作不可恢复，是否继续？`;
            const doDelete = async () => { try { await JourneyComponent._deleteEventsBySeq(seqs); } catch (_) {} };
            if (window.GuixuMain?.showCustomConfirm) window.GuixuMain.showCustomConfirm(msg, doDelete, () => {});
            else if (confirm(msg)) await doDelete();
          } catch (e) { console.warn('[归墟] 批量删除失败:', e); }
        });
      }

      const body = $('#history-modal-body');
      if (!body) return;
      body.innerHTML = '<p class="modal-placeholder">正在读取命运之卷...</p>';

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
          // 展开/收起详细
          container.addEventListener('click', e => {
            // 单条删除
            const delBtn = e.target.closest('.btn-delete-event');
            if (delBtn) {
              e.preventDefault();
              e.stopPropagation();
              const seq = String(delBtn.dataset.seq || '').trim();
              if (!seq) return;
              const msg = '将删除该条历程事件，是否继续？此操作不可恢复。';
              const doDelete = async () => { try { await JourneyComponent._deleteEventsBySeq([seq]); } catch (_) {} };
              if (window.GuixuMain?.showCustomConfirm) window.GuixuMain.showCustomConfirm(msg, doDelete, () => {});
              else if (confirm(msg)) { doDelete(); }
              return;
            }
            // 勾选变化 -> 更新批量删除按钮状态
            if (e.target && e.target.classList && e.target.classList.contains('timeline-select')) {
              try {
                const delSelBtn = document.getElementById('history-delete-selected');
                if (delSelBtn) {
                  const anyChecked = container.querySelectorAll('.timeline-select:checked').length > 0;
                  delSelBtn.disabled = !anyChecked;
                }
              } catch (_) {}
              e.stopPropagation();
              return;
            }
            // 默认行为：切换详细信息
            const timelineEvent = e.target.closest('.timeline-event');
            if (!timelineEvent) return;
            const detailed = timelineEvent.querySelector('.timeline-detailed-info');
            if (!detailed) return;
            const isHidden = getComputedStyle(detailed).display === 'none';
            detailed.style.display = isHidden ? 'block' : 'none';
            
          });
        }
      } catch (err) {
        console.error('[归墟] 读取“本世历程”时出错:', err);
        body.innerHTML = `<p class="modal-placeholder">读取记忆时出现错误：${err.message}</p>`;
      }
    },

    renderJourneyFromEntry(entry) {
      if (!entry || !entry.content)
        return '<p class="modal-placeholder">此生尚未留下任何印记。</p>';

      const events = window.GuixuHelpers.parseJourneyEntry(entry.content);
      if (!Array.isArray(events) || events.length === 0)
        return '<p class="modal-placeholder">内容格式有误，无法解析事件。</p>';

      // 按序号排序
      events.sort((a, b) => (parseInt(a.序号, 10) || 0) - (parseInt(b.序号, 10) || 0));

      let html = '<div class="timeline-container"><div class="timeline-line"></div>';
      events.forEach((eventData, index) => {
        const eventId = `event-${entry.uid}-${index}`;
        const seq = eventData['序号'] || String(index + 1);
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

        // 放宽：渲染任意“标签|内容”键值到详细信息区（保留已知字段在固定区域）
        const KNOWN_KEYS = new Set(['序号','日期','标题','地点','描述','人物','人物关系','重要信息','暗线与伏笔','自动化系统','标签']);
        const extraDetails = Object.keys(eventData)
          .filter(k => !KNOWN_KEYS.has(k) && eventData[k] != null && String(eventData[k]).trim() !== '')
          .map(k => `<div class="detail-section"><strong>${k}：</strong>${String(eventData[k])}</div>`)
          .join('');

        const basicInfo = `
          <div class="timeline-header">
            <div class="timeline-date">${date}</div>
            <div class="timeline-tags">${tagsHtml}</div>
          </div>
          <div class="timeline-title">${title}</div>
          <div class="timeline-location">地点：${location}</div>
          <div class="timeline-description">${description}</div>
        `;

        const actionsHtml = `
          <div class="timeline-actions">
            <label class="batch-select">
              <input type="checkbox" class="timeline-select" data-seq="${seq}" />
              <span>选择</span>
            </label>
            <button class="interaction-btn danger-btn btn-delete-event btn-compact" data-seq="${seq}">删除</button>
          </div>
        `;
        const detailedInfo = `
          <div class="timeline-detailed-info" id="detailed-${eventId}">
            ${characters ? `<div class="detail-section"><strong>人物：</strong>${characters}</div>` : ''}
            ${relationships ? `<div class="detail-section"><strong>人物关系：</strong>${relationships}</div>` : ''}
            ${importantInfo ? `<div class="detail-section"><strong>重要信息：</strong>${importantInfo}</div>` : ''}
            ${hiddenPlot ? `<div class="detail-section"><strong>暗线与伏笔：</strong>${hiddenPlot}</div>` : ''}
            ${extraDetails}
            ${autoSystem ? `<div class="detail-section"><strong>自动化系统：</strong><pre class="timeline-auto-system">${autoSystem}</pre></div>` : ''}
          </div>
        `;

        html += `
          <div class="timeline-event" data-event-id="${eventId}">
            <div class="timeline-content">
              ${basicInfo}
              ${actionsHtml}
              ${detailedInfo}
            </div>
          </div>`;
      });
      html += '</div>';
      return html;
    },

    // 读取当前世界序号对应的“本世历程”条目
    async _getActiveJourneyEntry() {
      const bookName = window.GuixuConstants.LOREBOOK.NAME;
      const index = window.GuixuState.getState().unifiedIndex || 1;
      const journeyKey = index > 1
        ? `${window.GuixuConstants.LOREBOOK.ENTRIES.JOURNEY}(${index})`
        : window.GuixuConstants.LOREBOOK.ENTRIES.JOURNEY;

      const allEntries = await window.GuixuAPI.getLorebookEntries(bookName);
      const journeyEntry = allEntries.find(entry => (entry.comment || '').trim() === journeyKey.trim());
      return { bookName, journeyKey, journeyEntry };
    },

    // 将 parseJourneyEntry 得到的事件数组序列化回“键|值”空行分隔格式
    _serializeEvents(events) {
      if (!Array.isArray(events)) return '';
      const KEY_ORDER = ['序号','日期','标题','地点','描述','人物','人物关系','重要信息','暗线与伏笔','自动化系统','标签'];
      const blocks = events.map(ev => {
        // 按优先顺序输出已知键
        const lines = [];
        const emitted = new Set();
        KEY_ORDER.forEach(k => {
          if (ev[k] != null && ev[k] !== '') {
            const val = String(ev[k] ?? '');
            // 保留多行：后续行直接换行拼接
            lines.push(`${k}| ${val}`);
            emitted.add(k);
          }
        });
        // 额外附加未识别但存在的键，避免信息丢失
        Object.keys(ev).forEach(k => {
          if (emitted.has(k)) return;
          const v = ev[k];
          if (v == null || v === '') return;
          lines.push(`${k}| ${String(v)}`);
        });
        return lines.join('\n');
      });
      return blocks.join('\n\n');
    },

    // 按“序号”删除单条或多条事件，并写回世界书
    async _deleteEventsBySeq(seqList) {
      try {
        const seqs = Array.from(new Set((seqList || []).map(s => String(s).trim()).filter(Boolean)));
        if (seqs.length === 0) return;

        const { bookName, journeyEntry } = await this._getActiveJourneyEntry();
        if (!journeyEntry) {
          window.GuixuHelpers.showTemporaryMessage('未找到本世历程条目，无法删除');
          return;
        }

        const events = window.GuixuHelpers.parseJourneyEntry(journeyEntry.content || '');
        if (!Array.isArray(events) || events.length === 0) {
          window.GuixuHelpers.showTemporaryMessage('没有可删除的事件');
          return;
        }

        const before = events.length;
        const filtered = events.filter(ev => !seqs.includes(String(ev['序号'] || '').trim()));
        const removed = before - filtered.length;
        if (removed <= 0) {
          window.GuixuHelpers.showTemporaryMessage('未匹配到要删除的事件');
          return;
        }

        // 按原“序号”排序，并重新按 1..n 自动重排
        const sorted = filtered
          .slice()
          .sort((a, b) => (parseInt(a['序号'], 10) || 0) - (parseInt(b['序号'], 10) || 0));
        sorted.forEach((ev, idx) => { ev['序号'] = String(idx + 1); });

        const newContent = this._serializeEvents(sorted);
        await window.GuixuAPI.setLorebookEntries(bookName, [{ uid: journeyEntry.uid, content: newContent }]);

        // 刷新当前视图
        try {
          const { $ } = window.GuixuDOM;
          const body = $('#history-modal-body');
          if (body) {
            // 直接使用刚更新的内容重渲染
            const updatedEntry = { ...journeyEntry, content: newContent };
            body.innerHTML = this.renderJourneyFromEntry(updatedEntry);
          }
        } catch (_) {}

        window.GuixuHelpers.showTemporaryMessage(`已删除 ${removed} 条历程事件`);
      } catch (e) {
        console.error('[归墟] 删除历程事件失败:', e);
        window.GuixuHelpers.showTemporaryMessage('删除失败');
      }
    }
  };

  window.JourneyComponent = JourneyComponent;
})(window);
