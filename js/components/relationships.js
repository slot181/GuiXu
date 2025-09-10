(function (window) {
  'use strict';

  if (!window.GuixuDOM || !window.GuixuBaseModal || !window.GuixuAPI || !window.GuixuHelpers) {
    console.error('[归墟] RelationshipsComponent 初始化失败：缺少依赖(GuixuDOM/GuixuBaseModal/GuixuAPI/GuixuHelpers)。');
    return;
  }

  const RelationshipsComponent = {
    async show() {
      const { $ } = window.GuixuDOM;
      window.GuixuBaseModal.open('relationships-modal');

      const body = $('#relationships-modal .modal-body');
      if (!body) return;

      body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">正在梳理人脉...</p>';

      try {
        const currentId = window.GuixuAPI.getCurrentMessageId();
        let messages = await window.GuixuAPI.getChatMessages(currentId);
        let stat_data = messages?.[0]?.data?.stat_data;

        // 楼层回退：当前楼层无 stat_data 时，回退读取 0 楼用于只读展示（对齐 guimi.html）
        if (!stat_data || (typeof stat_data === 'object' && Object.keys(stat_data).length === 0)) {
          try {
            const msgs0 = await window.GuixuAPI.getChatMessages(0);
            const sd0 = msgs0?.[0]?.data?.stat_data;
            if (sd0 && Object.keys(sd0).length > 0) {
              messages = msgs0;
              stat_data = sd0;
              console.info('[归墟] 人物关系：使用 0 楼 mvu 数据只读展示。');
            }
          } catch (_) { }
        }

        if (window.GuixuMain && typeof window.GuixuMain._deepStripMeta === 'function') {
          stat_data = window.GuixuMain._deepStripMeta(stat_data);
        }
        
        if (!stat_data) {
          body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">无法获取人物关系数据。</p>';
          return;
        }

        let relationships = window.GuixuHelpers.readList(stat_data, '人物关系列表');

        // 兼容：字符串化 JSON
        if (typeof relationships === 'string') {
          try {
            relationships = JSON.parse(relationships);
          } catch (e) {
            console.error('[归墟] 解析人物关系列表字符串失败:', e);
            relationships = [];
          }
        }

        body.innerHTML = this.render(relationships || []);
      } catch (error) {
        console.error('[归墟] 加载人物关系时出错:', error);
        body.innerHTML = `<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">加载人物关系时出错: ${error.message}</p>`;
      }
    },

    render(relationships) {
      const h = window.GuixuHelpers;

      if (!Array.isArray(relationships) || relationships.length === 0) {
        return '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">红尘俗世，暂无纠葛。</p>';
      }

      let html = '';
      relationships.forEach(rawRel => {
        try {
          const rel = typeof rawRel === 'string' ? JSON.parse(rawRel) : rawRel;

          const name = h.SafeGetValue(rel, 'name', '未知之人');
          const tier = h.SafeGetValue(rel, 'tier', '凡人');
          const level = h.SafeGetValue(rel, 'level', h.SafeGetValue(rel, '等级', ''));
          const relationship = h.SafeGetValue(rel, 'relationship', 'NEUTRAL');
          const relationshipCN = RelationshipsComponent._toChineseRelationship(relationship);
          const description = h.SafeGetValue(rel, 'description', h.SafeGetValue(rel, '身份背景', '背景不详'));
          const favorability = parseInt(h.SafeGetValue(rel, 'favorability', 0), 10);
          const eventHistoryRaw = rel.event_history || [];
          const eventHistory = Array.isArray(eventHistoryRaw)
            ? eventHistoryRaw
            : (eventHistoryRaw && typeof eventHistoryRaw === 'object'
              ? Object.keys(eventHistoryRaw)
                .filter(k => k !== '$meta')
                .map(k => {
                  const v = eventHistoryRaw[k];
                  if (typeof v === 'string') return v;
                  try {
                    return window.GuixuHelpers.SafeGetValue(v, 'description', window.GuixuHelpers.SafeGetValue(v, 'name', JSON.stringify(v)));
                  } catch (_) {
                    try { return JSON.stringify(v); } catch { return String(v); }
                  }
                })
              : []);

          const tierStyle = h.getTierStyle(tier);
          const favorabilityPercent = Math.max(0, Math.min(100, (favorability / 200) * 100)); // 假设好感度上限为200
          const cultivationDisplay = level ? `${tier} ${level}` : tier;

          // 新增：关系类型与权限
          const relationshipType = String((relationship || 'NEUTRAL')).toUpperCase();
          const allowView = (String(h.SafeGetValue(rel, 'allow_view', false)).toLowerCase() === 'true') || h.SafeGetValue(rel, 'allow_view', false) === true;
          const allowTrade = (String(h.SafeGetValue(rel, 'allow_trade', false)).toLowerCase() === 'true') || h.SafeGetValue(rel, 'allow_trade', false) === true;
          const marked = RelationshipsComponent._isMarked(name);

          const relJson = JSON.stringify(rel).replace(/'/g, "&#39;");
          html += `
            <div class="relationship-card" data-relationship="${relationshipType}" data-relationship-details='${relJson}'>
              <div class="relationship-header">
                <div class="header-title">
                  <p class="relationship-name" style="${tierStyle}">${name}</p>
                  <div class="header-sub">
                    <span class="rel-badge">${relationshipCN}</span>
                    ${allowView ? '<span class="rel-badge">可见</span>' : ''}
                    ${allowTrade ? '<span class="rel-badge">可交易</span>' : ''}
                  </div>
                </div>
                <div class="rel-actions">
                  <button class="btn-detail ${allowView ? 'primary' : ''}" ${allowView ? '' : 'disabled'}>详细</button>
                  <button class="btn-trade ${allowTrade ? 'primary' : ''}" ${allowTrade ? '' : 'disabled'}>交易</button>
                  <button class="interaction-btn btn-extract" data-rel-name="${name}">提取</button>
                  <button class="interaction-btn btn-mark ${marked ? 'primary' : ''}" data-rel-name="${name}">${marked ? '取消标注' : '标注'}</button>
                  <button class="btn-delete-relationship">删除</button>
                </div>
              </div>
              <div class="relationship-body">
                <p class="rel-desc">${description}</p>

                <div class="relationship-meta">
                  <span class="rel-badge">关系：${relationshipCN}</span>
                  <span class="rel-badge">修为：<span style="${tierStyle}">${cultivationDisplay}</span></span>
                </div>

                <p style="margin-top: 10px;">好感度: ${favorability}</p>
                <div class="favorability-bar-container">
                  <div class="favorability-bar-fill" style="width: ${favorabilityPercent}%;"></div>
                </div>

                ${Array.isArray(eventHistory) && eventHistory.length > 0
              ? `
                      <details class="event-history-details">
                        <summary class="event-history-summary">过往交集</summary>
                        <ul class="event-history-list">
                          ${eventHistory
                .map((event, i) => (event)
                  ? `<li class="event-history-item" data-ev-idx="${i}">
                                   <span class="event-text" title="点击可编辑">${event}</span>
                                   <button class="ev-del-btn" title="删除此记录">×</button>
                                 </li>`
                  : '')
                .join('')}
                        </ul>
                        <div class="event-history-actions">
                          <button class="interaction-btn ev-add-btn" title="新增一条过往交集" style="padding: 2px 8px; font-size: 12px;">新增交集</button>
                        </div>
                      </details>
                    `
              : ''
            }
              </div>
            </div>
          `;
        } catch (e) {
          console.error('[归墟] 解析人物关系失败:', rawRel, e);
        }
      });

      return html || '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">红尘俗世，暂无纠葛。</p>';
    },

    bindEvents(container) {
      container.addEventListener('click', async (e) => {
        const card = e.target.closest('.relationship-card');
        const getRelFromCard = () => {
          if (!card) return null;
          try { return JSON.parse(card.dataset.relationshipDetails.replace(/&#39;/g, "'")); } catch { return null; }
        };

        // 编辑过往交集：点击文字进入编辑
        const evText = e.target.closest('.event-text');
        if (evText && card) {
          e.preventDefault();
          e.stopPropagation();
          // 防重入
          if (evText._editing) return;
          evText._editing = true;

          const li = evText.closest('.event-history-item');
          const idx = li ? parseInt(li.getAttribute('data-ev-idx'), 10) : -1;
          const oldText = evText.textContent || '';
          const input = document.createElement('textarea');
          input.className = 'event-edit-input';
          input.value = oldText;
          // 适配移动端：行数自适应
          input.rows = Math.max(1, Math.min(4, Math.ceil(oldText.length / 22)));

          // 替换节点
          evText.style.display = 'none';
          evText.insertAdjacentElement('afterend', input);
          input.focus();
          input.setSelectionRange(0, input.value.length);

          const cleanup = () => {
            try { input.remove(); } catch (_) { }
            evText.style.display = '';
            evText._editing = false;
          };

          const commit = async () => {
            const newVal = String(input.value || '').trim();
            if (newVal === oldText) { cleanup(); return; }
            const relData = getRelFromCard();
            if (!relData || !Number.isInteger(idx) || idx < 0) { cleanup(); return; }
            try {
              await RelationshipsComponent._updateEventHistoryItem(relData, idx, newVal);
              window.GuixuHelpers?.showTemporaryMessage?.('已更新过往交集');
            } catch (err) {
              console.warn('[归墟] 更新过往交集失败:', err);
              window.GuixuHelpers?.showTemporaryMessage?.('更新失败');
            } finally {
              cleanup();
            }
          };

          input.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); commit(); }
            else if (ke.key === 'Escape') { ke.preventDefault(); cleanup(); }
          });
          input.addEventListener('blur', () => commit());
          return;
        }

        // 新增过往交集
        const addBtn = e.target.closest('.ev-add-btn');
        if (addBtn && card) {
          e.preventDefault();
          e.stopPropagation();
          const relData = getRelFromCard();
          if (!relData) return;
          // 使用内联新增编辑框
          const details = addBtn.closest('.event-history-details');
          const list = details?.querySelector('.event-history-list');
          if (!list) return;

          const newLi = document.createElement('li');
          newLi.className = 'event-history-item';
          newLi.setAttribute('data-ev-idx', String((list.children?.length || 0)));
          newLi.innerHTML = `
                <textarea class="event-edit-input" placeholder="请输入新的过往交集..." rows="2"></textarea>
                <button class="ev-del-btn" title="删除此记录">×</button>
              `;
          list.appendChild(newLi);
          const input = newLi.querySelector('.event-edit-input');
          input?.focus();

          const commitNew = async () => {
            const txt = String(input.value || '').trim();
            if (!txt) { try { newLi.remove(); } catch (_) { } return; }
            // 使用新建条目的 data-ev-idx 作为写回索引；若缺失则根据列表现有最大索引递增
            let i = Number.parseInt(newLi.getAttribute('data-ev-idx'), 10);
            if (!Number.isFinite(i) || i < 0) {
              const existing = Array.from(list.querySelectorAll('.event-history-item')).filter(el => el !== newLi);
              const lastIdx = existing.reduce((m, el) => Math.max(m, Number.parseInt(el.getAttribute('data-ev-idx'), 10) || -1), -1);
              i = lastIdx + 1;
            }
            try {
              await RelationshipsComponent._updateEventHistoryItem(relData, i, txt);
              window.GuixuHelpers?.showTemporaryMessage?.('已新增过往交集');
            } catch (err) {
              console.warn('[归墟] 新增过往交集失败:', err);
              window.GuixuHelpers?.showTemporaryMessage?.('新增失败');
            }
          };

          input.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); commitNew(); }
            else if (ke.key === 'Escape') { ke.preventDefault(); try { newLi.remove(); } catch (_) { } }
          });
          input.addEventListener('blur', () => commitNew());
          return;
        }

        // 删除过往交集（点击红色圆形×按钮即时删除）
        const delBtn = e.target.closest('.ev-del-btn');
        if (delBtn && card) {
          e.preventDefault();
          e.stopPropagation();
          const li = delBtn.closest('.event-history-item');
          const idx = li ? parseInt(li.getAttribute('data-ev-idx'), 10) : -1;
          const relData = getRelFromCard();
          if (Number.isInteger(idx) && idx >= 0 && relData) {
            try {
              await RelationshipsComponent._deleteEventHistoryItem(relData, idx);
              window.GuixuHelpers?.showTemporaryMessage?.('已删除过往交集');
            } catch (err) {
              console.warn('[归墟] 删除过往交集失败:', err);
              window.GuixuHelpers?.showTemporaryMessage?.('删除失败');
            }
          }
          return;
        }

        // 查看详细
        if (e.target.classList.contains('btn-detail')) {
          const relData = getRelFromCard();
          if (!relData) return;
          const allowView = (String(window.GuixuHelpers.SafeGetValue(relData, 'allow_view', false)).toLowerCase() === 'true') || window.GuixuHelpers.SafeGetValue(relData, 'allow_view', false) === true;
          if (!allowView) {
            window.GuixuHelpers.showTemporaryMessage('对方未授权查看详细信息（allow_view = false）');
            return;
          }
          await this.showCharacterDetails(relData);
          return;
        }

        // 交易（强化：总是以最新MVU状态校验 allow_trade）
        if (e.target.classList.contains('btn-trade')) {
          const relData = getRelFromCard();
          if (!relData) return;
          try {
            const messages = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
            const sd = (messages?.[0]?.data?.stat_data) || {};
            const arr = window.GuixuHelpers.readList(sd, '人物关系列表');
            const h = window.GuixuHelpers;
            const rid = h.SafeGetValue(relData, 'id', null);
            const rname = h.SafeGetValue(relData, 'name', null);
            const latest = arr.map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } })
              .find(o => o && ((rid != null && h.SafeGetValue(o, 'id', null) === rid) || (rname && h.SafeGetValue(o, 'name', null) === rname))) || relData;
            const allowTradeNow = (String(h.SafeGetValue(latest, 'allow_trade', false)).toLowerCase() === 'true') || h.SafeGetValue(latest, 'allow_trade', false) === true;
            if (!allowTradeNow) {
              window.GuixuHelpers.showTemporaryMessage('该角色不接受交易（allow_trade = false）');
              return;
            }
            this.openTradePanel(latest);
          } catch (err) {
            console.warn('[归墟] 检查交易资格失败:', err);
            window.GuixuHelpers.showTemporaryMessage('无法校验交易资格');
          }
          return;
        }

        // 删除
        if (e.target.classList.contains('btn-delete-relationship')) {
          if (card) {
            const relData = getRelFromCard();
            if (relData) await this.deleteRelationship(relData);
          }
          return;
        }

        // 提取
        if (e.target.classList.contains('btn-extract')) {
          const relData = getRelFromCard();
          if (!relData) return;
          await RelationshipsComponent._extractCharacterToLorebook(relData);
          const settings = RelationshipsComponent._getExtractSettings();
          if (settings.autoDeleteAfterExtract) {
            await RelationshipsComponent.deleteRelationship(relData);
          }
          return;
        }

        // 标注/取消标注
        if (e.target.classList.contains('btn-mark')) {
          const relData = getRelFromCard();
          if (!relData) return;
          const name = window.GuixuHelpers.SafeGetValue(relData, 'name', '');
          const isMarked = RelationshipsComponent._toggleMarked(name);
          e.target.textContent = isMarked ? '取消标注' : '标注';
          e.target.classList.toggle('primary', isMarked);
          return;
        }
      });
    },

    async deleteRelationship(relToDelete, opts = {}) {
      const h = window.GuixuHelpers;
      const relName = h.SafeGetValue(relToDelete, 'name', '未知之人');
      const silent = !!(opts && opts.silent);

      let confirmed = true;
      if (!silent) {
        confirmed = await new Promise(resolve =>
          window.GuixuMain.showCustomConfirm(
            `确定要删除与【${relName}】的关系吗？此操作不可逆，将直接从角色数据中移除。`,
            () => resolve(true),
            () => resolve(false)
          )
        );
      }

      if (!confirmed) {
        h.showTemporaryMessage('操作已取消');
        return;
      }

      try {
        const messages = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
        if (!messages || !messages[0] || !messages[0].data || !messages[0].data.stat_data) {
          throw new Error('无法获取角色数据。');
        }
        const currentMvuState = messages[0].data;
        const stat_data = currentMvuState.stat_data;

        // 使用统一定位器，兼容：对象字典/旧数组包装/字符串化容器
        let loc = RelationshipsComponent._locateNpcInState(stat_data, relToDelete);
        if (!loc) {
          try {
            if (RelationshipsComponent._rebuildRelationshipDict(stat_data)) {
              loc = RelationshipsComponent._locateNpcInState(stat_data, relToDelete);
            }
          } catch (_) { /* ignore */ }
        }
        if (!loc) {
          throw new Error('找不到人物关系列表。');
        }
        const { containerType, matchKeyOrIdx } = loc;

        if (containerType === 'object') {
          // 容器可能是字符串化的对象字典，保持原类型写回
          const wasStringContainer = (typeof stat_data['人物关系列表'] === 'string');
          let dict;
          try { dict = wasStringContainer ? JSON.parse(stat_data['人物关系列表']) : stat_data['人物关系列表']; } catch (_) { dict = {}; }
          if (!dict || typeof dict !== 'object' || Array.isArray(dict)) dict = {};
          if (Object.prototype.hasOwnProperty.call(dict, matchKeyOrIdx)) {
            delete dict[matchKeyOrIdx];
          } else {
            throw new Error(`在列表中未找到人物: ${relName}`);
          }
          stat_data['人物关系列表'] = wasStringContainer ? JSON.stringify(dict) : dict;
        } else {
          // 旧结构 [ [ ... ] ]：保持包装层
          const wrap = Array.isArray(stat_data['人物关系列表']) ? stat_data['人物关系列表'] : [[]];
          const list = Array.isArray(wrap[0]) ? wrap[0] : [];
          const idx = Number(matchKeyOrIdx);
          if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
            throw new Error(`在列表中未找到人物: ${relName}`);
          }
          list.splice(idx, 1);
          stat_data['人物关系列表'] = [list];
        }

        // 同步当前楼层与 0 楼
        const currentId = window.GuixuAPI.getCurrentMessageId();
        const updates = [{ message_id: currentId, data: currentMvuState }];
        if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
        await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });

        h.showTemporaryMessage(`与【${relName}】的关系已删除。`);
        await this.show();
        // 同步主界面（如有装备信息联动）
        if (window.GuixuMain?.updateDynamicData) {
          window.GuixuMain.updateDynamicData();
        }

      } catch (error) {
        console.error('删除人物关系时出错:', error);
        h.showTemporaryMessage(`删除失败: ${error.message}`);
      }
    },

    // 更新指定人物的过往交集事件内容（按原始索引），实时写回 MVU
    async _updateEventHistoryItem(relRef, evIndex, newText) {
      const _ = window.GuixuAPI?.lodash || window._ || {
        get: (obj, path, def) => {
          try {
            const val = path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
            return val === undefined ? def : val;
          } catch { return def; }
        },
        set: (obj, path, value) => {
          try {
            const keys = path.split('.');
            let o = obj;
            while (keys.length > 1) {
              const k = keys.shift();
              if (!o[k] || typeof o[k] !== 'object') o[k] = {};
              o = o[k];
            }
            o[keys[0]] = value;
          } catch { }
          return obj;
        },
      };
      const h = window.GuixuHelpers;
      try {
        const currentId = window.GuixuAPI.getCurrentMessageId();
        const messages = await window.GuixuAPI.getChatMessages(currentId);
        if (!messages || !messages[0]) throw new Error('无法读取当前聊天数据');

        const currentMvuState = messages[0].data || {};
        currentMvuState.stat_data = currentMvuState.stat_data || {};
        const stat_data = currentMvuState.stat_data;

        // 统一定位NPC并更新其 event_history
        let loc = RelationshipsComponent._locateNpcInState(stat_data, relRef);
        if (!loc) {
          try {
            if (RelationshipsComponent._rebuildRelationshipDict(stat_data)) {
              loc = RelationshipsComponent._locateNpcInState(stat_data, relRef);
            }
          } catch (_) { /* ignore */ }
        }
        if (!loc) throw new Error('在人物关系列表中未找到该角色');
        const { containerType, matchKeyOrIdx, relObj, originalRelEntry } = loc;

        const obj = (relObj && typeof relObj === 'object') ? relObj : {};
        // 兼容两种结构：对象字典({$meta,...}) 与 数组
        const ensureObjectHistory = () => {
          const now = obj.event_history;
          if (now && typeof now === 'object' && !Array.isArray(now)) return now;
          // 若不存在或是数组，优先创建对象字典（符合新MVU规范）
          const dict = { $meta: { extensible: true } };
          // 将旧数组迁移到对象字典，保留顺序为 e1,e2,...
          if (Array.isArray(now)) {
            now.forEach((txt, idx) => {
              const key = `e${idx + 1}`;
              dict[key] = String(txt ?? '').trim();
            });
          }
          obj.event_history = dict;
          return dict;
        };
        const ensureArrayHistory = () => {
          const now = obj.event_history;
          if (Array.isArray(now)) return now;
          // 若是对象，则按键顺序转为数组视图（仅用于索引定位），但不回写为数组
          const keys = Object.keys(now || {}).filter(k => k !== '$meta');
          return keys.map(k => now[k]);
        };

        const i = Math.max(0, parseInt(evIndex, 10) || 0);
        const cur = obj.event_history;

        if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
          // 对象字典：按可见顺序定位键并更新原键；若是新增则生成新键
          const keys = Object.keys(cur).filter(k => k !== '$meta');
          const key = i < keys.length ? keys[i] : `e${Date.now()}`;
          cur[key] = String(newText || '').trim();
        } else {
          // 数组：原地更新，不改变其它项
          const arr = Array.isArray(cur) ? cur : [];
          while (arr.length <= i) arr.push('');
          arr[i] = String(newText || '').trim();
          obj.event_history = arr;
        }

        // 写回（保持原容器类型）
        if (containerType === 'object') {
          const wasStringContainer = (typeof stat_data['人物关系列表'] === 'string');
          let dict;
          try { dict = wasStringContainer ? JSON.parse(stat_data['人物关系列表']) : stat_data['人物关系列表']; } catch (_) { dict = {}; }
          if (!dict || typeof dict !== 'object' || Array.isArray(dict)) dict = {};
          dict[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(obj) : obj;
          stat_data['人物关系列表'] = wasStringContainer ? JSON.stringify(dict) : dict;
        } else {
          const wrap = Array.isArray(stat_data['人物关系列表']) ? stat_data['人物关系列表'] : [[]];
          const list = Array.isArray(wrap[0]) ? wrap[0] : [];
          list[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(obj) : obj;
          stat_data['人物关系列表'] = [list];
        }

        const updates = [{ message_id: currentId, data: currentMvuState }];
        if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
        await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });

        // 刷新界面（若面板仍打开）
        await this._refreshAllRelatedUI();
      } catch (e) {
        console.error('[归墟] _updateEventHistoryItem 失败:', e);
        throw e;
      }
    },

    async show() {
      const { $ } = window.GuixuDOM;
      window.GuixuBaseModal.open('relationships-modal');

      const body = $('#relationships-modal .modal-body');
      if (!body) return;

      body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">正在梳理人脉...</p>';

      try {
        const currentId = window.GuixuAPI.getCurrentMessageId();
        let messages = await window.GuixuAPI.getChatMessages(currentId);
        let stat_data = messages?.[0]?.data?.stat_data;

        // 楼层回退：当前楼层无 stat_data 时，回退读取 0 楼用于只读展示（对齐 guimi.html）
        if (!stat_data || (typeof stat_data === 'object' && Object.keys(stat_data).length === 0)) {
          try {
            const msgs0 = await window.GuixuAPI.getChatMessages(0);
            const sd0 = msgs0?.[0]?.data?.stat_data;
            if (sd0 && Object.keys(sd0).length > 0) {
              messages = msgs0;
              stat_data = sd0;
              console.info('[归墟] 人物关系：使用 0 楼 mvu 数据只读展示。');
            }
          } catch (_) { }
        }

        if (window.GuixuMain && typeof window.GuixuMain._deepStripMeta === 'function') {
          stat_data = window.GuixuMain._deepStripMeta(stat_data);
        }
        
        if (!stat_data) {
          body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">无法获取人物关系数据。</p>';
          return;
        }

        let relationships = window.GuixuHelpers.readList(stat_data, '人物关系列表');

        if (typeof relationships === 'string') {
          try {
            relationships = JSON.parse(relationships);
          } catch (e) {
            console.error('[归墟] 解析人物关系列表字符串失败:', e);
            relationships = [];
          }
        }

        const h = window.GuixuHelpers;

        // 关系类型集合（中文映射），并按固定顺序排序
        const ORDER = ['敌对', '盟友', '中立', '朋友', '恋人'];
        const typeSet = new Set();
        const counts = {};
        let totalCount = 0;
        (Array.isArray(relationships) ? relationships : []).forEach(raw => {
          if (!raw) return;
          try {
            const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const rel = h.SafeGetValue(obj, 'relationship', 'NEUTRAL');
            const relCN = RelationshipsComponent._toChineseRelationship(rel);
            typeSet.add(relCN);
            counts[relCN] = (counts[relCN] || 0) + 1;
            totalCount += 1;
          } catch (_) { }
        });
        const orderedTypes = ORDER.filter(t => typeSet.has(t));
        const extraTypes = Array.from(typeSet).filter(t => !ORDER.includes(t));
        const allTabs = ['全部', ...orderedTypes, ...extraTypes];

        const tabsHtml = allTabs.map((t, i) => {
          const cnt = t === '全部' ? totalCount : (counts[t] || 0);
          return `<button class="rel-tab${i === 0 ? ' active' : ''}" data-type="${t}">` +
            `<span class="rel-tab-label">${t}</span>` +
            `<span class="rel-tab-count">${cnt}</span>` +
            `</button>`;
        }).join('');

        body.innerHTML = `
          <style>
            /* 统一为顶部标签布局（移动端与桌面端一致） */
            .rel-layout { display: flex; flex-direction: column; gap: 12px; }

            /* 标签区域：水平滚动 chips */
            .rel-tabs {
              display: flex;
              gap: 8px;
              flex-wrap: nowrap;
              overflow-x: auto;
              padding-bottom: 4px;
              border-bottom: 1px dashed rgba(201,170,113,0.25);
              scrollbar-width: thin;
            }

            /* 统一标签尺寸与视觉 */
            .rel-tab {
              appearance: none;
              border: 1px solid rgba(201,170,113,0.35);
              background: rgba(201,170,113,0.08);
              color: #c9aa71;
              border-radius: 18px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              height: 36px;
              padding: 0 12px;
              font-size: 13px;
              line-height: 36px;
              white-space: nowrap;
              cursor: pointer;
              flex: 0 0 auto;
              min-width: 72px;
              transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
            }
            .rel-tab:hover {
              background: rgba(201,170,113,0.12);
              border-color: rgba(201,170,113,0.5);
            }
            .rel-tab.active {
              background: linear-gradient(180deg, rgba(201,170,113,0.25), rgba(201,170,113,0.12));
              box-shadow: 0 0 6px rgba(201,170,113,0.25) inset;
              border-color: rgba(201,170,113,0.6);
            }
            .rel-tab .rel-tab-label { flex: 1; }
            .rel-tab .rel-tab-count {
              margin-left: 8px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              height: 20px;
              min-width: 22px;
              padding: 0 6px;
              border-radius: 10px;
              border: 1px solid rgba(201,170,113,0.35);
              background: rgba(201,170,113,0.08);
              color: #e8e3d6;
              font-size: 11px;
              line-height: 20px;
            }

            .rel-content { display: flex; flex-direction: column; gap: 10px; }
            .rel-toolbar { display:flex; }
            .rel-settings {
              display: flex;
              flex-wrap: wrap;
              align-items: center;
              gap: 8px;
              margin: 6px 0 4px;
              color: #c9aa71;
              font-size: 12px;
            }
            .rel-settings label { display: inline-flex; align-items: center; gap: 6px; }

            /* 移动端：设置区网格化，按钮全宽一致（嵌入式/非全屏同样适配） */
            .guixu-root-container.mobile-view #relationships-modal .rel-settings {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 8px;
              align-items: center;
            }
            .guixu-root-container.mobile-view #relationships-modal .rel-settings label {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              min-width: 0;
            }
            .guixu-root-container.mobile-view #relationships-modal #rel-auto-extract-threshold {
              width: 100%;
              height: 32px;
              box-sizing: border-box;
            }
            .guixu-root-container.mobile-view #relationships-modal #rel-clear-character-entries {
              grid-column: 1 / -1;   /* 占满一行 */
              width: 100%;
              min-width: 0;
              height: 36px;
              padding: 0 12px;
              box-sizing: border-box;
            }

            /* 关系卡片美化与动态效果 */
            .relationship-card {
              position: relative;
              border: 1px solid rgba(201,170,113,0.28);
              border-radius: 12px;
              padding: 12px;
              box-shadow: 0 0 8px rgba(201,170,113,0.08) inset;
              transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
              will-change: transform;
            }

            .relationship-card:hover {
              transform: translateY(-2px) scale(1.01);
              box-shadow: 0 8px 22px rgba(201,170,113,0.16), 0 0 10px rgba(201,170,113,0.18) inset;
              border-color: rgba(201,170,113,0.45);
            }

            .relationship-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              margin-bottom: 6px;
            }
            .relationship-name {
              margin: 0;
              font-size: 16px;
              font-weight: 800;
              color: #e8e3d6;
              text-shadow: 0 0 6px rgba(201,170,113,0.15);
              white-space: nowrap;      /* 移动端防止姓名被挤压换行成竖排 */
              overflow: hidden;         /* 超出隐藏 */
              text-overflow: ellipsis;  /* 尾部省略号 */
            }
            .relationship-header .header-left {
              display: inline-flex;
              align-items: center;
              gap: 10px;
              min-width: 0;
            }
            .rel-avatar {
              flex: 0 0 auto;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              border: 1px solid rgba(201,170,113,0.5);
              background: radial-gradient(circle, rgba(201,170,113,0.15), rgba(26,26,46,0.8));
              color: #c9aa71;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 14px;
              box-shadow: 0 2px 8px rgba(201,170,113,0.15) inset;
            }
            .header-title {
              display: flex;
              flex-direction: column;
              gap: 2px;
              min-width: 0;
            }
            .header-sub {
              display: inline-flex;
              flex-wrap: wrap;
              gap: 6px;
            }
            .rel-badge {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border: 1px solid rgba(201,170,113,0.35);
              background: rgba(201,170,113,0.08);
              color: #c9aa71;
              font-size: 11px;
              border-radius: 999px;
              padding: 2px 8px;
              white-space: nowrap;
            }
            .rel-actions {
              display: flex;
              gap: 6px;
              flex: 0 0 auto;
            }
            /* 提取/标注按钮与“交易/详细”统一尺寸与风格（严格对齐 guixu.css 中的 .rel-actions .btn-trade/.btn-detail） */
            .rel-actions .btn-extract,
            .rel-actions .btn-mark {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              height: 28px;
              padding: 0 10px;
              font-size: 12px;
              border-radius: 4px;
              border: 1px solid #c9aa71;
              background: linear-gradient(45deg, #1a1a2e, #2d1b3d);
              color: #c9aa71;
              cursor: pointer;
              transition: all 0.2s ease;
            }
            .rel-actions .btn-extract:hover,
            .rel-actions .btn-mark:hover {
              background: linear-gradient(45deg, #2d1b3d, #3d2b4d);
              border-color: #c9aa71;
              color: #c9aa71;
            }
            .rel-actions .btn-extract.primary,
            .rel-actions .btn-mark.primary {
              background: linear-gradient(45deg, #8b4513, #cd853f);
              border-color: #daa520;
              color: #fff;
            }
            .rel-actions .btn-extract.primary:hover,
            .rel-actions .btn-mark.primary:hover {
              background: linear-gradient(45deg, #cd853f, #daa520);
              border-color: #daa520;
              color: #fff;
            }
            /* 遵循全局按钮风格，避免悬停时出现半透明 */
            .rel-actions .btn-detail:hover,
            .rel-actions .btn-trade:hover {
              background: linear-gradient(45deg, #2d1b3d, #3d2b4d);
              border-color: #c9aa71;
              color: #c9aa71;
            }
            .rel-actions .btn-detail.primary:hover,
            .rel-actions .btn-trade.primary:hover {
              background: linear-gradient(45deg, #cd853f, #daa520);
              border-color: #daa520;
              color: #fff;
            }
            .rel-actions button:disabled {
              opacity: 0.6;
              cursor: not-allowed;
            }
            /* 删除按钮：与背包按钮完全一致，使用 guixu.css 全局 .btn-delete-relationship 样式；此处不覆盖 */
            /* 保留禁用态的通用语义（若需要） */
            .rel-actions .btn-delete-relationship:disabled {
              opacity: .6;
              cursor: not-allowed;
            }
            .relationship-body p { margin: 0; }
            .rel-desc {
              margin: 0;
              color: #d9d3c5;
              display: -webkit-box;
              -webkit-line-clamp: 3;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
            .relationship-body .relationship-meta {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
              font-size: 12px;
              color: #d9d3c5;
              margin-top: 8px;
            }
            .favorability-bar-container {
              height: 8px;
              border-radius: 6px;
              background: rgba(201,170,113,0.15);
              border: 1px solid rgba(201,170,113,0.25);
              overflow: hidden;
              margin-top: 6px;
            }
            .favorability-bar-fill {
              height: 100%;
              background: linear-gradient(90deg, #8bc34a, #ffd93d, #ff6b6b);
              width: 0%;
              transition: width 0.35s ease;
            }
            .event-history-details summary {
              cursor: pointer;
              color: #c9aa71;
              margin-top: 8px;
            }
            .event-history-details[open] summary {
              text-shadow: 0 0 6px rgba(201,170,113,0.25);
            }
            /* 过往交集项与删除按钮样式（遵循 danger 色系） */
            .event-history-list { list-style: none; padding-left: 0; margin: 6px 0 0; }
            .event-history-item { 
              display: flex; 
              align-items: center; 
              justify-content: space-between; 
              gap: 8px; 
              padding: 6px 8px; 
              border-bottom: 1px dashed rgba(201,170,113,0.2);
            }
            .event-history-item:last-child { border-bottom: none; }
            .event-history-item .event-text { 
              flex: 1 1 auto; 
              color: #d9d3c5; 
              font-size: 12px; 
              word-break: break-word;
            }
            .ev-del-btn {
              flex: 0 0 auto;
              width: 20px;
              height: 20px;
              border-radius: 50%;
              border: 1px solid #ff6b6b;
              background: #8b0000;
              color: #fff;
              line-height: 18px;
              text-align: center;
              font-size: 12px;
              cursor: pointer;
            }
            .ev-del-btn:hover { background: #a52a2a; }

            /* 过往交集编辑态输入框 */
            .event-edit-input {
              flex: 1 1 auto;
              min-height: 28px;
              background: rgba(26,26,46,0.5);
              color: #e8e3d6;
              border: 1px solid rgba(201,170,113,0.35);
              border-radius: 6px;
              padding: 4px 6px;
              font-size: 12px;
              outline: none;
            }
            .event-history-actions {
              margin-top: 8px;
              display: flex;
              justify-content: flex-end;
            }

            @media (hover: none) {
              .relationship-card:hover { transform: none; box-shadow: 0 0 8px rgba(201,170,113,0.08) inset; }
            }

          </style>

          <div class="rel-layout" id="rel-root">
            <div class="rel-tabs" id="rel-tabs">${tabsHtml}</div>
            <div class="rel-content">
              <div class="rel-toolbar">
                <input id="rel-search-input" class="gx-input" type="search" placeholder="搜索姓名/描述..." />
              </div>
              <div class="rel-settings">
                <label><input type="checkbox" id="rel-auto-extract-toggle" /> 自动提取</label>
                <label>阈值 <input type="number" id="rel-auto-extract-threshold" min="1" step="1" style="width:64px;" /></label>
                <label><input type="checkbox" id="rel-auto-delete-toggle" /> 提取后删除</label>
                <label><input type="checkbox" id="rel-auto-toggle-lorebook" /> 自动开关角色条目</label>
                <button id="rel-clear-character-entries" class="interaction-btn danger-btn">一键清空角色目录</button>
              </div>
              <div id="rel-list">
                ${this.render(relationships || [])}
              </div>
            </div>
          </div>
        `;

        // 绑定筛选逻辑（标签+搜索）
        const tabsEl = document.getElementById('rel-tabs');
        const searchEl = document.getElementById('rel-search-input');
        const listEl = document.getElementById('rel-list');
        const state = { type: '全部', keyword: '' };

        const filterAndRender = () => {
          const kw = (state.keyword || '').trim().toLowerCase();
          const filtered = (Array.isArray(relationships) ? relationships : []).filter(raw => {
            if (!raw) return false;
            let obj;
            try { obj = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch { obj = raw; }
            const relCN = RelationshipsComponent._toChineseRelationship(h.SafeGetValue(obj, 'relationship', 'NEUTRAL'));
            if (state.type !== '全部' && relCN !== state.type) return false;
            if (!kw) return true;
            const name = String(h.SafeGetValue(obj, 'name', '')).toLowerCase();
            const desc = String(h.SafeGetValue(obj, 'description', '')).toLowerCase();
            return name.includes(kw) || desc.includes(kw);
          });
          listEl.innerHTML = RelationshipsComponent.render(filtered);
        };

        tabsEl?.addEventListener('click', (ev) => {
          const btn = ev.target.closest('.rel-tab');
          if (!btn) return;
          state.type = btn.getAttribute('data-type') || '全部';
          tabsEl.querySelectorAll('.rel-tab').forEach(b => b.classList.toggle('active', b === btn));
          filterAndRender();
        });

        searchEl?.addEventListener('input', () => {
          state.keyword = searchEl.value || '';
          filterAndRender();
        });

        // 绑定卡片交互事件（委托给列表容器）
        if (listEl) this.bindEvents(listEl);
        // 初始化设置控件与可能的自动提取
        this._initRelSettingsControls(relationships);
      } catch (error) {
        console.error('[归墟] 加载人物关系时出错:', error);
        body.innerHTML = `<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">加载人物关系时出错: ${error.message}</p>`;
      }
    },

    // 新增：角色详情面板
    async showCharacterDetails(rel) {
      try {
        const h = window.GuixuHelpers;
        const $ = window.GuixuDOM.$;
        // 使用最新存储中的人物对象，避免卡片dataset精简导致字段缺失
        try {
          const msgs = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
          const sd = (msgs?.[0]?.data?.stat_data) || {};
          const arr = window.GuixuHelpers.readList(sd, '人物关系列表');
          const rid = h.SafeGetValue(rel, 'id', null);
          const rname = h.SafeGetValue(rel, 'name', null);
          const full = arr.map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } })
            .find(o => o && ((rid != null && h.SafeGetValue(o, 'id', null) === rid) || (rname && h.SafeGetValue(o, 'name', null) === rname)));
          if (full) rel = full;
        } catch { }
        const name = h.SafeGetValue(rel, 'name', '未知之人');
        const tier = h.SafeGetValue(rel, 'tier', '凡人');
        const level = h.SafeGetValue(rel, 'level', h.SafeGetValue(rel, '等级', ''));
        const relationship = h.SafeGetValue(rel, 'relationship', 'NEUTRAL');
        const relationshipCN = RelationshipsComponent._toChineseRelationship(relationship);
const favorability = parseInt(h.SafeGetValue(rel, 'favorability', 0), 10);
const description = h.SafeGetValue(rel, 'description', h.SafeGetValue(rel, '身份背景', '背景不详'));
        const qiyun = parseInt(h.SafeGetValue(rel, '气运', h.SafeGetValue(rel, '气運', 0)), 10) || 0;
        // 新增：角色性格/外貌/称呼（仅在有值时展示）
        const personality = h.SafeGetValue(rel, '性格', '');
        const appearance = h.SafeGetValue(rel, '外貌', '');
        const appellation = h.SafeGetValue(rel, '称呼', '');

        // 四维（兼容字符串化 JSON，同时兼容数组包装或字符串数组）
        const parseMaybeJson = (v) => {
          if (typeof v === 'string') {
            const s = v.trim();
            if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
              try {
                return JSON.parse(s);
              } catch (e1) {
                // 兼容单引号/非严格 JSON：使用 Function 尝试解析
                try {
                  return (new Function('return (' + s + ')'))();
                } catch (e2) { }
              }
            }
          }
          return v;
        };

        // 归一化字段：如果是数组则优先取第一个元素并尝试解析
        const normalizeField = (v) => {
          if (Array.isArray(v) && v.length > 0) {
            const first = v[0];
            // 若首项是字符串化 JSON，再解析
            return parseMaybeJson(first);
          }
          return parseMaybeJson(v);
        };

        // 基础/加成/当前 四维属性，可能是对象、字符串化 JSON 或包装在数组里
        // 优先适配新命名：基础属性 / 属性上限 / 当前属性；旧命名兼容兜底
        const baseAttrs = (() => {
          const raw = rel?.['基础属性'] ?? rel?.['基础四维'] ?? rel?.['基础四维属性'];
          const n = normalizeField(raw ?? {});
          return (n && typeof n === 'object' && !Array.isArray(n)) ? n : {};
        })();
        const attrs = (() => {
          const raw = rel?.['属性上限'] ?? rel?.['四维上限'] ?? rel?.['四维属性'];
          const n = normalizeField(raw ?? {});
          return (n && typeof n === 'object' && !Array.isArray(n)) ? n : {};
        })();
        const curAttrs = (() => {
          const raw = rel?.['当前属性'] ?? rel?.['当前四维'] ?? rel?.['当前四维属性'];
          const n = normalizeField(raw ?? {});
          return (n && typeof n === 'object' && !Array.isArray(n)) ? n : {};
        })();

        // 灵根/功法/天赋（兼容：对象、数组、字符串化 JSON、数组内字符串化 JSON）
        const inhRaw = (rel?.['inherent_abilities'] ?? rel?.['内在能力'] ?? {});
        const inh = (() => {
          const n = normalizeField(inhRaw) ?? {};
          return (n && typeof n === 'object' && !Array.isArray(n)) ? n : {};
        })();

        // 灵根有时为对象或数组，优先取第一个元素并解析；若 inh 缺失则回退到 NPC 顶层“灵根列表”（对象MVU）
        let linggen = {};
        try {
          const lgRaw = inh['灵根'] || inh['灵根列表'] || inh['linggen'] || inh['灵根'] || {};
          if (Array.isArray(lgRaw) && lgRaw.length > 0) {
            linggen = parseMaybeJson(lgRaw[0]) || {};
          } else {
            linggen = normalizeField(lgRaw) || {};
          }
          // 对象MVU回退：从顶层“灵根列表”读取第一条
          if (!linggen || typeof linggen !== 'object' || Object.keys(linggen).length === 0) {
            const topLinggens = (window.GuixuHelpers && typeof window.GuixuHelpers.readList === 'function')
              ? window.GuixuHelpers.readList(rel, '灵根列表')
              : [];
            if (Array.isArray(topLinggens) && topLinggens.length > 0) {
              const first = topLinggens.find(x => x);
              if (first) {
                try { linggen = typeof first === 'string' ? JSON.parse(first) : first; } catch { linggen = first; }
              }
            }
          }
        } catch (e) { linggen = {}; }

        // 功法和天赋通常是数组，但可能被字符串化或包装在数组里
        let gongfaList = [];
        try {
          const gfRaw = inh['功法'] || inh['gongfa'] || [];
          if (Array.isArray(gfRaw)) {
            gongfaList = gfRaw.map(x => parseMaybeJson(x)).filter(Boolean);
          } else {
            const parsed = normalizeField(gfRaw);
            gongfaList = Array.isArray(parsed) ? parsed.map(x => parseMaybeJson(x)).filter(Boolean) : (parsed ? [parsed] : []);
          }
        } catch (e) { gongfaList = []; }

        // 天赋列表：合并 inh['天赋'] 与 顶层“天赋列表”（对象MVU），按 id/name 去重
        let talentList = [];
        try {
          const tRaw = inh['天赋'] || inh['talent'] || [];
          if (Array.isArray(tRaw)) {
            talentList = tRaw.map(x => parseMaybeJson(x)).filter(Boolean);
          } else {
            const parsed = normalizeField(tRaw);
            talentList = Array.isArray(parsed) ? parsed.map(x => parseMaybeJson(x)).filter(Boolean) : (parsed ? [parsed] : []);
          }
          // 合并顶层“天赋列表”
          const topTalents = (window.GuixuHelpers && typeof window.GuixuHelpers.readList === 'function')
            ? window.GuixuHelpers.readList(rel, '天赋列表')
            : [];
          const parsedTop = Array.isArray(topTalents)
            ? topTalents
              .filter(Boolean)
              .map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return x; } })
              .filter(Boolean)
            : [];
          const seen = new Set();
          const keyOf = (o) => {
            const id = window.GuixuHelpers.SafeGetValue(o, 'id', '');
            const nm = window.GuixuHelpers.SafeGetValue(o, 'name', '');
            return id && id !== 'N/A' ? `id:${id}` : `name:${nm}`;
          };
          const out = [];
          [...talentList, ...parsedTop].forEach(o => {
            const k = keyOf(o);
            if (!seen.has(k)) { seen.add(k); out.push(o); }
          });
          talentList = out;
        } catch (e) { talentList = Array.isArray(talentList) ? talentList : []; }

        // 小工具：渲染KV
        const renderKV = (obj) => {
          if (!obj || typeof obj !== 'object') {
            return '<div class="attribute-item"><span class="attribute-name">无</span><span class="attribute-value">-</span></div>';
          }
          const entries = Object.entries(obj).filter(([k, v]) => {
            // 过滤字典元数据占位
            if (k === '$meta') return false;
            if (v === undefined || v === null) return false;
            // 过滤占位符与空串
            const s = typeof v === 'string' ? v.trim() : String(v);
            if (!s) return false;
                        return true;
          });
          if (entries.length === 0) {
            return '<div class="attribute-item"><span class="attribute-name">无</span><span class="attribute-value">-</span></div>';
          }
          return entries.map(([k, v]) => `
            <div class="attribute-item"><span class="attribute-name">${k}</span><span class="attribute-value">${v}</span></div>
          `).join('');
        };
        const renderList = (arr, titleKey = 'name', tierKey = 'tier', descKey = 'description') => {
          if (!Array.isArray(arr) || arr.length === 0) return '<div class="attribute-item"><span class="attribute-name">无</span><span class="attribute-value">-</span></div>';
          const safeArr = arr.filter(item => item);
          if (safeArr.length === 0) return '<div class="attribute-item"><span class="attribute-name">无</span><span class="attribute-value">-</span></div>';
          return safeArr.map(item => {
            const n = h.SafeGetValue(item, titleKey, h.SafeGetValue(item, '名称', '未知'));
            const t = h.SafeGetValue(item, tierKey, h.SafeGetValue(item, '品阶', '凡品'));
            const d = h.SafeGetValue(item, descKey, h.SafeGetValue(item, '描述', ''));
            const color = h.getTierColorStyle(t);
            return `
              <details class="details-container">
                <summary><span class="attribute-value" style="${color}">${n}</span><span class="attribute-name">【${t}】</span></summary>
                <div class="details-content">${d || '无描述'}</div>
              </details>
            `;
          }).join('');
        };

        // 扩展：功法/天赋的详情信息（属性加成/百分比加成/词条）
        const renderAbilityList = (arr) => {
          if (!Array.isArray(arr) || arr.length === 0) return '<div class="ability-empty">无</div>';
          const safeArr = arr.filter(item => item);
          if (safeArr.length === 0) return '<div class="ability-empty">无</div>';
          // 词条列表：不按逗号拆分，优先使用原始数组；字符串若为JSON数组则展开，否则整体作为一条
          const effectsList = (v) => {
            const clean = (s) => String(s).trim();
            const isMeta = (s) => false;
            let n = v;

            // 字符串：支持 JSON 数组/对象两种形式
            if (typeof n === 'string') {
              const s = clean(n);
              if (!s) return [];
              if (s.startsWith('[') && s.endsWith(']')) {
                try {
                  const arr = JSON.parse(s);
                  n = Array.isArray(arr) ? arr : [s];
                } catch { n = [s]; }
              } else if (s.startsWith('{') && s.endsWith('}')) {
                try {
                  n = JSON.parse(s);
                } catch { n = [s]; }
              } else {
                n = [s];
              }
            }

            // 数组：逐条清洗
            if (Array.isArray(n)) {
              return n
                .filter(x => x && !isMeta(x))
                .map(x => typeof x === 'string'
                  ? clean(x)
                  : (h.SafeGetValue(x, 'name', h.SafeGetValue(x, '名称', clean(JSON.stringify(x))))))
                .filter(Boolean);
            }

            // 对象字典：输出键名（过滤 $meta），避免把整段 JSON 渲染成一条
            if (n && typeof n === 'object') {
              return Object.keys(n)
                .filter(k => k !== '$meta')
                .map(k => clean(k))
                .filter(Boolean);
            }
            return [];
          };
          return safeArr.map(item => {
            const obj = (typeof item === 'string') ? (function () { try { return JSON.parse(item); } catch { return {}; } })() : item;
            const n = h.SafeGetValue(obj, 'name', h.SafeGetValue(obj, '名称', '未知'));
            const t = h.SafeGetValue(obj, 'tier', h.SafeGetValue(obj, '品阶', '凡品'));
            const d = h.SafeGetValue(obj, 'description', h.SafeGetValue(obj, '描述', ''));
            const color = h.getTierColorStyle(t);
            const ab = normalizeField(obj['attributes_bonus'] ?? obj['属性加成'] ?? {}) || {};
            const pb = normalizeField(obj['百分比加成'] ?? obj['percent_bonus'] ?? {}) || {};
            const sePairs = (function (v) {
              const clean = (s) => String(s).trim();
              const isMeta = (s) => false;
              let n = v;
              try {
                if (typeof n === 'string') {
                  const s = clean(n);
                  if (!s) return [];
                  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                    try { n = JSON.parse(s); } catch { n = s; }
                  }
                }
                if (Array.isArray(n)) {
                  const out = [];
                  n.forEach(e => {
                    if (!e || isMeta(e)) return;
                    if (typeof e === 'string') {
                      const m = e.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
                      out.push([m ? clean(m[1]) : '', m ? clean(m[2]) : clean(e)]);
                    } else if (typeof e === 'object') {
                      const k = h.SafeGetValue(e, 'name', h.SafeGetValue(e, '名称', ''));
                      const d = h.SafeGetValue(e, 'description', h.SafeGetValue(e, '描述', clean(JSON.stringify(e))));
                      out.push([clean(k), clean(d)]);
                    }
                  });
                  return out;
                }
                if (n && typeof n === 'object') {
                  return Object.entries(n)
                    .filter(([k, v]) => k !== '$meta' && v != null && clean(v) !== '')
                    .map(([k, v]) => [clean(k), typeof v === 'string' ? clean(v) : clean(JSON.stringify(v))]);
                }
                if (typeof n === 'string') {
                  const parts = n.split(/[\n;,、]+/).map(s => clean(s)).filter(Boolean);
                  return parts.map(s => {
                    const m = s.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
                    return [m ? clean(m[1]) : '', m ? clean(m[2]) : s];
                  });
                }
              } catch (_) { }
              return [];
            })(obj['special_effects'] ?? obj['词条效果'] ?? obj['词条'] ?? []);
            return `
              <details class="details-container">
                <summary><span class="attribute-value" style="${color}">${n}</span><span class="attribute-name">【${t}】</span></summary>
                <div class="details-content">
                  ${d ? `<div style="margin-bottom:6px;">${d}</div>` : ''}
                  ${Object.keys(ab).length ? `<div class="attribute-item"><span class="attribute-name">属性加成</span><span class="attribute-value"></span></div>${renderKV(ab)}` : ''}
                  ${Object.keys(pb).length ? `<div class="attribute-item"><span class="attribute-name">百分比加成</span><span class="attribute-value"></span></div>${renderKV(pb)}` : ''}
                  ${sePairs.length ? `<div class="attribute-item"><span class="attribute-name">词条</span><span class="attribute-value"></span></div>${sePairs.map(([k,v]) => `<div class="attribute-item"><span class="attribute-name">${k || '条目'}</span><span class="attribute-value">${v}</span></div>`).join('')}` : ''}
                </div>
              </details>
            `;
          }).join('');
        };

        /* 新增：天赋列表渲染（单行标题：左“天赋名”，右“名称”，可折叠详情；不展示百分比加成） */
        const renderTalentList = (arr) => {
          if (!Array.isArray(arr) || arr.length === 0) return '<div class="ability-empty">无</div>';
          const safeArr = arr.filter(item => item);
          if (safeArr.length === 0) return '<div class="ability-empty">无</div>';
          return safeArr.map(item => {
            const obj = (typeof item === 'string') ? (function(){ try{ return JSON.parse(item); } catch { return {}; } })() : item;
            const n = h.SafeGetValue(obj, 'name', h.SafeGetValue(obj, '名称', '未知天赋'));
            const t = h.SafeGetValue(obj, 'tier', h.SafeGetValue(obj, '品阶', '凡品'));
            const d = h.SafeGetValue(obj, 'description', h.SafeGetValue(obj, '描述', ''));
            const color = h.getTierColorStyle(t);
            const ab = normalizeField(obj['attributes_bonus'] ?? obj['属性加成'] ?? {}) || {};
            // 天赋无百分比加成
            const sePairs = (function (v) {
              const clean = (s) => String(s).trim();
              let n = v;
              try {
                if (typeof n === 'string') {
                  const s = clean(n);
                  if (!s) return [];
                  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                    try { n = JSON.parse(s); } catch { n = s; }
                  }
                }
                if (Array.isArray(n)) {
                  const out = [];
                  n.forEach(e => {
                    if (!e) return;
                    if (typeof e === 'string') {
                      const m = e.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
                      out.push([m ? clean(m[1]) : '', m ? clean(m[2]) : clean(e)]);
                    } else if (typeof e === 'object') {
                      const k = h.SafeGetValue(e, 'name', h.SafeGetValue(e, '名称', ''));
                      const d = h.SafeGetValue(e, 'description', h.SafeGetValue(e, '描述', clean(JSON.stringify(e))));
                      out.push([clean(k), clean(d)]);
                    }
                  });
                  return out;
                }
                if (n && typeof n === 'object') {
                  return Object.entries(n)
                    .filter(([k, v]) => k !== '$meta' && v != null && clean(v) !== '')
                    .map(([k, v]) => [clean(k), typeof v === 'string' ? clean(v) : clean(JSON.stringify(v))]);
                }
                if (typeof n === 'string') {
                  const parts = n.split(/[\n;,、]+/).map(s => clean(s)).filter(Boolean);
                  return parts.map(s => {
                    const m = s.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
                    return [m ? clean(m[1]) : '', m ? clean(m[2]) : s];
                  });
                }
              } catch (_) {}
              return [];
            })(obj['special_effects'] ?? obj['词条效果'] ?? obj['词条'] ?? []);
            return `
              <details class="details-container talent-row">
                <summary>
                  <div class="attribute-item">
                    <span class="attribute-name">天赋名称</span>
                    <span class="attribute-value" style="${color}">${n}</span>
                  </div>
                </summary>
                <div class="details-content">
                  <div class="attribute-item"><span class="attribute-name">品阶</span><span class="attribute-value" style="${color}">${t}</span></div>
                  ${d ? `<div class="details-content" style="margin-bottom:6px;">${d}</div>` : ''}
                  ${Object.keys(ab).length ? `<div class="attribute-item"><span class="attribute-name">固有加成</span><span class="attribute-value"></span></div>${renderKV(ab)}` : ''}
                  ${sePairs.length ? `<div class="attribute-item"><span class="attribute-name">词条</span><span class="attribute-value"></span></div>${sePairs.map(([k,v]) => `<div class="attribute-item"><span class="attribute-name">${k || '条目'}</span><span class="attribute-value">${v}</span></div>`).join('')}` : ''}
                </div>
              </details>
            `;
          }).join('');
        };
        const tierStyle = h.getTierStyle(tier);
        const cultivationDisplay = level ? `${tier} ${level}` : tier;

        // 构建“游戏风格”的四维进度条（使用 加成后attrs 作为上限，当前curAttrs 作为填充）
        const attrKeys = [
          { key: '法力', icon: '⚡' },
          { key: '神海', icon: '🌊' },
          { key: '道心', icon: '🧠' },
          { key: '空速', icon: '🌀' },
        ];
        const toNum = (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };
        const buildBars = (attrsObj, curObj) => {
          try {
            return attrKeys.map(({ key, icon }) => {
              const total = Math.max(0, toNum((attrsObj || {})[key]));
              const current = Math.max(0, Math.min(total || toNum((curObj || {})[key]), toNum((curObj || {})[key])));
              const percent = total > 0 ? Math.round((current / total) * 100) : 0;
              return `
                <div class="stat-row">
                  <div class="stat-head">
                    <span class="stat-icon">${icon}</span>
                    <span class="stat-name">${key}</span>
                    <span class="stat-values">${current}/${total}</span>
                  </div>
                  <div class="stat-bar">
                    <div class="stat-bar-fill" style="width:${percent}%;"></div>
                  </div>
                </div>
              `;
            }).join('');
          } catch (_) {
            return '';
          }
        };
        // 计算NPC四维上限（前端）：基于 基础四维属性 + 装备(主修/辅修/武器/防具/饰品/法宝1) + 灵根 + 天赋
        // 工具：百分比解析/词条提取/加成提取
        const ATTR_KEYS_CN = ['法力', '神海', '道心', '空速'];
        const parsePercent = (v) => {
          if (v === null || v === undefined) return 0;
          const s = String(v).trim();
          if (!s) return 0;
          if (s.endsWith('%')) {
            const n = parseFloat(s.slice(0, -1));
            return Number.isFinite(n) ? n / 100 : 0;
          }
          const n = parseFloat(s);
          return Number.isFinite(n) && n > 1.5 ? n / 100 : (Number.isFinite(n) ? n : 0);
        };
        const extractBonusesFromItemCN = (item) => {
          const flat = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
          const percent = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
          if (!item || typeof item !== 'object') return { flat, percent };
          const ab = item.attributes_bonus || item['属性加成'] || {};
          const pb = item['百分比加成'] || item.percent_bonus || item['百分比'] || {};
          if (ab && typeof ab === 'object') {
            Object.entries(ab).forEach(([k, v]) => {
              if (!ATTR_KEYS_CN.includes(k)) return;
              const n = parseInt(String(v), 10);
              if (Number.isFinite(n)) flat[k] += n;
            });
          }
          if (pb && typeof pb === 'object') {
            Object.entries(pb).forEach(([k, v]) => {
              if (!ATTR_KEYS_CN.includes(k)) return;
              const p = parsePercent(v);
              if (Number.isFinite(p)) percent[k] += p;
            });
          }
          return { flat, percent };
        };
        const mergeCN = (a, b) => { ATTR_KEYS_CN.forEach(k => a[k] = (a[k] || 0) + (b[k] || 0)); };
        // 汇总：装备+灵根+天赋
        const totalFlatCN = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
        const totalPercentCN = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
        const sourcesForBreakdown = []; // {type,name,flat:{CN},percent:{CN}}
        const pushSource = (type, name, obj) => {
          const { flat, percent } = extractBonusesFromItemCN(obj || {});
          sourcesForBreakdown.push({ type, name, flat, percent });
          mergeCN(totalFlatCN, flat);
          mergeCN(totalPercentCN, percent);
        };
        // 装备槽（兼容对象/数组包裹/字符串化）
          const slotDefsForCalc = [
            { key: '主修功法', label: '主修功法' },
            { key: '辅修心法', label: '辅修心法' },
            { key: '武器', label: '武器' },
            { key: '防具', label: '防具' },
            { key: '饰品', label: '饰品' },
            { key: '法宝', label: '法宝' }
          ];
          slotDefsForCalc.forEach(def => {
            const it = window.GuixuHelpers.readEquipped(rel, def.key);
            if (it && typeof it === 'object') {
              const n = window.GuixuHelpers.SafeGetValue(it, 'name', window.GuixuHelpers.SafeGetValue(it, '名称', def.label));
              pushSource('物品', n || def.label, it);
            }
          });
        // 灵根
        if (linggen && (linggen.名称 || linggen.name)) {
          pushSource('灵根', linggen.名称 || linggen.name || '灵根', linggen);
        }
        // 天赋
        (Array.isArray(talentList) ? talentList : []).forEach(t => {
          if (!t) return;
          const obj = (typeof t === 'string') ? (function () { try { return JSON.parse(t); } catch { return null; } })() : t;
          if (!obj) return;
          pushSource('天赋', window.GuixuHelpers.SafeGetValue(obj, 'name', window.GuixuHelpers.SafeGetValue(obj, '名称', '天赋')), obj);
        });
        // 上限 = (基础 + Σ固定) * (1 + Σ百分比)
        const computedMax = Object.fromEntries(ATTR_KEYS_CN.map(k => {
          const base = Number(baseAttrs?.[k] || 0);
          const flat = Number(totalFlatCN[k] || 0);
          const pct = Number(totalPercentCN[k] || 0);
          return [k, Math.max(0, Math.floor((base + flat) * (1 + pct)))];
        }));
        // 构建条形图：使用 computedMax 作为上限，curAttrs 作为当前
        const barsHtml = buildBars(computedMax, curAttrs);
// 同步：将计算得到的上限写回 MVU（避免保存到酒馆的是基础值）
try { await this._syncNpcFourDimMaxToMvu(rel, computedMax); } catch (_) {}
        // 灵根细节：属性加成/百分比加成/词条/当前状态
        const toArray = (v) => {
          const n = normalizeField(v);
          const isMeta = (s) => false;
          if (Array.isArray(n)) {
            return n
              .filter(x => x && !isMeta(x))
              .map(x => typeof x === 'string' ? x : (h.SafeGetValue(x, 'name', h.SafeGetValue(x, '名称', '')) || JSON.stringify(x)))
              .filter(s => s && !isMeta(s));
          }
          if (typeof n === 'string') {
            return n
              .split(/[，,、\n]+/)
              .map(s => s.trim())
              .filter(s => s && !isMeta(s));
          }
          return [];
        };
        // 统一的词条解析：不按逗号拆分，优先使用原始数组；字符串若为JSON数组则展开，否则整体作为一条
        const effectsList = (v) => {
          const clean = (s) => String(s).trim();
          const isMeta = (s) => false;
          let n = v;

          // 字符串：支持 JSON 数组/对象两种形式
          if (typeof n === 'string') {
            const s = clean(n);
            if (!s) return [];
            if (s.startsWith('[') && s.endsWith(']')) {
              try {
                const arr = JSON.parse(s);
                n = Array.isArray(arr) ? arr : [s];
              } catch { n = [s]; }
            } else if (s.startsWith('{') && s.endsWith('}')) {
              try {
                n = JSON.parse(s);
              } catch { n = [s]; }
            } else {
              n = [s];
            }
          }

          // 数组：逐条清洗
          if (Array.isArray(n)) {
            return n
              .filter(x => x && !isMeta(x))
              .map(x => typeof x === 'string'
                ? clean(x)
                : (h.SafeGetValue(x, 'name', h.SafeGetValue(x, '名称', clean(JSON.stringify(x))))))
              .filter(Boolean);
          }

          // 对象字典：输出键名（过滤 $meta），避免把整段 JSON 渲染成一条
          if (n && typeof n === 'object') {
            return Object.keys(n)
              .filter(k => k !== '$meta')
              .map(k => clean(k))
              .filter(Boolean);
          }
          return [];
        };
        const parseEffectsEntries = (v) => {
          const clean = (s) => String(s).trim();
          const isMeta = (s) => false;
          let n = v;
          try {
            // 字符串：尝试解析 JSON；否则解析为“键:值”对
            if (typeof n === 'string') {
              const s = clean(n);
              if (!s) return [];
              if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                try { n = JSON.parse(s); } catch { n = s; }
              }
            }
            // 数组：逐个元素解析
            if (Array.isArray(n)) {
              const out = [];
              n.forEach(e => {
                if (!e || isMeta(e)) return;
                if (typeof e === 'string') {
                  const m = e.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
                  out.push([m ? clean(m[1]) : '', m ? clean(m[2]) : clean(e)]);
                } else if (typeof e === 'object') {
                  const k = h.SafeGetValue(e, 'name', h.SafeGetValue(e, '名称', ''));
                  const d = h.SafeGetValue(e, 'description', h.SafeGetValue(e, '描述', clean(JSON.stringify(e))));
                  out.push([clean(k), clean(d)]);
                }
              });
              return out;
            }
            // 对象字典：输出“键: 值”（过滤 $meta）
            if (n && typeof n === 'object') {
              return Object.entries(n)
                .filter(([k, v]) => k !== '$meta' && v != null && clean(v) !== '')
                .map(([k, v]) => [clean(k), typeof v === 'string' ? clean(v) : clean(JSON.stringify(v))]);
            }
            // 纯字符串：按分隔符切成多对
            if (typeof n === 'string') {
              const parts = n.split(/[\n;,、]+/).map(s => clean(s)).filter(Boolean);
              return parts.map(s => {
                const m = s.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
                return [m ? clean(m[1]) : '', m ? clean(m[2]) : s];
              });
            }
          } catch (_) { }
          return [];
        };
        const lgAttrBonus = normalizeField(linggen && (linggen['attributes_bonus'] ?? linggen['属性加成']) || {}) || {};
        const lgPercentBonus = normalizeField(linggen && (linggen['百分比加成'] ?? linggen['percent_bonus']) || {}) || {};
        const lgSpecialsArr = effectsList(linggen && (linggen['special_effects'] ?? linggen['词条效果'] ?? linggen['词条']) || []);
        const lgStatusesArr = toArray(linggen && (linggen['当前状态'] ?? linggen['状态']) || []);

        const bodyHtml = `
          <style>
            /* 基础布局与装饰 */
            .character-details-modern {
              display: flex;
              flex-direction: column;
              gap: 14px;
            }
            .gx-card {
              border: 1px solid rgba(201, 170, 113, 0.35);
              background: linear-gradient(180deg, rgba(26,26,46,0.85), rgba(26,26,46,0.65));
              border-radius: 10px;
              padding: 12px;
              box-shadow: 0 0 12px rgba(201,170,113,0.12) inset;
            }
            .gx-card .section-title {
              color: #c9aa71;
              font-weight: 700;
              font-size: 13px;
              letter-spacing: 0.5px;
              margin-bottom: 8px;
              display: flex;
              align-items: center;
              gap: 6px;
            }
            .gx-badge {
              display: inline-block;
              padding: 2px 8px;
              border-radius: 999px;
              border: 1px solid rgba(201,170,113,0.35);
              color: #c9aa71;
              font-size: 11px;
              background: rgba(201,170,113,0.08);
            }
            /* 顶部信息双列（响应式） */
            .gx-top {
              display: grid;
              grid-template-columns: 1fr;
              gap: 10px;
            }
            @media (min-width: 720px) {
              .gx-top {
                grid-template-columns: 1.2fr 0.8fr;
              }
            }
            .name-line {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              margin-bottom: 6px;
              flex-wrap: nowrap; /* 避免在窄屏被强制挤压导致姓名竖排 */
            }
            .name-line .char-name {
              font-size: 18px;
              font-weight: 800;
              color: #e8e3d6;
              text-shadow: 0 0 6px rgba(201,170,113,0.2);
              flex: 1 1 auto;           /* 占据剩余空间，避免被标签挤压 */
              min-width: 0;             /* 允许收缩并配合省略 */
              white-space: nowrap;      /* 姓名单行显示 */
              overflow: hidden;         /* 超出隐藏 */
              text-overflow: ellipsis;  /* 尾部省略 */
            }
            .pill-group {
              display: flex;
              gap: 6px;
              flex-wrap: wrap;
              flex: 0 0 auto;           /* 标签本身不去抢占姓名空间 */
              justify-content: flex-end; /* 默认右侧对齐 */
            }

            /* 移动端：将姓名放到第一行，标签自动换到下一行，避免姓名被挤成竖排 */
            @media (max-width: 520px) {
              .name-line { flex-wrap: wrap; }
              .name-line .char-name { flex-basis: 100%; min-width: 0; }
              .pill-group { width: 100%; justify-content: flex-start; }
            }
            .kv {
              display: grid;
              grid-template-columns: auto 1fr;
              gap: 6px 10px;
              align-items: center;
              font-size: 12px;
              color: #d9d3c5;
            }
            .kv .k { color: #8b7355; }
            .kv .v { color: #e0dcd1; }
            /* 好感度 */
            .fava-wrap { display: flex; flex-direction: column; gap: 8px; }
            .favor-line {
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 12px;
              color: #d9d3c5;
            }
            .fava-bar {
              height: 10px;
              border-radius: 6px;
              background: rgba(201,170,113,0.15);
              border: 1px solid rgba(201,170,113,0.25);
              overflow: hidden;
            }
            .fava-fill {
              height: 100%;
              background: linear-gradient(90deg, #8bc34a, #ffd93d, #ff6b6b);
              width: 0%;
              transition: width 300ms ease;
            }
            /* 四维进度条 */
            .stats-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
            .stat-row { display: flex; flex-direction: column; gap: 6px; }
            .stat-head {
              display: grid;
              grid-template-columns: 20px 1fr auto;
              align-items: center;
              gap: 8px;
              font-size: 12px;
            }
            .stat-icon { font-size: 14px; width: 20px; text-align: center; }
            .stat-name { color: #e8e3d6; font-weight: 700; }
            .stat-values { color: #c9aa71; font-weight: 600; min-width: 72px; text-align: right; font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
            .stat-bar {
              height: 12px;
              border-radius: 8px;
              background: linear-gradient(180deg, rgba(201,170,113,0.12), rgba(201,170,113,0.05));
              border: 1px solid rgba(201,170,113,0.25);
              overflow: hidden;
            }
            .stat-bar-fill {
              height: 100%;
              background: linear-gradient(90deg, #4caf50, #ffd700);
              box-shadow: 0 0 10px rgba(255, 215, 0, 0.35);
              width: 0%;
              transition: width 300ms ease;
            }
            /* 卡片式能力区 */
            .ability-cards { display: grid; grid-template-columns: 1fr; gap: 10px; }
            .ability-item .attribute-item { display: flex; justify-content: space-between; }
            .ability-empty { color: #9a8f7a; font-size: 12px; }

            /* 天赋列表：一行一个，标题行与通用 attribute-item 视觉对齐；名称值靠右贴边 */
            .details-container.talent-row {
              margin-bottom: 8px;
              border: 1px dashed rgba(201,170,113,0.25);
              border-radius: 8px;
            }
            .details-container.talent-row > summary {
              list-style: none;
              display: flex;
              align-items: center;
              width: 100%;
              padding: 0; /* 去除内边距，保证右侧值与卡片内容边界对齐 */
              cursor: pointer;
            }
            .details-container.talent-row > summary::-webkit-details-marker { display: none; }
            .details-container.talent-row > summary .attribute-item {
              display: flex;
              align-items: center;
              justify-content: space-between; /* 左右两端对齐，统一视觉 */
              gap: 8px;
              width: 100%;
              padding: 0;
              margin: 0;
            }
            .details-container.talent-row > summary .attribute-name { color: #8b7355; }
            .details-container.talent-row > summary .attribute-value {
              margin-left: auto;
              text-align: right; /* 名称值靠右 */
            }

            /* NPC 装备网格：限制模块最大宽度，每行最多 3 个（移动端 2 个），取消单行铺满 */
            #character-details-modal .npc-equip-grid {
              max-width: 600px;
              margin: 0 auto;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              grid-auto-rows: minmax(38px, auto);
              gap: 8px;
            }
            .npc-equip-grid .equipment-slot {
              min-height: 38px;
              padding: 4px 8px;
              font-size: 12px;
            }
            @media (max-width: 520px) {
              #character-details-modal .npc-equip-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
            }
          </style>

          <div class="character-details-modern">
            <!-- 顶部信息区 -->
            <div class="gx-top">
              <div class="gx-card">
                <div class="section-title">角色信息</div>
                <div class="name-line">
                  <div class="char-name" style="${tierStyle}">${name}</div>
                  <div class="pill-group">
                    <span class="gx-badge">${relationshipCN}</span>
                    <span class="gx-badge">修为：<span style="${tierStyle}">${cultivationDisplay}</span></span>
                    <span class="gx-badge">气运：${qiyun}</span>
                  </div>
                </div>
                <div class="kv">
                  <div class="k">描述</div><div class="v">${description || '背景不详'}</div>
                  ${personality ? `<div class="k">性格</div><div class="v">${personality}</div>` : ''}
                  ${appearance ? `<div class="k">外貌</div><div class="v">${appearance}</div>` : ''}
                  ${appellation ? `<div class="k">称呼你</div><div class="v">${appellation}</div>` : ''}
                </div>
              </div>

              <div class="gx-card">
                <div class="section-title">好感度</div>
                <div class="fava-wrap">
                  <div class="favor-line"><span>数值</span><span>${favorability}</span></div>
                  <div class="fava-bar"><div class="fava-fill" style="width:${Math.max(0, Math.min(100, (favorability / 200) * 100))}%"></div></div>
                  <div style="font-size:11px;color:#8b7355;">好感度越高，互动（交易/合作）越顺畅。</div>
                </div>
              </div>
            </div>

            <!-- 四维（合并展示） -->
            <div class="gx-card">
              <div class="section-title">四维（当前 / 加成后）</div>
              <div class="stats-grid">
                ${barsHtml}
              </div>
            </div>

            <!-- 修为进度 -->
            <div class="gx-card">
              <div class="section-title">修为进度</div>
              <div class="attr-cultivation-wrap">
                <div class="attr-head">
                  <span class="attr-name">进度</span>
                  <span class="attr-values">${Math.max(0, Math.min(100, Number(h.SafeGetValue(rel, '修为进度', 0)) || 0))}%</span>
                </div>
                <div class="attr-bar attr-bar--cultivation">
                  <div class="attr-bar-fill" style="width:${Math.max(0, Math.min(100, Number(h.SafeGetValue(rel, '修为进度', 0)) || 0))}%;"></div>
                </div>
                <div class="attr-bottleneck">
                  <span class="attr-bottleneck-label">当前瓶颈</span>
                  <span class="attr-bottleneck-value">${h.SafeGetValue(rel, '修为瓶颈', '无')}</span>
                </div>
              </div>
            </div>

            <!-- 能力区：装备、灵根、天赋 -->
            <div class="ability-cards">
              <!-- 装备栏（NPC只读，悬浮提示显示详情） -->
              <div class="gx-card ability-item">
                <div class="section-title">装备</div>
                <div class="equipment-grid npc-equip-grid">
                  ${(() => {
            const slotDefs = [
              { key: '主修功法', label: '主修功法' },
              { key: '辅修心法', label: '辅修心法' },
              { key: '武器', label: '武器' },
              { key: '防具', label: '防具' },
              { key: '饰品', label: '饰品' },
              { key: '法宝', label: '法宝' }
            ];
            return slotDefs.map(def => {
              const it = window.GuixuHelpers.readEquipped(rel, def.key);
              if (it && typeof it === 'object') {
                const n = h.SafeGetValue(it, 'name', h.SafeGetValue(it, '名称', def.label));
                const t = h.SafeGetValue(it, 'tier', h.SafeGetValue(it, '品阶', '凡品'));
                const tierStyle = h.getTierStyle(t);
                const json = JSON.stringify(it).replace(/'/g, "&#39;");
                return `<div class="equipment-slot equipped" data-slot="${def.key}" data-item='${json}' style="${tierStyle}">${n}</div>`;
              }
              return `<div class="equipment-slot" data-slot="${def.key}">${def.label}</div>`;
            }).join('');
          })()}
                </div>
                <div style="margin-top:6px;color:#8b7355;font-size:11px;">提示：NPC装备栏仅供查看，所有装备变更由LLM的mvu语法驱动。</div>
              </div>

              <div class="gx-card ability-item">
                <div class="section-title">灵根</div>
                <div class="attributes-list">
                  ${linggen && (linggen.名称 || linggen.name) ? `
                      <div class="attribute-item"><span class="attribute-name">名称</span><span class="attribute-value" style="${h.getTierColorStyle(linggen.品阶 || linggen.tier || '凡品')}">【${linggen.品阶 || linggen.tier || '凡品'}】 ${linggen.名称 || linggen.name || '未知灵根'}</span></div>
                      <div class="attribute-item"><span class="attribute-name">品阶</span><span class="attribute-value" style="${h.getTierColorStyle(linggen.品阶 || linggen.tier || '凡品')}">${linggen.品阶 || linggen.tier || '凡品'}</span></div>
                      ${linggen.描述 || linggen.description ? `<div class="details-content">${linggen.描述 || linggen.description}</div>` : ''}

                      ${Object.keys(lgAttrBonus || {}).length ? `
                        <div class="attribute-item"><span class="attribute-name">属性加成</span><span class="attribute-value"></span></div>
                        ${renderKV(lgAttrBonus)}
                      ` : ''}

                      ${Object.keys(lgPercentBonus || {}).length ? `
                        <div class="attribute-item"><span class="attribute-name">百分比加成</span><span class="attribute-value"></span></div>
                        ${renderKV(lgPercentBonus)}
                      ` : ''}

                      ${(() => {
                        const entries = parseEffectsEntries(linggen && (linggen['special_effects'] ?? linggen['词条效果'] ?? linggen['词条']) || []);
                        if (!entries.length) return '';
                        return `<div class="attribute-item"><span class="attribute-name">词条</span><span class="attribute-value"></span></div>` +
                          entries.map(([k, v]) => `<div class="attribute-item"><span class="attribute-name">${k || '条目'}</span><span class="attribute-value">${v}</span></div>`).join('');
                      })()}

                    ` : '<div class="ability-empty">无</div>'
          }
                </div>
              </div>

              <div class="gx-card ability-item">
                <div class="section-title">天赋</div>
                ${renderTalentList(talentList)}
              </div>

              <div class="gx-card ability-item">
                <div class="section-title">当前状态</div>
                ${(() => {
            const getStatuses = () => {
              let v = rel?.['当前状态'] ?? rel?.['状态'] ?? null;
              if (typeof v === 'string') {
                const s = v.trim();
                try { v = JSON.parse(s); } catch { v = [s]; }
              }
              if (Array.isArray(v) && v.length === 1 && typeof v[0] === 'string') {
                const s = v[0].trim();
                if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
                  try { v = JSON.parse(s); } catch { }
                }
              }
              if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) v = v[0];
              if (v && !Array.isArray(v) && typeof v === 'object') { v = Object.keys(v).filter(k => k !== '$meta').map(k => v[k]); }
              v = Array.isArray(v) ? v.filter(Boolean) : [];
              v = v.map(x => {
                if (typeof x === 'string') {
                  const s = x.trim();
                  if (s.startsWith('{') && s.endsWith('}')) { try { return JSON.parse(s); } catch { return null; } }
                  return null;
                }
                return x;
              }).filter(Boolean);
              return v;
            };
            const list = getStatuses();
            if (!list.length) return '<div class="ability-empty">无</div>';
            const typeMap = { BUFF: '增益', DEBUFF: '减益', NEUTRAL: '中性', AURA: '领域', TERRAIN: '地形' };
            const renderEffects = (effRaw) => {
              const clean = (s) => String(s).trim();
              const tryParse = (s) => {
                const t = clean(s);
                if (!t) return s;
                if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
                  try { return JSON.parse(t); } catch { return s; }
                }
                return s;
              };
              let eff = effRaw;

              // 兼容 Map：转为对象或键值对数组（参考 StatusesComponent._parseEffects）
              try {
                if (Object.prototype.toString.call(eff) === '[object Map]') {
                  const arr = Array.from(eff.entries());
                  const allStringKeys = arr.every(([k]) => typeof k === 'string');
                  eff = allStringKeys ? Object.fromEntries(arr) : arr.map(([k, v]) => ({ key: k, value: v }));
                }
              } catch (_) { }

              // 字符串：尝试 JSON 解析；失败则尝试解析 "A:10%; B:5%" 或多行 "A:10%\nB:5%"
              if (typeof eff === 'string') {
                const parsed = tryParse(eff);
                if (parsed && typeof parsed === 'object') {
                  eff = parsed;
                } else {
                  const obj = {};
                  const parts = eff.split(/[\n;,]+/).map(s => s.trim()).filter(Boolean);
                  let pairs = 0;
                  for (const p of parts) {
                    const m = p.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
                    if (m) { obj[m[1].trim()] = m[2].trim(); pairs++; }
                  }
                  if (pairs > 0) eff = obj;
                }
              }
              if (Array.isArray(eff)) {
                const entries = [];
                eff.forEach(e => {
                  if (e && typeof e === 'object' && !Array.isArray(e)) {
                    Object.entries(e).forEach(([k, v]) => {
                      if (v !== undefined && v !== null && clean(v) !== '') entries.push([k, v]);
                    });
                  } else if (e != null && clean(e) !== '') {
                    entries.push([clean(e), '']);
                  }
                });
                if (!entries.length) return '';
                return `<div class="attribute-item"><span class="attribute-name">词条效果</span><span class="attribute-value"></span></div>` +
                  entries.map(([k, v]) => `<div class="attribute-item"><span class="attribute-name">${k}</span><span class="attribute-value">${v}</span></div>`).join('');
              }
              /* 新增：当 effects 是纯标量（字符串/数字/布尔）时也要渲染，而不是直接丢弃 */
              if (eff != null && (typeof eff === 'string' || typeof eff === 'number' || typeof eff === 'boolean')) {
                const s = clean(typeof eff === 'string' ? eff : String(eff));
                if (!s) return '';
                return `<div class="attribute-item"><span class="attribute-name">词条效果</span><span class="attribute-value"></span></div>` +
                  `<div class="attribute-item"><span class="attribute-name">条目</span><span class="attribute-value">${s}</span></div>`;
              }
              if (!eff || typeof eff !== 'object') return '';
              const items = Object.entries(eff).filter(([k, v]) => v !== undefined && v !== null && clean(v) !== '');
              if (!items.length) return '';
              return `<div class="attribute-item"><span class="attribute-name">词条效果</span><span class="attribute-value"></span></div>` +
                items.map(([k, v]) => `<div class="attribute-item"><span class="attribute-name">${k}</span><span class="attribute-value">${typeof v === 'string' ? clean(v) : clean(JSON.stringify(v))}</span></div>`).join('');
            };
            return list.map(st => {
              const sName = h.SafeGetValue(st, 'name', '未知状态');
              const typeKey = String(h.SafeGetValue(st, 'type', 'NEUTRAL')).toUpperCase();
              const sType = typeMap[typeKey] || h.SafeGetValue(st, 'type', 'NEUTRAL');
              const sDur = h.SafeGetValue(st, 'duration', 0);
              const sDesc = h.SafeGetValue(st, 'description', '');
              // 新：优先读取 special_effects（兼容旧 effects），并尽量使用原始对象/数组
              let eff = (st && (st.special_effects ?? st['词条效果'] ?? st['词条'])) ?? null;
              const rawEffectsCandidate = st && (st.special_effects ?? st['词条效果'] ?? st['词条'] ?? st.effects ?? st['effect'] ?? st['效果'] ?? st['buffs']);
              // 始终优先使用原始对象/数组（即使 SafeGetValue 返回了字符串/单值）
              if (rawEffectsCandidate && typeof rawEffectsCandidate === 'object') {
                eff = rawEffectsCandidate;
              } else if (eff == null) {
                // 回退：仅在没有原始对象时，才使用 SafeGetValue 读取可能的字符串
                eff = h.SafeGetValue(
                  st,
                  'special_effects',
                  h.SafeGetValue(
                    st,
                    '词条效果',
                    h.SafeGetValue(
                      st,
                      '词条',
                      h.SafeGetValue(
                        st,
                        'effects',
                        h.SafeGetValue(st, 'effect', h.SafeGetValue(st, '效果', h.SafeGetValue(st, 'buffs', null)))
                      )
                    )
                  )
                );
              }
              // 兼容字符串化 "[object Object]" 场景：用原始对象兜底（参考 StatusesComponent._normalizeOne）
              if (typeof eff === 'string' && eff.trim && eff.trim() === '[object Object]' && rawEffectsCandidate && typeof rawEffectsCandidate === 'object') {
                eff = rawEffectsCandidate;
              }
              // 特殊状态底色（AURA/TERRAIN等）
              const typeBg = {
                BUFF: 'background: rgba(76,175,80,0.10); border:1px solid rgba(76,175,80,0.35);',
                DEBUFF: 'background: rgba(220,20,60,0.10); border:1px solid rgba(220,20,60,0.35);',
                NEUTRAL: 'background: rgba(201,170,113,0.08); border:1px solid rgba(201,170,113,0.30);',
                AURA: 'background: rgba(138,43,226,0.12); border:1px solid rgba(138,43,226,0.35);',
                TERRAIN: 'background: rgba(184,134,11,0.12); border:1px solid rgba(184,134,11,0.35);'
              };
              const summaryStyle = typeBg[typeKey] || '';
              return `
                        <details class="details-container status-card type-${typeKey.toLowerCase()}">
                          <summary class="status-summary" style="border-radius:8px; padding:6px 8px; ${summaryStyle}">
                            <span class="attribute-value">${sName}</span>
                            <span class="attribute-name">【${sType}】 持续: ${sDur}小时</span>
                          </summary>
                          <div class="details-content">
                            ${sDesc ? `<div style="margin-bottom:6px;">${sDesc}</div>` : ''}
                            ${renderEffects(eff)}
                          </div>
                        </details>
                      `;
            }).join('');
          })()
          }
              </div>
            </div>
          </div>
        `;

        window.GuixuBaseModal.open('character-details-modal');
        window.GuixuBaseModal.setTitle('character-details-modal', `角色详情 - ${name}`);
        window.GuixuBaseModal.setBodyHTML('character-details-modal', bodyHtml);

        // 构建标签页布局与新增模块（深度互动开关等）
        try { await RelationshipsComponent._upgradeCharacterDetailsToTabs(rel); } catch (e) { console.warn('[归墟] 构建标签页失败:', e); }
        
        // 绑定：NPC装备栏悬浮提示（只读）
        try {
          const host = document.querySelector('#character-details-modal .modal-body') || document.body;
          // 宿主定位
          try { const cs = getComputedStyle(host); if (cs && cs.position === 'static') host.style.position = 'relative'; } catch (_) { }
          let equipTip = document.getElementById('npc-equip-tooltip');
          if (!equipTip) {
            equipTip = document.createElement('div');
            equipTip.id = 'npc-equip-tooltip';
            equipTip.className = 'attr-tooltip'; // 复用暗色浮窗样式
            equipTip.style.display = 'none';
            equipTip.style.position = 'absolute';
            // 防止桌面端在浮窗上悬停触发 grid mouseleave 导致闪烁；并抬升层级
            equipTip.style.pointerEvents = 'none';
            equipTip.style.zIndex = '9999';
            host.appendChild(equipTip);
          } else {
            equipTip.style.pointerEvents = 'none';
            equipTip.style.zIndex = '9999';
          }
          // 锁定机制：点击后锁定显示，外部点击关闭
          equipTip._locked = false;
          equipTip._anchor = null;
          const reposition = (tip, anchor) => {
            const bodyRect = host.getBoundingClientRect();
            const a = anchor.getBoundingClientRect();
            const scrollLeft = host.scrollLeft || 0;
            const scrollTop = host.scrollTop || 0;
            tip.style.display = 'block';
            tip.style.position = 'absolute';
            const tRect = tip.getBoundingClientRect();
            let left = (a.left + a.width / 2) - bodyRect.left + scrollLeft - (tRect.width / 2);
            let top = (a.bottom - bodyRect.top) + scrollTop + 8;

            const viewW = host.clientWidth || bodyRect.width;
            const viewH = host.clientHeight || bodyRect.height;
            const pad = 8;
            const minLeft = scrollLeft + pad;
            const maxLeft = scrollLeft + Math.max(pad, viewW - tRect.width - pad);
            const minTop = scrollTop + pad;
            const maxTop = scrollTop + Math.max(pad, viewH - tRect.height - pad);

            // 若下方空间不足，向上翻转
            if (top > maxTop) {
              top = (a.top - bodyRect.top) + scrollTop - tRect.height - 8;
            }

            left = Math.min(Math.max(minLeft, left), maxLeft);
            top = Math.min(Math.max(minTop, top), maxTop);

            tip.style.left = left + 'px';
            tip.style.top = top + 'px';
          };
          const grid = host.querySelector('.npc-equip-grid');
          if (grid && !grid._boundTips) {
            grid._boundTips = true;
            grid.addEventListener('mouseenter', (ev) => {
              const slot = ev.target.closest('.equipment-slot.equipped');
              if (!slot) return;
              const raw = slot.getAttribute('data-item') || '';
              let it = null; try { it = raw ? JSON.parse(raw.replace(/&#39;/g, "'")) : null; } catch { }
              if (!it) return;
              const html = (window.GuixuRenderers && typeof window.GuixuRenderers.renderTooltipContent === 'function')
                ? window.GuixuRenderers.renderTooltipContent(it)
                : `<div class="tooltip-title">${window.GuixuHelpers.SafeGetValue(it, 'name', '未知')}</div>`;
              equipTip.innerHTML = html;
              reposition(equipTip, slot);
            }, true);
            grid.addEventListener('mousemove', (ev) => {
              if (equipTip._locked && equipTip._anchor) { reposition(equipTip, equipTip._anchor); return; }
              const slot = ev.target.closest('.equipment-slot.equipped');
              if (!slot) { if (!equipTip._locked) equipTip.style.display = 'none'; return; }
              reposition(equipTip, slot);
            }, true);
            grid.addEventListener('mouseleave', () => { if (!equipTip._locked) equipTip.style.display = 'none'; }, true);
            grid.addEventListener('click', (ev) => {
              const slot = ev.target.closest('.equipment-slot');
              if (!slot) return;
              // 只读：阻止交互卸下/切换，但在移动端点击时也显示浮窗
              ev.preventDefault();
              ev.stopPropagation();
              if (!slot.classList.contains('equipped')) {
                equipTip.style.display = 'none';
                equipTip._locked = false;
                equipTip._anchor = null;
                return;
              }
              const raw = slot.getAttribute('data-item') || '';
              let it = null;
              try { it = raw ? JSON.parse(raw.replace(/&#39;/g, "'")) : null; } catch { }
              if (!it) { equipTip.style.display = 'none'; equipTip._locked = false; equipTip._anchor = null; return; }
              const html = (window.GuixuRenderers && typeof window.GuixuRenderers.renderTooltipContent === 'function')
                ? window.GuixuRenderers.renderTooltipContent(it)
                : `<div class="tooltip-title">${window.GuixuHelpers.SafeGetValue(it, 'name', '未知')}</div>`;
              equipTip.innerHTML = html;
              equipTip._locked = true;
              equipTip._anchor = slot;
              reposition(equipTip, slot);

              const onDoc = (e2) => {
                const t = e2.target;
                if (!t.closest || !t.closest('.npc-equip-grid .equipment-slot.equipped')) {
                  equipTip.style.display = 'none';
                  equipTip._locked = false;
                  equipTip._anchor = null;
                  document.removeEventListener('click', onDoc, true);
                  document.removeEventListener('touchstart', onDoc, true);
                }
              };
              document.addEventListener('click', onDoc, true);
              document.addEventListener('touchstart', onDoc, true);
            }, true);
            // 移动端：触摸也触发展示（与点击同逻辑）
            grid.addEventListener('touchstart', (ev) => {
              const slot = ev.target.closest('.equipment-slot');
              if (!slot) return;
              if (!slot.classList.contains('equipped')) return;
              const raw = slot.getAttribute('data-item') || '';
              let it = null;
              try { it = raw ? JSON.parse(raw.replace(/&#39;/g, "'")) : null; } catch { }
              if (!it) return;
              const html = (window.GuixuRenderers && typeof window.GuixuRenderers.renderTooltipContent === 'function')
                ? window.GuixuRenderers.renderTooltipContent(it)
                : `<div class="tooltip-title">${window.GuixuHelpers.SafeGetValue(it, 'name', '未知')}</div>`;
              equipTip.innerHTML = html;
              equipTip._locked = true;
              equipTip._anchor = slot;
              reposition(equipTip, slot);

              const onDoc = (e2) => {
                const t = e2.target;
                if (!t.closest || !t.closest('.npc-equip-grid .equipment-slot.equipped')) {
                  equipTip.style.display = 'none';
                  equipTip._locked = false;
                  equipTip._anchor = null;
                  document.removeEventListener('click', onDoc, true);
                  document.removeEventListener('touchstart', onDoc, true);
                }
              };
              document.addEventListener('click', onDoc, true);
              document.addEventListener('touchstart', onDoc, true);
            }, { passive: true, capture: true });
          }
        } catch (e) { console.warn('[归墟] 绑定NPC装备提示失败:', e); }

        // 绑定：四维加成分解浮窗（点击条目展示）
        try {
          const host = document.querySelector('#character-details-modal .modal-body') || document.body;
          let tip = document.getElementById('npc-attr-breakdown-tooltip');
          if (!tip) {
            tip = document.createElement('div');
            tip.id = 'npc-attr-breakdown-tooltip';
            tip.className = 'attr-tooltip';
            tip.style.display = 'none';
            tip.style.position = 'absolute';
            tip.style.zIndex = '10000';
            host.appendChild(tip);
          } else {
            tip.style.zIndex = '10000';
          }
          const renderBreakdown = (attrKeyCN) => {
            const baseVal = Number(baseAttrs?.[attrKeyCN] || 0);
            // 分组：灵根/天赋/物品
            const groups = { '灵根': [], '天赋': [], '物品': [] };
            (sourcesForBreakdown || []).forEach(s => {
              const f = Number(s.flat?.[attrKeyCN] || 0);
              const p = Number(s.percent?.[attrKeyCN] || 0);
              if (!f && !p) return;
              const type = groups[s.type] ? s.type : '物品';
              groups[type].push({ name: s.name || '未知', flat: f, pct: p });
            });
            const renderGroup = (title, arr) => {
              if (!arr || !arr.length) return `<div class="attr-breakline"><span class="attr-break-k">${title}</span><span class="attr-break-v">无</span></div>`;
              return `
                <div class="attr-break-group">
                  <div class="attr-break-title">${title}</div>
                  <div class="attr-break-items">
                    ${arr.map(x => `
                      <div class="attr-break-item">
                        <span class="attr-break-name">${x.name}</span>
                        <span class="attr-break-val">
                          ${x.flat ? `+${x.flat}` : ''}${x.flat && x.pct ? '；' : ''}${x.pct ? `+${Math.round(x.pct * 100)}%` : ''}
                        </span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
            };
            return `
              <div class="attr-tip-title">${attrKeyCN} 加成明细</div>
              <div class="attr-break-content">
                <div class="attr-breakline"><span class="attr-break-k">基础${attrKeyCN}</span><span class="attr-break-v">${baseVal}</span></div>
                ${renderGroup('灵根', groups['灵根'])}
                ${renderGroup('天赋', groups['天赋'])}
                ${renderGroup('物品', groups['物品'])}
              </div>
            `;
          };
          const positionTip = (anchor) => {
            const bodyRect = host.getBoundingClientRect();
            const a = anchor.getBoundingClientRect();
            const scrollLeft = host.scrollLeft || 0;
            const scrollTop = host.scrollTop || 0;
            tip.style.display = 'block';
            tip.style.position = 'absolute';
            const tRect = tip.getBoundingClientRect();

            let left = (a.left + a.width / 2) - bodyRect.left + scrollLeft - (tRect.width / 2);
            let top = (a.bottom - bodyRect.top) + scrollTop + 8;

            const viewW = host.clientWidth || bodyRect.width;
            const viewH = host.clientHeight || bodyRect.height;
            const pad = 8;
            const minLeft = scrollLeft + pad;
            const maxLeft = scrollLeft + Math.max(pad, viewW - tRect.width - pad);
            const minTop = scrollTop + pad;
            const maxTop = scrollTop + Math.max(pad, viewH - tRect.height - pad);

            if (top > maxTop) {
              top = (a.top - bodyRect.top) + scrollTop - tRect.height - 8;
            }

            left = Math.min(Math.max(minLeft, left), maxLeft);
            top = Math.min(Math.max(minTop, top), maxTop);

            tip.style.left = left + 'px';
            tip.style.top = top + 'px';
          };
          const positionTipByPoint = (clientX, clientY) => {
            const bodyRect = host.getBoundingClientRect();
            const scrollLeft = host.scrollLeft || 0;
            const scrollTop = host.scrollTop || 0;
            tip.style.display = 'block';
            const tRect = tip.getBoundingClientRect();

            let left = clientX - bodyRect.left + scrollLeft - (tRect.width / 2);
            let top = clientY - bodyRect.top + scrollTop + 8;

            const viewW = host.clientWidth || bodyRect.width;
            const viewH = host.clientHeight || bodyRect.height;
            const pad = 8;
            const minLeft = scrollLeft + pad;
            const maxLeft = scrollLeft + Math.max(pad, viewW - tRect.width - pad);
            const minTop = scrollTop + pad;
            const maxTop = scrollTop + Math.max(pad, viewH - tRect.height - pad);

            if (top > maxTop) {
              top = clientY - bodyRect.top + scrollTop - tRect.height - 8;
            }

            left = Math.min(Math.max(minLeft, left), maxLeft);
            top = Math.min(Math.max(minTop, top), maxTop);

            tip.style.left = left + 'px';
            tip.style.top = top + 'px';
          };

          const rows = host.querySelectorAll('.stats-grid .stat-row');
          rows.forEach(row => {
            if (row._boundNpcAttrTip) return;
            row._boundNpcAttrTip = true;
            const onOpen = (ev) => {
              const nameEl = row.querySelector('.stat-name');
              const keyCN = nameEl ? nameEl.textContent.trim() : '';
              tip.innerHTML = renderBreakdown(keyCN);
              const p = (ev && ('changedTouches' in ev) && ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0] : ev;
              const cx = p && typeof p.clientX === 'number' ? p.clientX : null;
              const cy = p && typeof p.clientY === 'number' ? p.clientY : null;
              if (cx != null && cy != null) {
                positionTipByPoint(cx, cy);
              } else {
                positionTip(row);
              }
            };
            row.addEventListener('click', onOpen);
            row.addEventListener('touchstart', onOpen, { passive: true });
          });
          document.addEventListener('click', (ev) => {
            const insideTip = tip.contains(ev.target);
            const isRow = !!(ev.target.closest && ev.target.closest('.stats-grid .stat-row'));
            if (!insideTip && !isRow) tip.style.display = 'none';
          }, true);
        } catch (e) { console.warn('[归墟] 绑定NPC属性分解失败:', e); }
      } catch (e) {
        console.error('[归墟] _updateEventHistoryItem 失败:', e);
        throw e;
      }
    },

    // 新增：将详情面板改造为标签页模式，并渲染新增字段与“深度互动模块”开关
    async _upgradeCharacterDetailsToTabs(rel) {
      try {
        const h = window.GuixuHelpers;
        const host = document.querySelector('#character-details-modal .modal-body');
        if (!host) return;

        // 防重复构建
        if (host.querySelector('#cd-tab-root')) return;

        // 准备样式（标签页 + 响应式）
        const style = document.createElement('style');
        style.textContent = `
          /* 标签页容器 */
          #cd-tab-root { display: flex; flex-direction: column; gap: 10px; }
          .cd-tabs {
            display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;
            border-bottom: 1px dashed rgba(201,170,113,0.25); scrollbar-width: thin;
          }
          .cd-tab {
            appearance: none; border: 1px solid rgba(201,170,113,0.35);
            background: rgba(201,170,113,0.08); color: #c9aa71; border-radius: 18px;
            display: inline-flex; align-items: center; justify-content: center;
            height: 32px; padding: 0 12px; font-size: 12px; white-space: nowrap;
            cursor: pointer; flex: 0 0 auto; transition: background .2s, border-color .2s, box-shadow .2s;
          }
          .cd-tab:hover { background: rgba(201,170,113,0.12); border-color: rgba(201,170,113,0.5); }
          .cd-tab.active {
            background: linear-gradient(180deg, rgba(201,170,113,0.25), rgba(201,170,113,0.12));
            border-color: rgba(201,170,113,0.6); box-shadow: 0 0 6px rgba(201,170,113,0.25) inset;
          }
          .cd-panels { display: block; }
          .cd-panel { display: none; }
          .cd-panel.active { display: block; }

          /* 概览页“标注”按钮：椭圆小按钮（覆盖桌面端全局32px规则） */
          #character-details-modal #btn-npc-mark-overview {
            height: 24px !important;        /* 桌面端高度缩小 */
            padding: 0 10px !important;      /* 内边距紧凑 */
            border-radius: 999px !important; /* 椭圆形 */
            min-width: 0 !important;         /* 不强制最小宽度 */
            line-height: 1 !important;
            font-size: 12px !important;
            display: inline-flex; align-items: center; justify-content: center;

            /* 与徽章视觉一致：浅色底 + 金色描边 */
            background: rgba(201,170,113,0.08) !important;
            border: 1px solid rgba(201,170,113,0.45) !important;
            color: #c9aa71 !important;
          }
          #character-details-modal #btn-npc-mark-overview:hover {
            background: rgba(201,170,113,0.12) !important;
            border-color: rgba(201,170,113,0.6) !important;
          }
          #character-details-modal #btn-npc-mark-overview[disabled] {
            opacity: .85;
            cursor: default;
          }

          /* 人物关系网：每人一个可折叠组（与天赋样式对齐，保证上下对称） */
          #character-details-modal .details-container.relation-row {
            margin: 0;                           /* 去除多余外边距，保证上下对齐 */
            border: none;                        /* 取消外层虚线边框，避免破坏对称 */
            border-radius: 0;
          }
          #character-details-modal .details-container.relation-row > summary {
            list-style: none;
            display: flex;
            align-items: center;
            width: 100%;
            cursor: pointer;
          }
          #character-details-modal .details-container.relation-row > summary::-webkit-details-marker { display: none; }
          #character-details-modal .details-container.relation-row > summary .attribute-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            width: 100%;
            padding: 8px 4px;                    /* 与通用 attribute-item 对齐，保证上下对称 */
            margin: 0;
            border-bottom: 1px solid rgba(201, 170, 113, 0.1); /* 与列表分隔线一致 */
          }
          #character-details-modal .details-container.relation-row > summary .attribute-name { color: #8b7355; }
          #character-details-modal .details-container.relation-row > summary .attribute-value { margin-left: auto; text-align: right; }
          #character-details-modal .details-container.relation-row .details-content {
            border-top: 1px solid rgba(201, 170, 113, 0.1);   /* 展开部分与 summary 之间保持对称分隔 */
            padding: 0;                                       /* 使用内部 attribute-item 的统一内边距 */
          }
 
          /* 卡片间距在移动端略收紧 + 移动端按钮更小 */
          @media (max-width: 520px) {
            .gx-card { padding: 10px; }
            #character-details-modal #btn-npc-mark-overview {
              height: 22px !important;
              padding: 0 8px !important;
              font-size: 11px !important;
            }
          }
        `;
        host.prepend(style);

        // 原始内容根节点
        const root = host.querySelector('.character-details-modern');
        if (!root) return;

        // 构建标签页 DOM
        const container = document.createElement('div');
        container.id = 'cd-tab-root';
        const tabs = document.createElement('div');
        tabs.className = 'cd-tabs';
        const panels = document.createElement('div');
        panels.className = 'cd-panels';

        const makeBtn = (id, text, active = false) => {
          const b = document.createElement('button');
          b.className = 'cd-tab' + (active ? ' active' : '');
          b.setAttribute('data-tab', id);
          b.textContent = text;
          return b;
        };
        const makePanel = (id, active = false) => {
          const p = document.createElement('section');
          p.className = 'cd-panel' + (active ? ' active' : '');
          p.setAttribute('data-tab', id);
          return p;
        };

        // 标签定义（按业务模块划分）
        const tabDefs = [
          ['overview','概览', true],
          ['attrs','属性'],
          ['ability','能力'],
          ['status','状态'],
          ['events','事件'],
          ['inner','内在'],
          ['social','社交'],
          ['interact','互动'],
          ['love','情爱']
        ];
        tabDefs.forEach(([id, label, active]) => {
          tabs.appendChild(makeBtn(id, label, !!active));
          panels.appendChild(makePanel(id, !!active));
        });

        // 插入到 root 前
        root.parentNode.insertBefore(container, root);
        container.appendChild(tabs);
        container.appendChild(panels);

        const panelOf = id => panels.querySelector(`.cd-panel[data-tab="${id}"]`);

        // 1) 概览：搬运顶部信息与好感度卡片
        const pOverview = panelOf('overview');
        const gxTop = root.querySelector('.gx-top');
        if (gxTop) {
          // 将 gx-top 内两个卡片移动到概览面板
          Array.from(gxTop.children || []).forEach(ch => pOverview.appendChild(ch));
          // 移除空容器
          try { gxTop.remove(); } catch (_) {}
        }

        // 新增：在“概览/概述”页角色名右侧添加“标注”按钮，点击即开启深度互动模块（适配桌面端与移动端）
        try {
          const infoCard = pOverview.querySelector('.gx-card'); // 角色信息卡片
          const nameLine = infoCard && infoCard.querySelector('.name-line');
          const pillGroup = nameLine && nameLine.querySelector('.pill-group');
          if (pillGroup && !pillGroup.querySelector('#btn-npc-mark-overview')) {
            const markBtn = document.createElement('button');
            markBtn.id = 'btn-npc-mark-overview';
            markBtn.className = 'interaction-btn btn-compact';
            markBtn.textContent = '标注';
            // 紧凑尺寸，避免与徽章冲突，移动端也不挤压姓名
            markBtn.style.padding = '2px 8px';
            markBtn.style.fontSize = '12px';
            pillGroup.appendChild(markBtn);

            // 同步当前开关状态到按钮UI（允许双向切换）
            const isDeepEnabled = (String(h.SafeGetValue(rel, '深度互动模块', false)).toLowerCase() === 'true') || (h.SafeGetValue(rel, '深度互动模块', false) === true);
            const syncBtn = (enabled) => {
              markBtn.classList.toggle('primary', !!enabled);
              markBtn.textContent = enabled ? '已标注' : '标注';
              markBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            };
            syncBtn(isDeepEnabled);

            // 点击切换“深度互动模块”开关：支持开启/取消（乐观更新，失败回滚）
            markBtn.addEventListener('click', async () => {
              if (markBtn._busy) return; // 防抖：进行中的请求不重复发起
              const cur = markBtn.getAttribute('aria-pressed') === 'true';
              const next = !cur;

              // 立即更新 UI（视觉反馈）
              markBtn._busy = true;
              markBtn.disabled = true;
              syncBtn(next);

              try {
                await RelationshipsComponent._setNpcDeepInteraction(rel, next);
                window.GuixuHelpers?.showTemporaryMessage?.(next ? '已开启深度互动模块' : '已取消深度互动模块');
              } catch (e) {
                // 失败：回滚 UI
                syncBtn(cur);
                window.GuixuHelpers?.showTemporaryMessage?.(next ? '开启失败' : '取消失败');
                console.warn('[归墟] 标注按钮切换深度互动失败:', e);
              } finally {
                markBtn._busy = false;
                markBtn.disabled = false;
              }
            });
          }
        } catch (_) {}

        // 2) 属性：四维条与修为进度（并将标题改为“属性面板（当前/上限）”）
        const pAttrs = panelOf('attrs');
        const allCards = Array.from(root.querySelectorAll('.gx-card'));
        // 找到四维卡
        const cardStats = allCards.find(c => (c.querySelector('.section-title')?.textContent || '').includes('四维'));
        if (cardStats) {
          const titleEl = cardStats.querySelector('.section-title');
          if (titleEl) titleEl.textContent = '属性面板（当前/上限）';
          pAttrs.appendChild(cardStats);
        }
        // 修为进度卡
        const cardCult = allCards.find(c => (c.querySelector('.section-title')?.textContent || '').includes('修为进度'));
        if (cardCult) pAttrs.appendChild(cardCult);

        // 3) 能力：装备/灵根/天赋（整体搬运)
        const pAbility = panelOf('ability');
        const abilityCards = root.querySelector('.ability-cards');
        if (abilityCards) {
          pAbility.appendChild(abilityCards);
        }

        // 4) 状态：确保“当前状态”卡片迁移到“状态”标签页（避免仍留在“能力”页）
        const pStatus = panelOf('status');
        // 由于上方已把 ability-cards 整体搬到 pAbility，这里优先在 pAbility 内查找
        let cardStatus = Array.from((panelOf('ability') || root).querySelectorAll('.gx-card'))
          .find(c => (c.querySelector('.section-title')?.textContent || '').includes('当前状态'));
        // 若未找到，再在 panels 域内兜底查找
        if (!cardStatus) {
          cardStatus = Array.from((panels || root).querySelectorAll('.gx-card'))
            .find(c => (c.querySelector('.section-title')?.textContent || '').includes('当前状态'));
        }
        // 最后从 root 兜底
        if (!cardStatus) {
          cardStatus = Array.from(root.querySelectorAll('.gx-card'))
            .find(c => (c.querySelector('.section-title')?.textContent || '').includes('当前状态'));
        }
        if (cardStatus) pStatus.appendChild(cardStatus);

        // 5) 事件：从 rel.event_history 渲染
        const pEvents = panelOf('events');
        const buildEventHistory = () => {
          const evRaw = rel?.event_history ?? rel?.['过往交集'] ?? null;
          let list = [];
          try {
            let v = evRaw;
            if (typeof v === 'string') {
              const s = v.trim();
              if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                try { v = JSON.parse(s); } catch { /* ignore */ }
              }
            }
            if (Array.isArray(v)) {
              list = v.filter(Boolean).map(x => (typeof x === 'string') ? x : (h.SafeGetValue(x, 'description', h.SafeGetValue(x, 'name', JSON.stringify(x)))));
            } else if (v && typeof v === 'object') {
              list = Object.keys(v).filter(k => k !== '$meta').map(k => {
                const it = v[k];
                if (typeof it === 'string') return it;
                return h.SafeGetValue(it, 'description', h.SafeGetValue(it, 'name', JSON.stringify(it)));
              }).filter(Boolean);
            } else if (typeof v === 'string' && v) {
              list = v.split(/[\n；;]+/).map(s => s.trim()).filter(Boolean);
            }
          } catch (_) {}
          return list;
        };
        const evList = buildEventHistory();
        {
          const card = document.createElement('div');
          card.className = 'gx-card';
          card.innerHTML = `
            <div class="section-title">过往交集</div>
            ${evList.length ? `<ul class="event-history-list" style="margin:6px 0 0; padding-left:16px; color:#d9d3c5; font-size:12px;">${evList.map((s, i) => `<li style="margin:4px 0;">${h.escapeHTML ? h.escapeHTML(s) : String(s)}</li>`).join('')}</ul>` : `<div class="ability-empty">无</div>`}
          `;
          pEvents.appendChild(card);
        }

        // 6) 内在驱动
        const pInner = panelOf('inner');
        const innerObj = rel?.['内在驱动'] || null;
        {
          const card = document.createElement('div');
          card.className = 'gx-card';
          card.innerHTML = `<div class="section-title">内在驱动</div>`;
          const body = document.createElement('div');
          body.className = 'attributes-list';
          const put = (k, v) => {
            if (v == null || String(v).trim() === '') return;
            const row = document.createElement('div');
            row.className = 'attribute-item';
            row.innerHTML = `<span class="attribute-name">${k}</span><span class="attribute-value">${v}</span>`;
            body.appendChild(row);
          };
          if (innerObj && typeof innerObj === 'object') {
            put('短期目标', h.SafeGetValue(innerObj, '短期目标', ''));
            put('长期夙愿', h.SafeGetValue(innerObj, '长期夙愿', ''));
            put('核心价值观', h.SafeGetValue(innerObj, '核心价值观', ''));
            put('禁忌与逆鳞', h.SafeGetValue(innerObj, '禁忌与逆鳞', ''));
          } else {
            const empty = document.createElement('div');
            empty.className = 'ability-empty';
            empty.textContent = '无';
            body.appendChild(empty);
          }
          card.appendChild(body);
          pInner.appendChild(card);
        }

        // 7) 社交网络
        const pSocial = panelOf('social');
        const social = rel?.['社交网络'] || null;
        {
          const card = document.createElement('div');
          card.className = 'gx-card';
          card.innerHTML = `<div class="section-title">社交网络</div>`;
          const wrap = document.createElement('div');
          wrap.className = 'attributes-list';
          // 人物关系网（首行分组标题，下面逐项一行一个）
          try {
            const net = social && social['人物关系网'];
            const keys = net && typeof net === 'object' ? Object.keys(net).filter(k => k !== '$meta') : [];
            // 分组标题
            const header = document.createElement('div');
            header.className = 'attribute-item';
            header.innerHTML = `<span class="attribute-name">人物关系网</span><span class="attribute-value"></span>`;
            wrap.appendChild(header);
            if (keys && keys.length) {
              keys.forEach(nameKey => {
                const obj = net[nameKey];
                const nm = h.SafeGetValue(obj, 'name', nameKey);
                // 关系类型读取增强：兼容 relationship / 关系 / 关系类型 / type 等键位
                const relRaw = h.SafeGetValue(
                  obj,
                  'relationship',
                  h.SafeGetValue(obj, '关系', h.SafeGetValue(obj, '关系类型', h.SafeGetValue(obj, 'type', 'NEUTRAL')))
                );
                const relCN = RelationshipsComponent._toChineseRelationship(relRaw);
                const imprint = h.SafeGetValue(obj, '主观印象', '');

                // 每个对象单独一组，可折叠，summary 左标签“姓名”，右侧为人物姓名
                const details = document.createElement('details');
                details.className = 'details-container relation-row';

                const summary = document.createElement('summary');
                summary.innerHTML = `
                  <div class="attribute-item">
                    <span class="attribute-name">姓名</span>
                    <span class="attribute-value">${nm}</span>
                  </div>
                `;

                const content = document.createElement('div');
                content.className = 'details-content';

                const r1 = document.createElement('div');
                r1.className = 'attribute-item';
                r1.innerHTML = `<span class="attribute-name">关系类型</span><span class="attribute-value">${relCN}</span>`;

                const r2 = document.createElement('div');
                r2.className = 'attribute-item';
                r2.innerHTML = `<span class="attribute-name">主观印象</span><span class="attribute-value">${imprint ? imprint : '无'}</span>`;

                content.appendChild(r1);
                content.appendChild(r2);

                details.appendChild(summary);
                details.appendChild(content);
                wrap.appendChild(details);
              });
            } else {
              const empty = document.createElement('div');
              empty.className = 'ability-empty';
              empty.textContent = '无';
              wrap.appendChild(empty);
            }
          } catch (_) {
            const header = document.createElement('div');
            header.className = 'attribute-item';
            header.innerHTML = `<span class="attribute-name">人物关系网</span><span class="attribute-value"></span>`;
            wrap.appendChild(header);
            const empty = document.createElement('div');
            empty.className = 'ability-empty';
            empty.textContent = '无';
            wrap.appendChild(empty);
          }
          // 所属势力（首行分组标题，下面逐项一行一个）
          try {
            const org = social && social['所属势力'];
            const header2 = document.createElement('div');
            header2.className = 'attribute-item';
            header2.innerHTML = `<span class="attribute-name">所属势力</span><span class="attribute-value"></span>`;
            wrap.appendChild(header2);
            if (org && typeof org === 'object') {
              const orgName = h.SafeGetValue(org, '势力名称', '');
              const orgPos = h.SafeGetValue(org, '势力地位', '');
              if (orgName) {
                const r1 = document.createElement('div');
                r1.className = 'attribute-item';
                r1.innerHTML = `<span class="attribute-name">势力名称</span><span class="attribute-value">${orgName}</span>`;
                wrap.appendChild(r1);
              }
              if (orgPos) {
                const r2 = document.createElement('div');
                r2.className = 'attribute-item';
                r2.innerHTML = `<span class="attribute-name">势力地位</span><span class="attribute-value">${orgPos}</span>`;
                wrap.appendChild(r2);
              }
              if (!orgName && !orgPos) {
                const empty = document.createElement('div');
                empty.className = 'ability-empty';
                empty.textContent = '无';
                wrap.appendChild(empty);
              }
            } else {
              const empty = document.createElement('div');
              empty.className = 'ability-empty';
              empty.textContent = '无';
              wrap.appendChild(empty);
            }
          } catch (_) {
            const header2 = document.createElement('div');
            header2.className = 'attribute-item';
            header2.innerHTML = `<span class="attribute-name">所属势力</span><span class="attribute-value"></span>`;
            wrap.appendChild(header2);
            const empty = document.createElement('div');
            empty.className = 'ability-empty';
            empty.textContent = '无';
            wrap.appendChild(empty);
          }
          card.appendChild(wrap);
          pSocial.appendChild(card);
        }

        // 8) 互动：互动模式 + “深度互动模块”开关
        const pInteract = panelOf('interact');
        {

          // 互动模式卡
          const mode = rel?.['互动模式'] || null;
          const modeCard = document.createElement('div');
          modeCard.className = 'gx-card';
          modeCard.innerHTML = `<div class="section-title">互动模式</div>`;
          const wrap = document.createElement('div');
          wrap.className = 'attributes-list';
          const put = (k, v) => {
            if (v == null || String(v).trim() === '') return;
            const row = document.createElement('div');
            row.className = 'attribute-item';
            row.innerHTML = `<span class="attribute-name">${k}</span><span class="attribute-value">${v}</span>`;
            wrap.appendChild(row);
          };
          if (mode && typeof mode === 'object') {
            put('口癖/口头禅', h.SafeGetValue(mode, '口癖/口头禅', ''));
            put('谈话风格', h.SafeGetValue(mode, '谈话风格', ''));
            put('话题偏好', h.SafeGetValue(mode, '话题偏好', ''));
            put('情报价值', h.SafeGetValue(mode, '情报价值', ''));
          } else {
            const empty = document.createElement('div');
            empty.className = 'ability-empty';
            empty.textContent = '无';
            wrap.appendChild(empty);
          }
          modeCard.appendChild(wrap);
          pInteract.appendChild(modeCard);

        }

        // 9) 情爱史与性观念
        const pLove = panelOf('love');
        {
          const love = rel?.['情爱史与性观念'] || null;
          const card = document.createElement('div');
          card.className = 'gx-card';
          card.innerHTML = `<div class="section-title">情爱史与性观念</div>`;
          const wrap = document.createElement('div');
          wrap.className = 'attributes-list';
          const put = (k, v) => {
            if (v == null || String(v).trim() === '') return;
            const row = document.createElement('div');
            row.className = 'attribute-item';
            row.innerHTML = `<span class="attribute-name">${k}</span><span class="attribute-value">${v}</span>`;
            wrap.appendChild(row);
          };
          if (love && typeof love === 'object') {
            put('经验状态', window.GuixuHelpers.SafeGetValue(love, '经验状态', ''));
            // 首次经历
            try {
              const first = love['首次经历'];
              const renderFirstList = (data) => {
                if (data == null) return;

                // 添加分组标题（首次经历）
                let headerAdded = false;
                const addHeader = () => {
                  if (headerAdded) return;
                  headerAdded = true;
                  const header = document.createElement('div');
                  header.className = 'attribute-item';
                  header.innerHTML = `<span class="attribute-name">首次经历</span><span class="attribute-value"></span>`;
                  wrap.appendChild(header);
                };

                // 渲染一条记录
                const renderItem = (label, value) => {
                  if (value == null || String(value).trim() === '') return;
                  const row = document.createElement('div');
                  row.className = 'attribute-item';
                  row.innerHTML = `<span class="attribute-name">${label}</span><span class="attribute-value">${value}</span>`;
                  wrap.appendChild(row);
                };

                // 组合对象字段（对象描述/体验评价/时间/地点）
                const combineObj = (obj) => {
                  const d1 = window.GuixuHelpers.SafeGetValue(obj, '对象描述', '');
                  const d2 = window.GuixuHelpers.SafeGetValue(obj, '体验评价', '');
                  const t  = window.GuixuHelpers.SafeGetValue(obj, '时间', '');
                  const l  = window.GuixuHelpers.SafeGetValue(obj, '地点', '');
                  return [d1, d2, t, l].filter(Boolean).join('｜');
                };

                // 数组：逐条渲染为 事件1/事件2/…
                if (Array.isArray(data)) {
                  const list = data.filter(Boolean);
                  if (!list.length) return;
                  addHeader();
                  list.forEach((it, idx) => {
                    let text = '';
                    if (it && typeof it === 'object') text = combineObj(it);
                    else text = String(it);
                    if (text && String(text).trim()) renderItem(`事件${idx + 1}`, text);
                  });
                  return;
                }

                // 对象：键为标签名，值为对象/字符串
                if (data && typeof data === 'object') {
                  const keys = Object.keys(data).filter(k => k !== '$meta');
                  if (!keys.length) return;
                  addHeader();
                  keys.forEach(k => {
                    const v = data[k];
                    let text = '';
                    if (v && typeof v === 'object') text = combineObj(v);
                    else text = String(v ?? '');
                    if (text && String(text).trim()) renderItem(k, text);
                  });
                  return;
                }

                // 字符串：渲染为单条
                if (typeof data === 'string') {
                  const s = data.trim();
                  if (s) {
                    addHeader();
                    renderItem('条目', s);
                  }
                }
              };

              renderFirstList(first);
            } catch (_) {}
            put('性观念', window.GuixuHelpers.SafeGetValue(love, '性观念', ''));
            // 癖好与禁忌
            try {
              const pref = love['癖好与禁忌'];
              const renderKVRows = (label, obj) => {
                if (!obj || typeof obj !== 'object') return;
                const entries = Object.keys(obj)
                  .filter(k => k !== '$meta')
                  .map(k => [k, obj[k]])
                  .filter(([k, v]) => v != null && String(v).trim() !== '');
                if (!entries.length) return;
                const header = document.createElement('div');
                header.className = 'attribute-item';
                header.innerHTML = `<span class="attribute-name">${label}</span><span class="attribute-value"></span>`;
                wrap.appendChild(header);
                entries.forEach(([k, v]) => {
                  const row = document.createElement('div');
                  row.className = 'attribute-item';
                  row.innerHTML = `<span class="attribute-name">${k}</span><span class="attribute-value">${v}</span>`;
                  wrap.appendChild(row);
                });
              };
              if (pref && typeof pref === 'object') {
                renderKVRows('喜好', pref['喜好']);
                renderKVRows('雷区', pref['雷区']);
              }
            } catch (_) {}
          } else {
            const empty = document.createElement('div');
            empty.className = 'ability-empty';
            empty.textContent = '无';
            wrap.appendChild(empty);
          }
          card.appendChild(wrap);
          pLove.appendChild(card);
        }

        // 清理原根（剩余无用容器）
        try { root.remove(); } catch (_) {}

        // 绑定标签切换
        tabs.addEventListener('click', (ev) => {
          const btn = ev.target.closest('.cd-tab');
          if (!btn) return;
          const id = btn.getAttribute('data-tab');
          tabs.querySelectorAll('.cd-tab').forEach(b => b.classList.toggle('active', b === btn));
          panels.querySelectorAll('.cd-panel').forEach(p => p.classList.toggle('active', p.getAttribute('data-tab') === id));
          // 小优化：切换时滚动到顶部，移动端体验更好
          try { host.scrollTop = 0; } catch (_) {}
        });

      } catch (e) {
        console.warn('[归墟] _upgradeCharacterDetailsToTabs 构建失败:', e);
      }
    },

    // 新增：写回“深度互动模块”布尔值到当前 MVU（同步当前楼层与 0 楼）
    async _setNpcDeepInteraction(relRef, enabled) {
      try {
        const currentId = window.GuixuAPI.getCurrentMessageId();
        const messages = await window.GuixuAPI.getChatMessages(currentId);
        if (!messages || !messages[0]) throw new Error('无法读取当前聊天数据');

        const currentMvuState = messages[0].data || {};
        currentMvuState.stat_data = currentMvuState.stat_data || {};
        const stat_data = currentMvuState.stat_data;

        // 定位 NPC
        let loc = RelationshipsComponent._locateNpcInState(stat_data, relRef);
        if (!loc) {
          try {
            if (RelationshipsComponent._rebuildRelationshipDict(stat_data)) {
              loc = RelationshipsComponent._locateNpcInState(stat_data, relRef);
            }
          } catch (_) {}
        }
        if (!loc) throw new Error('在人物关系列表中未找到该角色');

        const { containerType, matchKeyOrIdx, relObj, originalRelEntry } = loc;
        const obj = (relObj && typeof relObj === 'object') ? relObj : {};
        obj['深度互动模块'] = !!enabled;

        // 写回（保持原容器类型）
        if (containerType === 'object') {
          const wasStringContainer = (typeof stat_data['人物关系列表'] === 'string');
          let dict;
          try { dict = wasStringContainer ? JSON.parse(stat_data['人物关系列表']) : stat_data['人物关系列表']; } catch (_) { dict = {}; }
          if (!dict || typeof dict !== 'object' || Array.isArray(dict)) dict = {};
          dict[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(obj) : obj;
          stat_data['人物关系列表'] = wasStringContainer ? JSON.stringify(dict) : dict;
        } else {
          const wrap = Array.isArray(stat_data['人物关系列表']) ? stat_data['人物关系列表'] : [[]];
          const list = Array.isArray(wrap[0]) ? wrap[0] : [];
          list[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(obj) : obj;
          stat_data['人物关系列表'] = [list];
        }

        // 同步写回（当前楼层 + 0 楼）
        const updates = [{ message_id: currentId, data: currentMvuState }];
        if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
        await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });

        // 刷新相关 UI
        await this._refreshAllRelatedUI();
        return true;
      } catch (e) {
        console.error('[归墟] _setNpcDeepInteraction 失败:', e);
        throw e;
      }
    },

    // 删除指定索引的过往交集（实时写回 MVU）
    async _deleteEventHistoryItem(relRef, evIndex) {
      const _ = window.GuixuAPI?.lodash || window._ || {
        get: (obj, path, def) => {
          try {
            const val = path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
            return val === undefined ? def : val;
          } catch { return def; }
        },
        set: (obj, path, value) => {
          try {
            const keys = path.split('.');
            let o = obj;
            while (keys.length > 1) {
              const k = keys.shift();
              if (!o[k] || typeof o[k] !== 'object') o[k] = {};
              o = o[k];
            }
            o[keys[0]] = value;
          } catch { }
          return obj;
        },
      };
      const h = window.GuixuHelpers;
      const currentId = window.GuixuAPI.getCurrentMessageId();
      const messages = await window.GuixuAPI.getChatMessages(currentId);
      if (!messages || !messages[0]) throw new Error('无法读取当前聊天数据');

      const currentMvuState = messages[0].data || {};
      currentMvuState.stat_data = currentMvuState.stat_data || {};
      const stat_data = currentMvuState.stat_data;

      // 统一定位NPC并删除其 event_history 指定索引
      let loc = RelationshipsComponent._locateNpcInState(stat_data, relRef);
      if (!loc) {
        try {
          if (RelationshipsComponent._rebuildRelationshipDict(stat_data)) {
            loc = RelationshipsComponent._locateNpcInState(stat_data, relRef);
          }
        } catch (_) { /* ignore */ }
      }
      if (!loc) throw new Error('在人物关系列表中未找到该角色');
      const { containerType, matchKeyOrIdx, relObj, originalRelEntry } = loc;

      const obj = (relObj && typeof relObj === 'object') ? relObj : {};
      const cur = obj.event_history;

      if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
        // 对象字典：按当前可见顺序找到第 i 个键并删除
        const keys = Object.keys(cur).filter(k => k !== '$meta');
        const i = Math.max(0, parseInt(evIndex, 10) || 0);
        if (i >= 0 && i < keys.length) {
          const delKey = keys[i];
          delete cur[delKey];
        }
      } else {
        // 数组：按索引删除
        const arr = Array.isArray(cur) ? cur : [];
        const i = Math.max(0, parseInt(evIndex, 10) || 0);
        if (i >= 0 && i < arr.length) arr.splice(i, 1);
        obj.event_history = arr;
      }

      // 写回（保持原容器类型）
      if (containerType === 'object') {
        const wasStringContainer = (typeof stat_data['人物关系列表'] === 'string');
        let dict;
        try { dict = wasStringContainer ? JSON.parse(stat_data['人物关系列表']) : stat_data['人物关系列表']; } catch (_) { dict = {}; }
        if (!dict || typeof dict !== 'object' || Array.isArray(dict)) dict = {};
        dict[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(obj) : obj;
        stat_data['人物关系列表'] = wasStringContainer ? JSON.stringify(dict) : dict;
      } else {
        const wrap = Array.isArray(stat_data['人物关系列表']) ? stat_data['人物关系列表'] : [[]];
        const list = Array.isArray(wrap[0]) ? wrap[0] : [];
        list[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(obj) : obj;
        stat_data['人物关系列表'] = [list];
      }

      const updates = [{ message_id: currentId, data: currentMvuState }];
      if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
      await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });

      // 刷新界面（若面板仍打开）
      await this._refreshAllRelatedUI();
    },

    // 新增：交易面板
    async openTradePanel(rel) {
      try {
        const h = window.GuixuHelpers;
        const messages = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
        const stat_data = (messages?.[0]?.data?.stat_data) || {};
        const userStones = Number(h.SafeGetValue(stat_data, '灵石', 0)) || 0;

        const name = h.SafeGetValue(rel, 'name', '未知之人');
        const favorability = parseInt(h.SafeGetValue(rel, 'favorability', 0), 10);
        // 获取最新NPC对象（避免面板复用导致的旧数据）
        const findRelNow = (sd) => {
          try {
            const arr = window.GuixuHelpers.readList(sd, '人物关系列表');
            const rid = h.SafeGetValue(rel, 'id', null);
            const rname = h.SafeGetValue(rel, 'name', null);
            const found = arr.map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } })
              .find(o => o && ((rid != null && h.SafeGetValue(o, 'id', null) === rid) || (rname && h.SafeGetValue(o, 'name', null) === rname)));
            return found || rel;
          } catch { return rel; }
        };
        const relNow = findRelNow(stat_data);
        const theirStones = Number(h.SafeGetValue(relNow, '灵石', 0)) || 0;
        // 货币单位（基础单位：下品灵石）
        const Curr = window.GuixuHelpers.Currency;
        const currentUnit = Curr.getPreferredUnit();
        const userStonesDisplay = `${Curr.formatFromBase(userStones, currentUnit, { decimals: 2, compact: true })} ${currentUnit}`;
        const theirStonesDisplay = `${Curr.formatFromBase(theirStones, currentUnit, { decimals: 2, compact: true })} ${currentUnit}`;
        // 实时校验是否允许交易（防止处罚后仍可打开）
        const allowTradeNow = (String(h.SafeGetValue(relNow, 'allow_trade', false)).toLowerCase() === 'true') || h.SafeGetValue(relNow, 'allow_trade', false) === true;
        if (!allowTradeNow) {
          window.GuixuHelpers.showTemporaryMessage('该角色不接受交易（allow_trade = false）');
          return;
        }

        // 对方可出售的物品 + 我方背包
        const npcItems = RelationshipsComponent._readNpcStorageAsArray(relNow);
        // 汇总玩家背包内所有列表为一并展示（只读）- 兼容对象MVU与旧数组包装
        const collectUserItems = (sd) => {
          const lists = ['功法列表', '武器列表', '防具列表', '饰品列表', '法宝列表', '丹药列表', '其他列表'];
          const out = [];
          try {
            lists.forEach(key => {
              const arr = (window.GuixuHelpers && typeof window.GuixuHelpers.readList === 'function')
                ? window.GuixuHelpers.readList(sd, key)
                : [];
              if (Array.isArray(arr)) {
                arr.forEach(raw => {
                  if (!raw) return;
                  try { out.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch { /* ignore */ }
                });
              }
            });
          } catch (_) { }
          return out;
        };
        const userItems = collectUserItems(stat_data);

        // 获取玩家神海用于价格计算
        // 优先从“当前属性.神海”读取，旧顶层散键兜底
        const playerShenhai = Number(((stat_data && stat_data['当前属性'] && stat_data['当前属性']['神海']) ?? h.SafeGetValue(stat_data, '神海', 0))) || 0;

        const renderNpcItemRow = (it) => {
          const n = h.SafeGetValue(it, 'name', '未知物品');
          const id = h.SafeGetValue(it, 'id', h.SafeGetValue(it, 'uid', 'N/A'));
          const t = h.SafeGetValue(it, 'tier', '练气');
          const q = Number(h.SafeGetValue(it, 'quantity', 1)) || 1;
          const baseVal = Number(h.SafeGetValue(it, 'base_value', 0)) || 0;

          // 使用新的价格计算器
          let buyPrice = baseVal;
          let sellPrice = baseVal;
          if (window.GuixuTradeCalculator && baseVal > 0) {
            try {
              const priceInfo = window.GuixuTradeCalculator.computeTradePrices(baseVal, t, playerShenhai);
              buyPrice = priceInfo.buy_price;
              sellPrice = priceInfo.sell_price;
            } catch (e) {
              console.warn('[归墟] 价格计算失败:', e);
            }
          }

          const tierStyle = h.getTierStyle(t);
          const meta = `品阶:${t} | 数量:${q} | 基础价值:${baseVal} | 买入价:${buyPrice}`;
          return `
            <div class="trade-item" data-item-id="${id}" data-item-data='${JSON.stringify(it).replace(/'/g, "&#39;")}'>
              <span class="item-name item-clickable" style="${tierStyle}; cursor: pointer;" data-item-id="${id}">${n}</span>
              <span class="item-meta">${meta}</span>
              <button class="btn-purchase-item" data-item-id="${id}">购买</button>
            </div>
          `;
        };

        // 我方物品：展示名称/品阶/数量/价值，提供“出售”按钮
        const renderUserItemRow = (it) => {
          const n = h.SafeGetValue(it, 'name', '未知物品');
          const id = h.SafeGetValue(it, 'id', h.SafeGetValue(it, 'uid', 'N/A'));
          const t = h.SafeGetValue(it, 'tier', '无');
          const q = Number(h.SafeGetValue(it, 'quantity', 1)) || 1;
          const baseVal = Number(h.SafeGetValue(it, 'base_value', 0)) || 0;

          // 使用新的价格计算器计算卖出价格
          let sellPrice = baseVal;
          if (window.GuixuTradeCalculator && baseVal > 0) {
            try {
              const priceInfo = window.GuixuTradeCalculator.computeTradePrices(baseVal, t, playerShenhai);
              sellPrice = priceInfo.sell_price;
            } catch (e) {
              console.warn('[归墟] 价格计算失败:', e);
            }
          }

          const tierStyle = h.getTierStyle(t);
          const meta = `品阶:${t} | 数量:${q} | 基础价值:${baseVal} | 卖出价:${sellPrice}`;
          return `
            <div class="trade-item" data-item-id="${id}" data-item-data='${JSON.stringify(it).replace(/'/g, "&#39;")}'>
              <span class="item-name item-clickable" style="${tierStyle}; cursor: pointer;" data-item-id="${id}">${n}</span>
              <span class="item-meta">${meta}</span>
              <button class="btn-sell-item" data-item-id="${id}">出售</button>
            </div>
          `;
        };

        const bodyHtml = `
          <style>
            #trade-search-input {
              flex: 1 1 auto;
              min-width: 160px;
              border: 1px solid rgba(201,170,113,0.35);
              background: rgba(26,26,46,0.5);
              color: #e8e3d6;
              border-radius: 8px;
              padding: 8px 10px;
              font-size: 12px;
              outline: none;
            }
            #trade-search-input::placeholder { color:#8b7355; }
            #trade-modal .trade-toolbar { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }
          </style>
          <div class="trade-summary">
            <div class="trade-section">
              <div class="section-title">你的资产</div>
              <div class="attributes-list" style="padding:10px;">
                <div class="attribute-item"><span class="attribute-name">灵石</span><span class="attribute-value" id="trade-user-stones" data-base="${userStones}">${userStonesDisplay}</span></div>
              </div>
            </div>
            <div class="trade-section">
              <div class="section-title">对方信息</div>
              <div class="attributes-list" style="padding:10px;">
                <div class="attribute-item"><span class="attribute-name">姓名</span><span class="attribute-value">${name}</span></div>
                <div class="attribute-item"><span class="attribute-name">好感度</span><span class="attribute-value">${favorability}</span></div>
                <div class="attribute-item"><span class="attribute-name">灵石</span><span class="attribute-value" id="trade-npc-stones" data-base="${theirStones}">${theirStonesDisplay}</span></div>
              </div>
            </div>
          </div>

          <div class="trade-section">
            <div class="section-title">物品列表</div>
            <div class="trade-toolbar">
              <button id="trade-tab-npc" class="interaction-btn">对方物品</button>
              <button id="trade-tab-user" class="interaction-btn">我的物品</button>
              <input id="trade-search-input" class="gx-input" type="search" placeholder="搜索物品..." />
              <select id="trade-currency-unit" class="gx-select">
                <option value="下品灵石" ${currentUnit === '下品灵石' ? 'selected' : ''}>下品灵石</option>
                <option value="中品灵石" ${currentUnit === '中品灵石' ? 'selected' : ''}>中品灵石</option>
                <option value="上品灵石" ${currentUnit === '上品灵石' ? 'selected' : ''}>上品灵石</option>
              </select>
            </div>
            <p id="trade-currency-tip" style="color:#8b7355; font-size:12px; margin: 6px 0;">提示：交易货币基础单位为 下品灵石。当前显示单位：<strong id="trade-currency-current">${currentUnit}</strong></p>
            <div class="trade-table-wrapper">
              <table class="trade-table">
                <thead>
                  <tr>
                    <th data-sort="name">名称</th>
                    <th data-sort="tier">品阶</th>
                    <th data-sort="quantity">数量</th>
                    <th data-sort="base">基础价值</th>
                    <th data-sort="buy">买入价</th>
                    <th data-sort="sell">卖出价</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody id="trade-table-body"></tbody>
              </table>
            </div>
            <p style="color:#8b7355; margin-top:8px; font-size:12px;">提示：点击表头可排序；点击名称查看详情；出价越接近推荐价，且好感度越高，成交越稳妥。</p>
            <div style="text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(201, 170, 113, 0.3);">
              <button id="btn-batch-fix-items" class="interaction-btn" style="padding: 8px 16px; font-size: 12px;">🔧 批量修复物品分类</button>
              <p style="color:#8b7355; font-size: 11px; margin-top: 5px;">如遇到物品分类错误，点击此按钮进行修复</p>
            </div>
          </div>
        `;

        window.GuixuBaseModal.open('trade-modal');
        window.GuixuBaseModal.setTitle('trade-modal', `交易面板 - ${name}`);
        window.GuixuBaseModal.setBodyHTML('trade-modal', bodyHtml);

        // 初始化“单列表+排序”渲染
        try {
          const state = { view: 'npc', sortKey: 'tier', sortDir: 'desc', keyword: '', unit: Curr.getPreferredUnit() };
          const tableBody = document.getElementById('trade-table-body');
          const tabNpc = document.getElementById('trade-tab-npc');
          const tabUser = document.getElementById('trade-tab-user');
          const shenhaiForCalc = playerShenhai;
          const normalizeItem = (raw) => { try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return raw || {}; } };
          const tierOrder = (t) => window.GuixuTradeCalculator?.getTierLevel ? window.GuixuTradeCalculator.getTierLevel(t || '练气') : (['练气', '筑基', '金丹', '元婴', '化神', '合体', '飞升', '神桥'].indexOf(String(t)) + 1 || 1);
          const computePrices = (it) => {
            const baseVal = Number(window.GuixuHelpers.SafeGetValue(it, 'base_value', 0)) || 0;
            const tier = window.GuixuHelpers.SafeGetValue(it, 'tier', '练气');
            if (window.GuixuTradeCalculator && baseVal > 0) {
              try {
                const p = window.GuixuTradeCalculator.computeTradePrices(baseVal, tier, shenhaiForCalc);
                return { buy: p.buy_price, sell: p.sell_price };
              } catch (e) { }
            }
            return { buy: baseVal, sell: baseVal };
          };
          const buildList = (list, isNpc) => {
            const arr = Array.isArray(list) ? list : [];
            return arr.filter(x => x).map(raw => {
              const it = normalizeItem(raw);
              const id = String(window.GuixuHelpers.SafeGetValue(it, 'id', window.GuixuHelpers.SafeGetValue(it, 'uid', 'N/A')));
              const name = window.GuixuHelpers.SafeGetValue(it, 'name', '未知物品');
              const tier = window.GuixuHelpers.SafeGetValue(it, 'tier', '练气');
              const quantity = Number(window.GuixuHelpers.SafeGetValue(it, 'quantity', 1)) || 1;
              const base = Number(window.GuixuHelpers.SafeGetValue(it, 'base_value', 0)) || 0;
              const price = computePrices(it);
              return { it, id, name, tier, quantity, base, buy: price.buy, sell: price.sell, isNpc };
            });
          };
          let npcList = buildList(RelationshipsComponent._readNpcStorageAsArray(relNow), true);
          let userList = buildList(userItems, false);
          const applySort = (list) => {
            const key = state.sortKey;
            const dir = state.sortDir === 'asc' ? 1 : -1;
            return list.slice().sort((a, b) => {
              const va = key === 'tier' ? tierOrder(a[key]) : (key === 'name' ? a[key] : Number(a[key] || 0));
              const vb = key === 'tier' ? tierOrder(b[key]) : (key === 'name' ? b[key] : Number(b[key] || 0));
              if (va < vb) return -1 * dir;
              if (va > vb) return 1 * dir;
              return 0;
            });
          };
          const escape = (s) => String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
          const renderTable = () => {
            // 显示/同步当前单位与两侧余额
            const keep = (x) => {
              const s = Number(x).toFixed(2);
              return s.replace(/\.0+$/, '').replace(/(\.\d{1,2})\d+$/, '$1');
            };
            const tipUnitEl = document.getElementById('trade-currency-current');
            if (tipUnitEl) tipUnitEl.textContent = state.unit;
            const uSpan = document.getElementById('trade-user-stones');
            if (uSpan) {
              const base = Number(uSpan.getAttribute('data-base') || '0') || 0;
              uSpan.textContent = `${keep(Curr.fromBase(base, state.unit))} ${state.unit}`;
            }
            const nSpan = document.getElementById('trade-npc-stones');
            if (nSpan) {
              const base = Number(nSpan.getAttribute('data-base') || '0') || 0;
              nSpan.textContent = `${keep(Curr.fromBase(base, state.unit))} ${state.unit}`;
            }

            tabNpc?.classList.toggle('active', state.view === 'npc');
            tabUser?.classList.toggle('active', state.view === 'user');
            const source = state.view === 'npc' ? npcList : userList;
            const kw = (state.keyword || '').trim().toLowerCase();
            const data = kw
              ? source.filter(row => row.name.toLowerCase().includes(kw) || String(row.tier).toLowerCase().includes(kw))
              : source;
            const sorted = applySort(data);
            tableBody.innerHTML = sorted.map(row => {
              const actionBtn = row.isNpc
                ? `<button class="btn-purchase-item" data-item-id="${escape(row.id)}">购买</button>`
                : `<button class="btn-sell-item" data-item-id="${escape(row.id)}">出售</button>`;
              const itJson = JSON.stringify(row.it).replace(/'/g, "&#39;");
              return `<tr class="trade-row" data-item-id="${escape(row.id === 'N/A' ? row.name : row.id)}" data-item-data='${itJson}'>
                <td><span class="item-name item-clickable" style="${h.getTierStyle(row.tier)}" data-item-id="${escape(row.id)}">${escape(row.name)}</span></td>
                <td>${escape(row.tier)}</td>
                <td>${row.quantity}</td>
                <td>${keep(Curr.fromBase(row.base, state.unit))}</td>
                <td>${keep(Curr.fromBase(row.buy, state.unit))}</td>
                <td>${keep(Curr.fromBase(row.sell, state.unit))}</td>
                <td>${actionBtn}</td>
              </tr>`;
            }).join('');
          };
          tabNpc?.addEventListener('click', () => { state.view = 'npc'; renderTable(); });
          tabUser?.addEventListener('click', () => { state.view = 'user'; renderTable(); });
          const thead = document.querySelector('#trade-modal .trade-table thead');
          thead?.addEventListener('click', (ev) => {
            const th = ev.target.closest('th[data-sort]');
            if (!th) return;
            const key = th.getAttribute('data-sort');
            if (!key) return;
            if (state.sortKey === key) {
              state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              state.sortKey = key;
              state.sortDir = key === 'name' ? 'asc' : 'desc';
            }
            renderTable();
          });

          // 物品搜索
          const searchEl = document.getElementById('trade-search-input');
          searchEl?.addEventListener('input', () => {
            state.keyword = (searchEl.value || '');
            renderTable();
          });

          // 单位选择与全局联动
          const unitSel = document.getElementById('trade-currency-unit');
          if (unitSel) {
            unitSel.value = state.unit;
            if (!unitSel._boundChange) {
              unitSel._boundChange = true;
              unitSel.addEventListener('change', () => {
                state.unit = Curr.setPreferredUnit(unitSel.value);
                renderTable();
              });
            }
          }
          document.addEventListener('guixu:currencyUnitChanged', () => {
            state.unit = Curr.getPreferredUnit();
            if (unitSel) unitSel.value = state.unit;
            renderTable();
          }, { passive: true });

          renderTable();
          const btnFix = document.getElementById('btn-batch-fix-items');
          if (btnFix && !btnFix._bound) {
            btnFix._bound = true;
            btnFix.addEventListener('click', () => {
              RelationshipsComponent._startBatchFix().catch(e => console.warn('[归墟] 批量修复失败:', e));
            });
          }
        } catch (e) {
          console.warn('[归墟] trade table render init failed:', e);
        }

        // 事件委托：购买
        const modalBody = document.querySelector('#trade-modal .modal-body');
        if (modalBody && !modalBody._bindTradePurchase) {
          modalBody._bindTradePurchase = true;
          modalBody.addEventListener('click', async (ev) => {
            // 名称点击：显示物品详情浮窗（不影响购买/出售按钮）
            const nameEl = ev.target.closest('.item-name');
            if (nameEl) {
              try {
                const container = document.querySelector('#trade-modal .modal-body');
                const host = container || document.body;
                // 确保宿主作为定位上下文，避免绝对定位参照 body 造成偏移
                try {
                  const cs = window.getComputedStyle(host);
                  if (cs && cs.position === 'static') host.style.position = 'relative';
                } catch (_) { }
                let tooltip = document.getElementById('trade-tooltip');
                if (!tooltip) {
                  tooltip = document.createElement('div');
                  tooltip.id = 'trade-tooltip';
                  host.appendChild(tooltip);
                } else if (tooltip.parentElement !== host) {
                  // 如浮窗曾被插入到其他面板，重挂载到当前交易面板，避免定位基准错误
                  host.appendChild(tooltip);
                }
                // 尝试从最近的 data-item-data 拉取物品
                let it = null;
                let holder = nameEl.closest('[data-item-data]');
                if (!holder) {
                  holder = nameEl.closest('.trade-row');
                }
                const rawData = holder?.getAttribute('data-item-data') || nameEl.getAttribute('data-item-data') || '';
                try { it = rawData ? JSON.parse(rawData.replace(/&#39;/g, "'")) : null; } catch { it = null; }
                const h = window.GuixuHelpers;
                const title = h.SafeGetValue(it, 'name', '未知物品');
                const tier = h.SafeGetValue(it, 'tier', '练气');
                const desc = h.SafeGetValue(it, 'description', '');
                const base = h.SafeGetValue(it, 'base_value', 0);
                const qty = h.SafeGetValue(it, 'quantity', 1);
                // 优先使用通用渲染器，展示固定加成/百分比加成/特殊词条，并按品阶渲染名称颜色
                let html = '';
                if (window.GuixuRenderers && typeof window.GuixuRenderers.renderTooltipContent === 'function') {
                  html = window.GuixuRenderers.renderTooltipContent(it);
                  // 附加数量/基础价值信息
                  html += `<div class="tooltip-attributes"><p><strong>数量:</strong> ${qty}</p><p><strong>基础价值:</strong> ${base}</p></div>`;
                } else {
                  const tierStyle = h.getTierStyle(tier);
                  const details = (window.GuixuRenderers && typeof window.GuixuRenderers.renderItemDetailsForInventory === 'function')
                    ? window.GuixuRenderers.renderItemDetailsForInventory(it)
                    : '';
                  html = `<div class="tooltip-title" style="${tierStyle}">${title}</div>
                    <div class="tooltip-attributes">
                      <p><strong>品阶:</strong> ${tier}</p>
                      <p><strong>数量:</strong> ${qty}</p>
                      <p><strong>基础价值:</strong> ${base}</p>
                      ${desc ? `<div class="tooltip-section">${desc}</div>` : ''}
                      ${details ? `<div class="tooltip-section">${details}</div>` : ''}
                    </div>`;
                }
                tooltip.innerHTML = html;
                // 为防止遮挡再次点击同一物品，允许点击穿透到名称元素，避免“点击被浮窗拦截”
                try { tooltip.style.pointerEvents = 'none'; } catch (_) { }
                // 定位：基于被点击元素，优先贴其下方，必要时向上翻转，并进行边界收敛
                // 先显示以便测量
                tooltip.style.display = 'block';
                const pad = 8;

                // 可复用的定位函数（支持滚动/resize 时实时重算位置）
                const positionTooltip = () => {
                  try {
                    const bodyRect = host.getBoundingClientRect();
                    const ttRect = tooltip.getBoundingClientRect();
                    const anchorRect = nameEl.getBoundingClientRect();

                    // 注意：绝对定位在可滚动容器中，需要把 scrollTop/scrollLeft 计入坐标
                    const scrollLeft = host.scrollLeft || 0;
                    const scrollTop = host.scrollTop || 0;

                    // 水平以元素中心对齐，垂直默认在元素下方 8px（相对 host 的内容坐标系）
                    let relLeft = (anchorRect.left + anchorRect.width / 2) - bodyRect.left + scrollLeft - (ttRect.width / 2);
                    let relTop = (anchorRect.bottom - bodyRect.top) + scrollTop + 8;

                    // 当前可视区域（host 的可见视口尺寸）
                    const viewportW = bodyRect.width;
                    const viewportH = bodyRect.height;

                    // 若下方空间不足则翻转到上方（以“可见视口”的下边界为准）
                    if (relTop + ttRect.height + pad > scrollTop + viewportH) {
                      relTop = (anchorRect.top - bodyRect.top) + scrollTop - ttRect.height - 8;
                    }

                    // 边界收敛：将浮窗限制在 host 的“可见视口”范围内，避免被裁切或跑偏
                    const minLeft = scrollLeft + pad;
                    const maxLeft = scrollLeft + Math.max(pad, viewportW - ttRect.width - pad);
                    const minTop = scrollTop + pad;
                    const maxTop = scrollTop + Math.max(pad, viewportH - ttRect.height - pad);
                    relLeft = Math.min(Math.max(minLeft, relLeft), maxLeft);
                    relTop = Math.min(Math.max(minTop, relTop), maxTop);

                    tooltip.style.left = relLeft + 'px';
                    tooltip.style.top = relTop + 'px';
                  } catch (_) { }
                };

                positionTooltip();

                // 采集可滚动祖先，确保在其滚动时重新定位（而非使用旧坐标）
                const scrollParents = [];
                const addIfScrollable = (el) => {
                  if (!el || el === document.body || el === document.documentElement) return;
                  try {
                    const cs = getComputedStyle(el);
                    const ovY = cs.overflowY, ovX = cs.overflowX;
                    const isScrollable = (ovY === 'auto' || ovY === 'scroll' || ovY === 'overlay' ||
                      ovX === 'auto' || ovX === 'scroll' || ovX === 'overlay');
                    if (isScrollable) scrollParents.push(el);
                  } catch (_) { }
                };
                let pEl = nameEl.parentElement;
                while (pEl && pEl !== host) { addIfScrollable(pEl); pEl = pEl.parentElement; }
                addIfScrollable(host);

                const onAnyScroll = () => { positionTooltip(); };
                const onResize = () => { positionTooltip(); };

                const cleanup = () => {
                  try { document.removeEventListener('click', onDocClick, true); } catch (_) { }
                  try { window.removeEventListener('resize', onResize, true); } catch (_) { }
                  try { scrollParents.forEach(sp => sp.removeEventListener('scroll', onAnyScroll, true)); } catch (_) { }
                };

                const onDocClick = (e2) => {
                  if (!tooltip.contains(e2.target) && e2.target !== nameEl) {
                    tooltip.style.display = 'none';
                    cleanup();
                  }
                };

                // 绑定事件：点击外部关闭；滚动容器/窗口 resize 时实时重算位置
                setTimeout(() => {
                  document.addEventListener('click', onDocClick, true);
                  window.addEventListener('resize', onResize, true);
                  scrollParents.forEach(sp => sp.addEventListener('scroll', onAnyScroll, { capture: true, passive: true }));
                }, 0);
              } catch (e) {
                console.warn('[归墟] 展示物品详情失败:', e);
              }
              return;
            }
            // 购买对方物品
            const btnBuy = ev.target.closest('.btn-purchase-item');
            if (btnBuy) {
              const itemId = btnBuy.dataset.itemId;
              // 使用最新 NPC 数据定位物品，避免使用旧的 rel 导致找不到
              const messagesBuy = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
              const sdBuy = (messagesBuy?.[0]?.data?.stat_data) || {};
              const arrBuy = window.GuixuHelpers.readList(sdBuy, '人物关系列表');
              const ridBuy = window.GuixuHelpers.SafeGetValue(rel, 'id', null);
              const rnameBuy = window.GuixuHelpers.SafeGetValue(rel, 'name', null);
              const relLatestBuy = arrBuy.map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } })
                .find(o => o && ((ridBuy != null && window.GuixuHelpers.SafeGetValue(o, 'id', null) === ridBuy) || (rnameBuy && window.GuixuHelpers.SafeGetValue(o, 'name', null) === rnameBuy))) || rel;
              // 优先从当前行读取物品（避免依赖ID匹配）
              let item = null;
              try {
                const tr = btnBuy.closest('.trade-row');
                const raw = tr?.getAttribute('data-item-data') || '';
                item = raw ? JSON.parse(raw.replace(/&#39;/g, "'")) : null;
              } catch (_) { item = null; }
              // 若行内缺失，再回退至 NPC 储物袋中查找
              if (!item) {
                const list = RelationshipsComponent._readNpcStorageAsArray(relLatestBuy);
                for (const raw of list) {
                  let it;
                  try { it = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { it = raw; }
                  if (!it) continue;
                  const id = String(window.GuixuHelpers.SafeGetValue(it, 'id', window.GuixuHelpers.SafeGetValue(it, 'uid', '')));
                  const name = String(window.GuixuHelpers.SafeGetValue(it, 'name', ''));
                  if (String(itemId) === id || (name && String(itemId) === name)) { item = it; break; }
                }
              }
              if (!item) {
                console.error('[归墟] 购买失败：未找到该物品', { itemId, relLatestBuy });
                window.GuixuHelpers.showTemporaryMessage('未找到该物品');
                return;
              }

              // 数量选择（如果库存大于1）
              const maxQuantity = Number(window.GuixuHelpers.SafeGetValue(item, 'quantity', 1)) || 1;
              let purchaseQuantity = 1;
              if (maxQuantity > 1) {
                purchaseQuantity = await (window.GuixuMain?.showNumberPrompt
                  ? window.GuixuMain.showNumberPrompt({
                    title: '选择购买数量',
                    message: `【${window.GuixuHelpers.SafeGetValue(item, 'name', '未知物品')}】库存：${maxQuantity}，请选择购买数量`,
                    min: 1,
                    max: maxQuantity,
                    defaultValue: 1,
                  })
                  : Promise.resolve(parseInt(prompt(`请输入购买数量（库存：${maxQuantity}）`, '1') || '1', 10)));
                if (!Number.isFinite(purchaseQuantity) || purchaseQuantity <= 0 || purchaseQuantity > maxQuantity) {
                  window.GuixuHelpers.showTemporaryMessage('已取消或无效的数量');
                  return;
                }
              }

              // 出价输入（推荐买入价 x 数量）
              const baseVal = Number(window.GuixuHelpers.SafeGetValue(item, 'base_value', 0)) || 0;
              const tierForBuy = window.GuixuHelpers.SafeGetValue(item, 'tier', '练气');
              let recommendedTotalBuy = baseVal * purchaseQuantity;
              // 使用“最新玩家神海”进行计算，避免使用旧作用域变量
              // 优先从“当前属性.神海”读取，旧顶层散键兜底
              const playerShenhaiBuy = Number(((sdBuy && sdBuy['当前属性'] && sdBuy['当前属性']['神海']) ?? window.GuixuHelpers.SafeGetValue(sdBuy, '神海', 0))) || 0;
              if (window.GuixuTradeCalculator && baseVal > 0) {
                try {
                  const priceInfo = window.GuixuTradeCalculator.computeTradePrices(baseVal, tierForBuy, playerShenhaiBuy);
                  const unitPrice = Number(priceInfo?.buy_price);
                  if (Number.isFinite(unitPrice) && unitPrice > 0) {
                    recommendedTotalBuy = Math.max(1, unitPrice) * purchaseQuantity;
                  }
                } catch (e) { /* ignore，转入兜底逻辑 */ }
              }
              // 兜底：若计算器不可用/异常，则尝试读取表格中的“买入价”列
              if (recommendedTotalBuy === baseVal * purchaseQuantity) {
                try {
                  const tr = btnBuy.closest('.trade-row');
                  const buyCell = tr?.children?.[4]; // 第5列为“买入价”
                  const unitBuy = Number((buyCell?.textContent || '').replace(/[^\d.-]/g, ''));
                  if (Number.isFinite(unitBuy) && unitBuy > 0) {
                    recommendedTotalBuy = unitBuy * purchaseQuantity;
                  }
                } catch (_) { /* ignore */ }
              }
              recommendedTotalBuy = Math.max(1, Number(recommendedTotalBuy) || 1);
              const unit = Curr.getPreferredUnit();
              const offer = await (window.GuixuMain?.showNumberPrompt
                ? window.GuixuMain.showNumberPrompt({
                  title: `出价（${unit}）`,
                  message: `为【${window.GuixuHelpers.SafeGetValue(item, 'name', '未知物品')} x${purchaseQuantity}】出价（推荐买入价：${Curr.formatFromBase(recommendedTotalBuy, unit)} ${unit}）`,
                  min: 1,
                  max: 999999,
                  defaultValue: Math.max(1, Math.round(Curr.fromBase(recommendedTotalBuy, unit)) || 1),
                })
                : Promise.resolve(parseInt(
                  prompt(
                    `请输入总出价（推荐买入价：${recommendedTotalBuy}，数量：${purchaseQuantity}）`,
                    String(recommendedTotalBuy || 1)
                  ) || '0',
                  10
                )));
              if (!Number.isFinite(offer) || offer <= 0) {
                window.GuixuHelpers.showTemporaryMessage('已取消或无效的出价');
                return;
              }

              // 校验余额
              const messagesNow = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
              const currentStat = (messagesNow?.[0]?.data?.stat_data) || {};
              const myStones = Number(window.GuixuHelpers.SafeGetValue(currentStat, '灵石', 0)) || 0;
              const offerBase = Curr.toBase(offer, Curr.getPreferredUnit());
              if (offerBase > myStones) {
                window.GuixuHelpers.showTemporaryMessage('灵石不足，无法完成交易');
                return;
              }

              // 获取玩家当前神海
              // 优先从“当前属性.神海”读取，旧顶层散键兜底
              const playerShenhai = Number(((currentStat && currentStat['当前属性'] && currentStat['当前属性']['神海']) ?? window.GuixuHelpers.SafeGetValue(currentStat, '神海', 0))) || 0;

              // 将购买数量传给成功率计算（用于按数量缩放推荐价）
              item.purchaseQuantity = purchaseQuantity;
              // 使用新的交易成功率计算
              const success = RelationshipsComponent._computeTradeSuccess(offerBase, item, favorability, playerShenhai);
              if (!success) {
                // 低于推荐买入价导致的拒绝计入违规尝试
                const punished = RelationshipsComponent._maybeAbuseAndPunishOnReject(rel);
                if (!punished) {
                  window.GuixuHelpers.showTemporaryMessage('对方摇头婉拒，或许提高出价/好感度再试。');
                }
                return;
              }

              try {
                await RelationshipsComponent._applyTradeTransaction(rel, item, offerBase, purchaseQuantity);
                window.GuixuHelpers.showTemporaryMessage('交易成功！物品已入账');

                // 将交易写入指令中心（提醒 LLM：发生了购买互动）
                try {
                  const stateObj = window.GuixuState?.getState?.();
                  if (stateObj) {
                    const pending = [...(stateObj.pendingActions || [])];
                    const npcName = window.GuixuHelpers.SafeGetValue(rel, 'name', '未知之人');
                    const itemName = window.GuixuHelpers.SafeGetValue(item, 'name', '未知物品');
                    const tierText = window.GuixuHelpers.SafeGetValue(item, 'tier', '练气');
                    const unitPrice = Math.max(1, Math.round(Number(offerBase || 0) / Math.max(1, Number(purchaseQuantity || 1))));
                    pending.push({ action: 'trade_buy', npcName, itemName, tier: tierText, quantity: purchaseQuantity, unitPrice, totalPrice: offerBase });
                    window.GuixuState.update('pendingActions', pending);
                  }
                } catch (e) { console.warn('[归墟] 购买交易写入指令中心失败:', e); }

                // 实时刷新相关界面
                await RelationshipsComponent._refreshAllRelatedUI();

                // 重新打开交易面板显示最新数据
                await RelationshipsComponent.openTradePanel(rel);
              } catch (err) {
                console.error('[归墟] 交易落账失败：', err);
                window.GuixuHelpers.showTemporaryMessage('交易失败：保存数据出错');
              }
              return;
            }

            // 出售我方物品
            const btnSell = ev.target.closest('.btn-sell-item');
            if (btnSell) {
              const itemId = btnSell.dataset.itemId;
              // 重新获取最新数据，避免使用缓存的旧数据
              const messagesLatest = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
              const latestStatData = (messagesLatest?.[0]?.data?.stat_data) || {};

              // 从玩家背包合并清单中查找（与渲染列表保持一致）
              // 改进：查找玩家物品时同时返回原数组索引与原始条目，避免后续写回时找不到对应位置
              const findUserItemById = () => {
                const lists = ['功法列表', '武器列表', '防具列表', '饰品列表', '法宝列表', '丹药列表', '其他列表'];
                const normalize = (v) => {
                  if (v === null || v === undefined) return '';
                  try { return String(v).trim().toLowerCase(); } catch { return ''; }
                };
                const needle = normalize(itemId);
                const H = window.GuixuHelpers;
                // 从表格行兜底读取名称（用于无ID的单件物品）
                let fallbackNameNorm = '';
                try {
                  const tr = btnSell.closest('.trade-row');
                  const raw = tr?.getAttribute('data-item-data') || '';
                  const obj = raw ? JSON.parse(raw.replace(/&#39;/g, "'")) : null;
                  fallbackNameNorm = normalize(H.SafeGetValue(obj, 'name', ''));
                } catch (_) {}
                try {
                  for (const k of lists) {
                    const arr = (H && typeof H.readList === 'function') ? H.readList(latestStatData, k) : [];
                    if (Array.isArray(arr)) {
                      for (let i = 0; i < arr.length; i++) {
                        const raw = arr[i];
                        if (!raw) continue;
                        let it;
                        try { it = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { it = raw; }
                        if (!it && typeof raw === 'string') {
                          const rawStr = raw.toLowerCase();
                          if (needle && rawStr.includes(needle)) {
                            return { listKey: k, listIndex: i, originalEntry: raw, parsedEntry: typeof raw === 'string' ? raw : it };
                          }
                          continue;
                        }
                        const id = normalize(H.SafeGetValue(it, 'id', H.SafeGetValue(it, 'uid', '')));
                        const name = normalize(H.SafeGetValue(it, 'name', ''));
                        if ((needle && (id === needle || name === needle)) || (fallbackNameNorm && name === fallbackNameNorm)) {
                          return { listKey: k, listIndex: i, originalEntry: raw, parsedEntry: it };
                        }
                        if (needle && (name && name.includes(needle))) {
                          return { listKey: k, listIndex: i, originalEntry: raw, parsedEntry: it };
                        }
                        try {
                          const rawPreview = (typeof raw === 'string') ? raw.toLowerCase() : JSON.stringify(it).toLowerCase();
                          if (needle && rawPreview.includes(needle)) {
                            return { listKey: k, listIndex: i, originalEntry: raw, parsedEntry: it };
                          }
                        } catch (_) { }
                      }
                    }
                  }
                } catch (e) { /* ignore */ }
                try {
                  const snapshot = lists.map(k => {
                    const arr = (H && typeof H.readList === 'function') ? H.readList(stat_data, k) : [];
                    const items = [];
                    if (Array.isArray(arr)) {
                      for (const rawEntry of arr) {
                        if (!rawEntry) continue;
                        let parsed;
                        try { parsed = typeof rawEntry === 'string' ? JSON.parse(rawEntry) : rawEntry; } catch { parsed = rawEntry; }
                        items.push({
                          id: H.SafeGetValue(parsed, 'id', H.SafeGetValue(parsed, 'uid', '')),
                          name: H.SafeGetValue(parsed, 'name', ''),
                          rawPreview: (typeof rawEntry === 'string' ? (rawEntry.length > 120 ? rawEntry.slice(0, 120) + '...' : rawEntry) : JSON.stringify(parsed).slice(0, 120))
                        });
                      }
                    }
                    return { key: k, length: (arr?.length || 0), items };
                  });
                  console.warn('[归墟] findUserItemById 未找到匹配，itemId=', itemId, '背包快照=', snapshot);
                } catch (e) { /* ignore */ }
                return null;
              };
              const userItemRef = findUserItemById();
              if (!userItemRef) {
                window.GuixuHelpers.showTemporaryMessage('未找到要出售的物品');
                return;
              }
              // 将解析后的物品对象传给后端处理，并保留原引用信息以便写回
              const item = Object.assign({}, (typeof userItemRef.parsedEntry === 'string' ? (function () { try { return JSON.parse(userItemRef.parsedEntry); } catch { return { name: userItemRef.parsedEntry }; } })() : userItemRef.parsedEntry), { __userRef: { listKey: userItemRef.listKey, uIdx: userItemRef.listIndex } });
              if (!item) {
                window.GuixuHelpers.showTemporaryMessage('未找到要出售的物品');
                return;
              }

              // 数量选择（如果物品数量大于1）
              const itemQuantity = Number(window.GuixuHelpers.SafeGetValue(item, 'quantity', 1)) || 1;
              let sellQuantity = 1;
              if (itemQuantity > 1) {
                sellQuantity = await (window.GuixuMain?.showNumberPrompt
                  ? window.GuixuMain.showNumberPrompt({
                    title: '选择出售数量',
                    message: `【${window.GuixuHelpers.SafeGetValue(item, 'name', '未知物品')}】拥有：${itemQuantity}，请选择出售数量`,
                    min: 1,
                    max: itemQuantity,
                    defaultValue: 1,
                  })
                  : Promise.resolve(parseInt(prompt(`请输入出售数量（拥有：${itemQuantity}）`, '1') || '1', 10)));
                if (!Number.isFinite(sellQuantity) || sellQuantity <= 0 || sellQuantity > itemQuantity) {
                  window.GuixuHelpers.showTemporaryMessage('已取消或无效的数量');
                  return;
                }
              }

              // 出价输入（推荐卖出价 x 数量）
              const baseVal = Number(window.GuixuHelpers.SafeGetValue(item, 'base_value', 0)) || 0;
              const tierForSell = window.GuixuHelpers.SafeGetValue(item, 'tier', '练气');
              let recommendedTotalSell = baseVal * sellQuantity;
              // 使用“最新玩家神海”计算推荐卖出价，避免作用域变量未定义
              // 优先从“当前属性.神海”读取，旧顶层散键兜底
              const playerShenhaiSell = Number(((latestStatData && latestStatData['当前属性'] && latestStatData['当前属性']['神海']) ?? window.GuixuHelpers.SafeGetValue(latestStatData, '神海', 0))) || 0;
              if (window.GuixuTradeCalculator && baseVal > 0) {
                try {
                  const priceInfo = window.GuixuTradeCalculator.computeTradePrices(baseVal, tierForSell, playerShenhaiSell);
                  recommendedTotalSell = Math.max(1, Number(priceInfo?.sell_price || baseVal)) * sellQuantity;
                } catch (e) { /* ignore, fallback to base */ }
              }
              const unit = Curr.getPreferredUnit();
              const offer = await (window.GuixuMain?.showNumberPrompt
                ? window.GuixuMain.showNumberPrompt({
                  title: `出售价格（${unit}）`,
                  message: `为【${window.GuixuHelpers.SafeGetValue(item, 'name', '未知物品')} x${sellQuantity}】标价（推荐卖出价：${Curr.formatFromBase(recommendedTotalSell, unit)} ${unit}）`,
                  min: 0,
                  max: 999999,
                  defaultValue: Math.max(1, Math.round(Curr.fromBase(recommendedTotalSell, unit)) || 1),
                })
                : Promise.resolve(parseInt(
                  prompt(
                    `请输入总标价（推荐卖出价：${recommendedTotalSell}，数量：${sellQuantity}）`,
                    String(recommendedTotalSell || 1)
                  ) || '0',
                  10
                )));
              if (!Number.isFinite(offer) || offer < 0) {
                window.GuixuHelpers.showTemporaryMessage('已取消或无效的标价');
                return;
              }

              // 将出售数量添加到物品对象中，供后续处理使用
              item.sellQuantity = sellQuantity;

              // NPC 余额校验 + 成交逻辑（标价需不高于 NPC 可接受最高价，且 NPC 灵石足够）
              // 读取最新 NPC 灵石（避免使用旧的 rel 值）
              const messagesNow2 = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
              const sd2 = (messagesNow2?.[0]?.data?.stat_data) || {};
              const arr2 = window.GuixuHelpers.readList(sd2, '人物关系列表');
              const rid2 = window.GuixuHelpers.SafeGetValue(rel, 'id', null);
              const rname2 = window.GuixuHelpers.SafeGetValue(rel, 'name', null);
              const relLatest = arr2.map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } })
                .find(o => o && ((rid2 != null && window.GuixuHelpers.SafeGetValue(o, 'id', null) === rid2) || (rname2 && window.GuixuHelpers.SafeGetValue(o, 'name', null) === rname2))) || rel;
              const theirStonesNow = Number(window.GuixuHelpers.SafeGetValue(relLatest, '灵石', 0)) || 0;
              const offerBase = Curr.toBase(offer, Curr.getPreferredUnit());
              if (offerBase > theirStonesNow) {
                window.GuixuHelpers.showTemporaryMessage('对方灵石不足，无法成交');
                return;
              }
              // 获取玩家当前神海
              // 优先从“当前属性.神海”读取，旧顶层散键兜底
              const playerShenhai2 = Number(((sd2 && sd2['当前属性'] && sd2['当前属性']['神海']) ?? window.GuixuHelpers.SafeGetValue(sd2, '神海', 0))) || 0;

              // 使用新的出售成功率计算
              const ok = RelationshipsComponent._computeSellSuccess(offerBase, item, favorability, playerShenhai2);
              if (!ok) {
                // 高于可接受卖出价导致的拒绝计入违规尝试
                const punished = RelationshipsComponent._maybeAbuseAndPunishOnReject(rel);
                if (!punished) {
                  window.GuixuHelpers.showTemporaryMessage('对方摇头婉拒，或许降低价格/提高好感度再试。');
                }
                return;
              }

              try {
                await RelationshipsComponent._applySellTransaction(rel, item, offerBase);
                window.GuixuHelpers.showTemporaryMessage('出售成功！灵石已入账');

                // 将交易写入指令中心（提醒 LLM：发生了出售互动）
                try {
                  const stateObj = window.GuixuState?.getState?.();
                  if (stateObj) {
                    const pending = [...(stateObj.pendingActions || [])];
                    const npcName = window.GuixuHelpers.SafeGetValue(rel, 'name', '未知之人');
                    const itemName = window.GuixuHelpers.SafeGetValue(item, 'name', '未知物品');
                    const sellQty = Number(window.GuixuHelpers.SafeGetValue(item, 'sellQuantity', 1)) || 1;
                    const tierText = window.GuixuHelpers.SafeGetValue(item, 'tier', '练气');
                    const unitPrice = Math.max(0, Math.round(Number(offerBase || 0) / Math.max(1, Number(sellQty || 1))));
                    pending.push({ action: 'trade_sell', npcName, itemName, tier: tierText, quantity: sellQty, unitPrice, totalPrice: offerBase });
                    window.GuixuState.update('pendingActions', pending);
                  }
                } catch (e) { console.warn('[归墟] 出售交易写入指令中心失败:', e); }

                // 实时刷新相关界面
                await RelationshipsComponent._refreshAllRelatedUI();

                // 重新打开交易面板显示最新数据
                await RelationshipsComponent.openTradePanel(rel);
              } catch (err) {
                console.error('[归墟] 出售落账失败：', err);
                window.GuixuHelpers.showTemporaryMessage('出售失败：保存数据出错');
              }
              return;
            }
          });
        }
      } catch (e) {
        console.warn('[归墟] openTradePanel 失败:', e);
        window.GuixuHelpers.showTemporaryMessage('无法打开交易面板');
      }
    },

    // 交易成功率：主要看出价是否“够”，好感度给予一定折扣/保险
    _computeTradeSuccess(offer, item, favorability, playerShenhai) {
      try {
        const h = window.GuixuHelpers;
        const baseValue = Number(h.SafeGetValue(item, 'base_value', 0)) || 0;
        const tier = h.SafeGetValue(item, 'tier', '练气');
        const fav = Number(favorability || 0);
        const shenhai = Number(playerShenhai || 0);

        // 使用交易计算器获取推荐买入价（按单件）
        let recommendedPrice = baseValue;
        if (window.GuixuTradeCalculator && baseValue > 0) {
          try {
            const priceInfo = window.GuixuTradeCalculator.computeTradePrices(baseValue, tier, shenhai);
            recommendedPrice = priceInfo.buy_price;
          } catch (e) {
            console.warn('[归墟] 价格计算失败，使用基础价格:', e);
          }
        }

        // 考虑购买数量（购买时将 item.purchaseQuantity 设置为总购买数）
        const qty = Number(h.SafeGetValue(item, 'purchaseQuantity', 1)) || 1;
        recommendedPrice = recommendedPrice * qty;

        // 强制门槛判定：低于阈值直接拒绝；阈值随好感度给予小幅折扣
        // favorability 折扣：每点 0.15‰，最多 15%
        const favDiscount = Math.min(0.15, fav * 0.0015);
        const acceptThreshold = Math.max(1, recommendedPrice) * (1 - favDiscount);
        if (offer < acceptThreshold) {
          return false;
        }
        // 达到或超过门槛即接受（去除随机拒绝，确保低于买入价在好感为0时必拒绝）
        return true;
      } catch (error) {
        console.warn('[归墟] 交易成功率计算出错:', error);
        // 兜底逻辑：基于基础价值简单判定
        const baseValue = Number(window.GuixuHelpers.SafeGetValue(item, 'base_value', 0)) || 0;
        return offer >= baseValue * 0.8; // 至少要达到基础价值的80%
      }
    },

    // 关系英文枚举 → 中文
    _toChineseRelationship(rel) {
      const map = {
        ENEMY: '敌对',
        ALLY: '盟友',
        NEUTRAL: '中立',
        FRIEND: '朋友',
        LOVER: '恋人',
      };
      const key = String(rel || '').toUpperCase();
      return map[key] || rel;
    },

    // 出售成功率：主要看出价是否“合理”，好感度给予上浮空间；NPC余额不足直接失败
    _computeSellSuccess(offer, item, favorability, playerShenhai) {
      try {
        const h = window.GuixuHelpers;
        const baseValue = Number(h.SafeGetValue(item, 'base_value', 0)) || 0;
        const tier = h.SafeGetValue(item, 'tier', '练气');
        const fav = Number(favorability || 0);
        const shenhai = Number(playerShenhai || 0);

        // 使用交易计算器获取推荐卖出价（按单件）
        let recommendedPrice = baseValue;
        if (window.GuixuTradeCalculator && baseValue > 0) {
          try {
            const priceInfo = window.GuixuTradeCalculator.computeTradePrices(baseValue, tier, shenhai);
            recommendedPrice = priceInfo.sell_price;
          } catch (e) {
            console.warn('[归墟] 价格计算失败，使用基础价格:', e);
          }
        }

        // 考虑出售数量（出售时 item.sellQuantity 已设置）
        const qty = Number(h.SafeGetValue(item, 'sellQuantity', 1)) || 1;
        recommendedPrice = recommendedPrice * qty;

        // NPC可接受的最高价：推荐卖出价 * (1 + 好感度加成)，但有上限
        const favBonus = Math.min(0.4, fav * 0.001); // 每点好感度0.1%加成，最多40%
        const maxAcceptablePrice = Math.floor(recommendedPrice * (1 + favBonus));

        // 最终判断：出价不能超过NPC可接受的最高价
        return offer <= maxAcceptablePrice;
      } catch (error) {
        console.warn('[归墟] 出售成功率计算出错:', error);
        // 兜底逻辑：基于基础价值简单判定
        const baseValue = Number(window.GuixuHelpers.SafeGetValue(item, 'base_value', 0)) || 0;
        return offer <= baseValue * 1.2; // 不超过基础价值的120%
      }
    },

    // 违规交易尝试 - 配置与工具
    _TRADE_ABUSE_MAX_ATTEMPTS: 3,          // 达到/超过该次数触发惩罚
    _TRADE_ABUSE_FAVOR_DEDUCT: 15,         // 触发惩罚时扣减好感度
    _getTradeAbuseKey(rel) {
      const h = window.GuixuHelpers;
      const id = h.SafeGetValue(rel, 'id', null);
      const name = h.SafeGetValue(rel, 'name', '未知之人');
      return id != null ? `id:${id}` : `name:${name}`;
    },
    _getAbuseCounters() {
      // 优先读 GuixuState，其次 localStorage，最后内存兜底，确保即使 state.js 未同步也能工作
      try {
        const s = window.GuixuState?.getState?.();
        if (s && typeof s.tradeAbuseCounters === 'object' && s.tradeAbuseCounters !== null) {
          return { ...s.tradeAbuseCounters };
        }
      } catch (_) { }
      try {
        const raw = localStorage.getItem('guixu_trade_abuse_counters');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return { ...parsed };
        }
      } catch (_) { }
      return { ...(this._abuseCountersMemory || {}) };
    },
    _setAbuseCounters(map) {
      try { window.GuixuState?.update?.('tradeAbuseCounters', map || {}); } catch (_) { }
      try { localStorage.setItem('guixu_trade_abuse_counters', JSON.stringify(map || {})); } catch (_) { }
      this._abuseCountersMemory = { ...(map || {}) };
    },
    _incrementAbuseCounter(rel) {
      try {
        const key = this._getTradeAbuseKey(rel);
        const map = this._getAbuseCounters();
        map[key] = (map[key] || 0) + 1;
        this._setAbuseCounters(map);
        return map[key];
      } catch (_) { return 1; }
    },
    _resetAbuseCounter(rel) {
      try {
        const key = this._getTradeAbuseKey(rel);
        const map = this._getAbuseCounters();
        if (map[key] != null) {
          delete map[key];
          this._setAbuseCounters(map);
        }
      } catch (_) { }
    },
    async _applyTradeAbusePenalty(rel, attempts) {
      const _ = window.GuixuAPI?.lodash || window._ || {
        get: (obj, path, def) => {
          try {
            const val = path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
            return val === undefined ? def : val;
          } catch { return def; }
        },
        set: (obj, path, value) => {
          try {
            const keys = path.split('.');
            let o = obj;
            while (keys.length > 1) {
              const k = keys.shift();
              if (!o[k] || typeof o[k] !== 'object') o[k] = {};
              o = o[k];
            }
            o[keys[0]] = value;
          } catch { }
          return obj;
        },
      };
      const h = window.GuixuHelpers;
      const currentId = window.GuixuAPI.getCurrentMessageId();
      const messages = await window.GuixuAPI.getChatMessages(currentId);
      if (!messages || !messages[0]) throw new Error('无法读取当前聊天数据');
      const currentMvuState = messages[0].data || {};
      currentMvuState.stat_data = currentMvuState.stat_data || {};
      const stat_data = currentMvuState.stat_data;

      // 定位 NPC
      const container = stat_data['人物关系列表'];
      const relId = h.SafeGetValue(rel, 'id', null);
      const relName = h.SafeGetValue(rel, 'name', null);
      let newFavor = 0;

      if (container && typeof container === 'object' && container.$meta && container.$meta.extensible === true) {
        const entries = Object.entries(container).filter(([k]) => k !== '$meta');
        const found = entries.find(([k, v]) => {
          try {
            const obj = typeof v === 'string' ? JSON.parse(v) : v;
            if (relId != null) return h.SafeGetValue(obj, 'id', null) === relId;
            return h.SafeGetValue(obj, 'name', null) === relName;
          } catch { return false; }
        });
        if (!found) throw new Error('在人物关系列表中未找到该角色');
        const [matchKey, originalRelEntry] = found;
        const relObj = (typeof originalRelEntry === 'string') ? JSON.parse(originalRelEntry) : (originalRelEntry || {});
        const deduct = Number(this._TRADE_ABUSE_FAVOR_DEDUCT || 0) || 0;
        const origFavor = Number(h.SafeGetValue(relObj, 'favorability', 0)) || 0;
        newFavor = Math.max(0, origFavor - deduct);
        relObj['favorability'] = newFavor;
        relObj['allow_trade'] = false;
        try {
          const npcName = h.SafeGetValue(relObj, 'name', '未知之人');
          const reason = `玩家多次尝试低买/高卖，已触怒【${npcName}】，好感度-${deduct}（累计违规${attempts}次），已拒绝交易。`;
          const ev = Array.isArray(relObj.event_history) ? relObj.event_history : [];
          ev.push(reason);
          relObj.event_history = ev;
        } catch (_) { }
        container[matchKey] = (typeof originalRelEntry === 'string') ? JSON.stringify(relObj) : relObj;
      } else {
        const list = (stat_data?.['人物关系列表']?.[0]) || [];
        if (!Array.isArray(list)) throw new Error('人物关系列表结构异常');
        const idx = list.findIndex(entry => {
          try {
            const obj = typeof entry === 'string' ? JSON.parse(entry) : entry;
            if (relId != null) return h.SafeGetValue(obj, 'id', null) === relId;
            return h.SafeGetValue(obj, 'name', null) === relName;
          } catch { return false; }
        });
        if (idx === -1) throw new Error('在人物关系列表中未找到该角色');
        const originalRelEntry = list[idx];
        const relObj = (typeof originalRelEntry === 'string') ? JSON.parse(originalRelEntry) : (originalRelEntry || {});
        const deduct = Number(this._TRADE_ABUSE_FAVOR_DEDUCT || 0) || 0;
        const origFavor = Number(h.SafeGetValue(relObj, 'favorability', 0)) || 0;
        newFavor = Math.max(0, origFavor - deduct);
        relObj['favorability'] = newFavor;
        relObj['allow_trade'] = false;
        try {
          const npcName = h.SafeGetValue(relObj, 'name', '未知之人');
          const reason = `玩家多次尝试低买/高卖，已触怒【${npcName}】，好感度-${deduct}（累计违规${attempts}次），已拒绝交易。`;
          const ev = Array.isArray(relObj.event_history) ? relObj.event_history : [];
          ev.push(reason);
          relObj.event_history = ev;
        } catch (_) { }
        list[idx] = (typeof originalRelEntry === 'string') ? JSON.stringify(relObj) : relObj;
        stat_data['人物关系列表'][0] = list;
      }

      const updates = [{ message_id: currentId, data: currentMvuState }];
      if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
      await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });

      // 指令中心提示
      try {
        const stateObj = window.GuixuState?.getState?.();
        if (stateObj) {
          const pending = [...(stateObj.pendingActions || [])];
          const npcName = h.SafeGetValue(relObj, 'name', '未知之人');
          pending.push({ action: 'trade_abuse', npcName, attempts, deductedFavor: deduct });
          window.GuixuState.update('pendingActions', pending);
        }
      } catch (e) {
        console.warn('[归墟] 写入 trade_abuse 指令失败:', e);
      }

      // 关闭交易面板，刷新UI
      try {
        // 确保彻底关闭所有模态框（包括交易面板）
        if (window.GuixuBaseModal?.closeAll) {
          window.GuixuBaseModal.closeAll();
        } else {
          const tradeModal = document.getElementById('trade-modal');
          if (tradeModal) tradeModal.style.display = 'none';
        }
        // 刷新列表以反映 allow_trade=false
        await this._refreshAllRelatedUI();
      } catch (_) { }

      // 重置计数并提示
      this._resetAbuseCounter(rel);
      window.GuixuHelpers.showTemporaryMessage('你的出价已激怒对方，交易被强制终止，好感度下降。');

      return { deducted: deduct, newFavor };
    },
    _maybeAbuseAndPunishOnReject(rel) {
      const cnt = this._incrementAbuseCounter(rel);
      if (cnt >= this._TRADE_ABUSE_MAX_ATTEMPTS) {
        // 触发惩罚（异步）
        this._applyTradeAbusePenalty(rel, cnt).catch(e => console.warn('[归墟] 惩罚执行失败:', e));
        return true;
      }
      return false;
    },

    // 根据当前 MVU 定位 NPC（兼容对象字典/数组包装/字符串化）
    _locateNpcInState(stat_data, rel) {
      try {
        const h = window.GuixuHelpers;
        const norm = (v) => {
          if (v === undefined || v === null) return '';
          try { return String(v).trim().toLowerCase(); } catch { return ''; }
        };
        let container = stat_data && stat_data['人物关系列表'];
        try {
          if (typeof container === 'string') {
            const s = container.trim();
            if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
              container = JSON.parse(s);
            }
          }
        } catch (_) { }
        const relKey = h.SafeGetValue(rel, '__key', null);
        const relId = h.SafeGetValue(rel, 'id', h.SafeGetValue(rel, 'uid', null));
        const relName = h.SafeGetValue(rel, 'name', null);
        const rid = norm(relId);
        const rname = norm(relName);

        // 对象字典优先
        if (container && typeof container === 'object' && !Array.isArray(container)) {
          // 1) __key 直击
          if (relKey && Object.prototype.hasOwnProperty.call(container, relKey)) {
            const ov = container[relKey];
            const obj = (typeof ov === 'string') ? (()=>{try{return JSON.parse(ov);}catch{return ov;}})() : (ov || {});
            return { containerType: 'object', matchKeyOrIdx: relKey, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: ov };
          }
          // 2) name 作为键名匹配
          if (relName && Object.prototype.hasOwnProperty.call(container, relName)) {
            const ov = container[relName];
            const obj = (typeof ov === 'string') ? (()=>{try{return JSON.parse(ov);}catch{return ov;}})() : (ov || {});
            return { containerType: 'object', matchKeyOrIdx: relName, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: ov };
          }
          // 2.5) id 作为键名（规范化）匹配
          if (rid) {
            try {
              const keys = Object.keys(container).filter(k => k !== '$meta');
              const hit = keys.find(k => norm(k) === rid);
              if (hit) {
                const ov = container[hit];
                const obj = (typeof ov === 'string') ? (()=>{try{return JSON.parse(ov);}catch{return ov;}})() : (ov || {});
                return { containerType: 'object', matchKeyOrIdx: hit, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: ov };
              }
            } catch (_) {}
          }
          // 3) 扫描值按 id/name 匹配；值缺 name 时回退到键名
          const entries = Object.entries(container).filter(([k]) => k !== '$meta');
          for (const [k, v] of entries) {
            let obj = v;
            try { obj = (typeof v === 'string') ? JSON.parse(v) : v; } catch { obj = v; }
            if (!obj) continue;
            const oid = norm(h.SafeGetValue(obj, 'id', h.SafeGetValue(obj, 'uid', null)));
            const onameRaw = h.SafeGetValue(obj, 'name', null);
            const oname = norm(onameRaw);
            const missingName = !oname || oname === 'n/a';
            if (rid && oid && rid === oid) {
              return { containerType: 'object', matchKeyOrIdx: k, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: v };
            }
            if (rname && !missingName && rname === oname) {
              return { containerType: 'object', matchKeyOrIdx: k, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: v };
            }
            if (rname && missingName && rname === norm(k)) {
              return { containerType: 'object', matchKeyOrIdx: k, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: v };
            }
            // 允许用 id 匹配键名（当值缺少 id/name 时）
            if (rid && norm(k) === rid) {
              return { containerType: 'object', matchKeyOrIdx: k, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: v };
            }
          }
          // 4) 使用 readList 兜底（借助 __key 反查）
          try {
            const arr = h.readList(stat_data, '人物关系列表') || [];
            const found = arr.find(o => {
              try {
                const oid = norm(h.SafeGetValue(o, 'id', h.SafeGetValue(o, 'uid', null)));
                const oname = norm(h.SafeGetValue(o, 'name', null));
                return (rid && oid && rid === oid) || (rname && oname && rname === oname);
              } catch { return false; }
            });
            const key = h.SafeGetValue(found || {}, '__key', null);
            if (key && Object.prototype.hasOwnProperty.call(container, key)) {
              const ov = container[key];
              let obj = ov;
              try { obj = (typeof ov === 'string') ? JSON.parse(ov) : ov; } catch { }
              return { containerType: 'object', matchKeyOrIdx: key, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: ov };
            }
          } catch (_) { }
        }

        // 旧数组包装
        const list = (container && Array.isArray(container) && Array.isArray(container[0])) ? container[0] : [];
        if (Array.isArray(list)) {
          for (let i = 0; i < list.length; i++) {
            const entry = list[i];
            let obj = entry;
            try { obj = (typeof entry === 'string') ? JSON.parse(entry) : entry; } catch { obj = entry; }
            if (!obj) continue;
            const oid = norm(h.SafeGetValue(obj, 'id', h.SafeGetValue(obj, 'uid', null)));
            const oname = norm(h.SafeGetValue(obj, 'name', null));
            if (rid && oid && rid === oid) return { containerType: 'array', matchKeyOrIdx: i, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: entry };
            if (rname && oname && rname === oname) return { containerType: 'array', matchKeyOrIdx: i, relObj: (typeof obj === 'object' ? obj : {}), originalRelEntry: entry };
          }
        }

        return null;
      } catch (_e) {
        return null;
      }
    },
 
    // 新增：若容器缺失/不规范，基于 readList 重建对象字典容器，便于按姓名/ID精确定位
    _rebuildRelationshipDict(stat_data) {
      try {
        if (!stat_data) return false;
        const h = window.GuixuHelpers;
        // 已是对象字典且可扩展则不处理
        const cont = stat_data['人物关系列表'];
        if (cont && typeof cont === 'object' && !Array.isArray(cont) && cont.$meta && cont.$meta.extensible === true) {
          return false;
        }
        // 从统一读取接口获取数组
        const arr = (h && typeof h.readList === 'function')
          ? h.readList(stat_data, '人物关系列表')
          : (Array.isArray(cont) ? cont : []);
        if (!Array.isArray(arr) || arr.length === 0) return false;
 
        const dict = { $meta: { extensible: true } };
        arr.forEach((raw, i) => {
          if (!raw) return;
          let obj = raw;
          try { obj = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch { obj = raw; }
          if (!obj || typeof obj !== 'object') return;
          const name = h.SafeGetValue(obj, 'name', null);
          const id = h.SafeGetValue(obj, 'id', h.SafeGetValue(obj, 'uid', null));
          const key = (name && String(name).trim()) || (id != null ? String(id) : ('NPC_' + i));
          // 记录反查键
          obj.__key = key;
          dict[key] = obj;
        });
        stat_data['人物关系列表'] = dict;
        return true;
      } catch (_) {
        return false;
      }
    },
 
    // 将出售结果写回 MVU：增加玩家灵石、从玩家包减少/移除该物品、NPC 物品列表加入/叠加、NPC 灵石减少
    async _applySellTransaction(rel, item, offer) {
      const _ = window.GuixuAPI?.lodash || window._ || {
        get: (obj, path, def) => {
          try {
            const val = path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
            return val === undefined ? def : val;
          } catch {
            return def;
          }
        },
        set: (obj, path, value) => {
          try {
            const keys = path.split('.');
            let o = obj;
            while (keys.length > 1) {
              const k = keys.shift();
              if (!o[k] || typeof o[k] !== 'object') o[k] = {};
              o = o[k];
            }
            o[keys[0]] = value;
          } catch { }
          return obj;
        },
      };
      const h = window.GuixuHelpers;
      const currentId = window.GuixuAPI.getCurrentMessageId();
      const messages = await window.GuixuAPI.getChatMessages(currentId);
      if (!messages || !messages[0]) throw new Error('无法读取当前聊天数据');

      const currentMvuState = messages[0].data || {};
      currentMvuState.stat_data = currentMvuState.stat_data || {};
      const stat_data = currentMvuState.stat_data;

      // 玩家 + 灵石
      const myStones = Number(h.SafeGetValue(stat_data, '灵石', 0)) || 0;
      _.set(stat_data, '灵石', myStones + offer);

      // NPC 定位与 - 灵石
      const container = stat_data['人物关系列表'];
      const relId = h.SafeGetValue(rel, 'id', null);
      const relName = h.SafeGetValue(rel, 'name', null);
      let relObj, originalRelEntry, containerType = 'array', matchKeyOrIdx = -1;
      const __loc = RelationshipsComponent._locateNpcInState(stat_data, rel);
      if (__loc) {
        containerType = __loc.containerType;
        matchKeyOrIdx = __loc.matchKeyOrIdx;
        relObj = __loc.relObj;
        originalRelEntry = __loc.originalRelEntry;
      }

      if (!__loc && container && typeof container === 'object' && container.$meta && container.$meta.extensible === true) {
        containerType = 'object';
        const entries = Object.entries(container).filter(([k]) => k !== '$meta');
        const relKey = h.SafeGetValue(rel, '__key', null);
        const found = entries.findIndex(([k, v]) => {
          try {
            // 新MVU对象字典：优先以字典键匹配（__key 或 name == 键名）
            if (relKey && String(k) === String(relKey)) return true;
            const obj = typeof v === 'string' ? JSON.parse(v) : v;
            if (relId != null) return h.SafeGetValue(obj, 'id', null) === relId;
            const objName = h.SafeGetValue(obj, 'name', null);
            if ((objName == null || objName === 'N/A' || objName === '') && relName && String(k) === String(relName)) return true;
            return objName === relName;
          } catch { return false; }
        });
        if (found === -1) throw new Error('在人物关系列表中未找到该角色');
        const [mk, ov] = entries[found];
        matchKeyOrIdx = mk;
        originalRelEntry = ov;
        relObj = (typeof ov === 'string') ? JSON.parse(ov) : (ov || {});
      } else if (!__loc) {
        const list = (stat_data?.['人物关系列表']?.[0]) || []
        if (!Array.isArray(list)) throw new Error('人物关系列表结构异常');
        const idx = list.findIndex(entry => {
          try {
            const obj = typeof entry === 'string' ? JSON.parse(entry) : entry;
            if (relId != null) return h.SafeGetValue(obj, 'id', null) === relId;
            return h.SafeGetValue(obj, 'name', null) === relName;
          } catch { return false; }
        });
        if (idx === -1) throw new Error('在人物关系列表中未找到该角色');
        matchKeyOrIdx = idx;
        originalRelEntry = list[idx];
        relObj = (typeof originalRelEntry === 'string') ? JSON.parse(originalRelEntry) : (originalRelEntry || {});
      }

      const npcStones = Number(h.SafeGetValue(relObj, '灵石', 0)) || 0;
      if (offer > npcStones) throw new Error('对方灵石不足');
      relObj['灵石'] = npcStones - offer;

      // 从玩家背包中移除该物品（智能分类，优先兼容新MVU对象字典）
      const getSmartItemCategoryForSell = (item) => {
        // 优先使用显式的 type 字段
        const explicitType = h.SafeGetValue(item, 'type', null);
        if (explicitType && explicitType !== '其他') return explicitType;

        // 基于名称与描述的关键词分类（与购买逻辑保持一致）
        const itemName = (h.SafeGetValue(item, 'name', '') || '').toLowerCase();
        const itemDesc = (h.SafeGetValue(item, 'description', '') || '').toLowerCase();
        const itemEffect = (h.SafeGetValue(item, 'effect', '') || '').toLowerCase();
        const text = `${itemName} ${itemDesc} ${itemEffect}`;
        const categoryKeywords = {
          '丹药': ['丹', '药', '丹药', '灵药', '仙丹', '药丸', '药液', '药膏', '疗伤', '回血', '回蓝', '恢复'],
          '武器': ['剑', '刀', '枪', '弓', '剑法', '刀法', '武器', '兵器', '长剑', '宝剑', '战刀', '长枪', '弯弓'],
          '防具': ['甲', '袍', '护', '防具', '盔', '靴', '衣', '甲胄', '护甲', '法袍', '战袍', '头盔', '护腕'],
          '饰品': ['戒', '项链', '手镯', '玉', '佩', '饰品', '珠', '戒指', '玉佩', '护符', '令牌'],
          '法宝': ['法宝', '宝物', '灵器', '仙器', '神器', '秘宝', '至宝', '圣器'],
          '功法': ['功法', '心法', '秘籍', '经', '诀', '术', '功', '法', '真经', '宝典'],
          '材料': ['材料', '矿', '石', '木', '草', '花', '兽', '皮', '骨', '精', '血', '矿石', '灵草']
        };
        const priorityOrder = ['丹药', '武器', '防具', '饰品', '法宝', '功法', '材料'];
        for (const cat of priorityOrder) {
          if (categoryKeywords[cat].some(k => text.includes(k))) return cat;
        }
        return '其他';
      };
      const mapTypeToListKey = (typ) => {
        switch (String(typ || '其他')) {
          case '功法': return '功法列表';
          case '武器': return '武器列表';
          case '防具': return '防具列表';
          case '饰品': return '饰品列表';
          case '法宝': return '法宝列表';
          case '丹药': return '丹药列表';
          case '材料': return '其他列表';
          case '其他':
          default: return '其他列表';
        }
      };
      const normalize = (v) => {
        if (v === null || v === undefined) return '';
        try { return String(v).trim().toLowerCase(); } catch { return ''; }
      };
      const targetId = normalize(h.SafeGetValue(item, 'id', h.SafeGetValue(item, 'uid', '')));
      const targetName = normalize(h.SafeGetValue(item, 'name', null));
      const sellQuantity = Number(h.SafeGetValue(item, 'sellQuantity', 1)) || 1;

      // 可能的背包分类（优先使用 __userRef.listKey，其次根据智能分类映射）
      const candidateKeys = [];
      if (item && item.__userRef && item.__userRef.listKey) candidateKeys.push(item.__userRef.listKey);
      const guessedKey = mapTypeToListKey(getSmartItemCategoryForSell(item));
      if (!candidateKeys.includes(guessedKey)) candidateKeys.push(guessedKey);

      // 先尝试在“对象字典容器”中扣减/删除
      let removed = false;
      for (const key of candidateKeys) {
        const cont = stat_data[key];
        const isDict = cont && typeof cont === 'object' && !Array.isArray(cont) && cont.$meta && cont.$meta.extensible === true;
        if (!isDict) continue;
        try {
          let matchedKey = null;
          let originalVal;
          let parsedObj = null;
          for (const [k, v] of Object.entries(cont)) {
            if (k === '$meta') continue;
            let obj = v;
            try { obj = (typeof v === 'string') ? JSON.parse(v) : v; } catch { obj = v; }
            const cid = normalize(h.SafeGetValue(obj, 'id', h.SafeGetValue(obj, 'uid', '')));
            const cname = normalize(h.SafeGetValue(obj, 'name', null));
            if ((targetId && cid && cid === targetId) || (targetName && cname && cname === targetName)) {
              matchedKey = k;
              originalVal = v;
              parsedObj = obj;
              break;
            }
          }
          if (matchedKey) {
            const curQ = Number(h.SafeGetValue(parsedObj, 'quantity', 1)) || 1;
            const left = Math.max(0, curQ - sellQuantity);
            if (left > 0) {
              parsedObj.quantity = left;
              cont[matchedKey] = (typeof originalVal === 'string') ? JSON.stringify(parsedObj) : parsedObj;
            } else {
              delete cont[matchedKey];
            }
            removed = true;
            break;
          }
        } catch (_) { /* continue */ }
      }

      // 若对象字典未找到，则将旧数组包装转换为对象字典后再删除（统一新形态）
      if (!removed) {
        const userListKey = candidateKeys[0];

        const ensureObjectDict = (lv) => {
          if (Array.isArray(lv)) {
            const arr = lv[0] || [];
            const obj = { $meta: { extensible: true } };
            const used = new Set();
            arr.forEach((i, idx) => {
              let v = i;
              if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) {} }
              if (!v || typeof v !== 'object') return;
              const nm = h.SafeGetValue(v, 'name', null);
              const idv = h.SafeGetValue(v, 'id', h.SafeGetValue(v, 'uid', null));
              let key = (nm && nm !== 'N/A') ? String(nm) : (idv != null ? String(idv) : `条目${idx+1}`);
              while (Object.prototype.hasOwnProperty.call(obj, key) || used.has(key)) key = `${key}_`;
              used.add(key);
              obj[key] = v;
            });
            return obj;
          }
          if (!lv || typeof lv !== 'object') return { $meta: { extensible: true } };
          if (!lv.$meta) { try { lv.$meta = { extensible: true }; } catch (_) {} }
          return lv;
        };

        const dict = ensureObjectDict(stat_data[userListKey]);
        stat_data[userListKey] = dict;

        let matchedKey = null;
        let originalVal;
        let parsedObj = null;
        for (const [k, v] of Object.entries(dict)) {
          if (k === '$meta') continue;
          let obj = v;
          try { obj = (typeof v === 'string') ? JSON.parse(v) : v; } catch { obj = v; }
          const cid = normalize(h.SafeGetValue(obj, 'id', h.SafeGetValue(obj, 'uid', '')));
          const cname = normalize(h.SafeGetValue(obj, 'name', null));
          if ((targetId && cid && cid === targetId) || (targetName && cname && cname === targetName)) {
            matchedKey = k;
            originalVal = v;
            parsedObj = obj;
            break;
          }
        }
        if (!matchedKey) throw new Error('玩家物品不存在');

        const curQ = Number(h.SafeGetValue(parsedObj, 'quantity', 1)) || 1;
        const left = Math.max(0, curQ - sellQuantity);
        if (left > 0) {
          parsedObj.quantity = left;
          dict[matchedKey] = (typeof originalVal === 'string') ? JSON.stringify(parsedObj) : parsedObj;
        } else {
          delete dict[matchedKey];
        }
      }

      // NPC 物品列表加入/叠加
      // 统一 NPC 物品容器
      const useBag = relObj && typeof relObj['储物袋'] === 'object' && relObj['储物袋'] !== null;
      if (!useBag && !Array.isArray(relObj.物品列表)) {
        relObj.物品列表 = [];
      }
      const npcItems = useBag ? RelationshipsComponent._readNpcStorageAsArray(relObj) : relObj.物品列表;

      // 查找是否已存在同ID/同名物品（兼容字符串化条目），并保持原始存储格式（字符串或对象）
      let nIdx = -1;
      try {
        for (let i = 0; i < npcItems.length; i++) {
          const entry = npcItems[i];
          if (!entry) continue;
          let parsed;
          try { parsed = typeof entry === 'string' ? JSON.parse(entry) : entry; } catch { parsed = entry; }
          const eid = h.SafeGetValue(parsed, 'id', h.SafeGetValue(parsed, 'uid', ''));
          const ename = h.SafeGetValue(parsed, 'name', null);
          if ((eid && String(eid) === String(h.SafeGetValue(item, 'id', h.SafeGetValue(item, 'uid', '')))) || (ename && String(ename) === String(h.SafeGetValue(item, 'name', '')))) {
            nIdx = i;
            break;
          }
        }
      } catch (e) { /* ignore */ }

      if (nIdx !== -1) {
        // 找到：在原始格式上叠加数量（根据实际出售数量）
        const originalNpcEntry = npcItems[nIdx];
        try {
          const parsedOld = typeof originalNpcEntry === 'string' ? JSON.parse(originalNpcEntry) : originalNpcEntry;
          const oldQ = Number(h.SafeGetValue(parsedOld, 'quantity', 1)) || 1;
          parsedOld.quantity = oldQ + sellQuantity;
          npcItems[nIdx] = (typeof originalNpcEntry === 'string') ? JSON.stringify(parsedOld) : parsedOld;
        } catch (e) {
          // 退回：直接在对象上操作（若解析失败）
          if (typeof npcItems[nIdx] === 'object' && npcItems[nIdx] !== null) {
            npcItems[nIdx].quantity = (Number(h.SafeGetValue(npcItems[nIdx], 'quantity', 1)) || 1) + sellQuantity;
          }
        }
      } else {
        // 没找到：添加新物品（按对象形式添加，设置为出售的数量）
        const pushItem = JSON.parse(JSON.stringify(item));
        // 清理可能存在的临时字段
        delete pushItem.sellQuantity;
        delete pushItem.__userRef;
        pushItem.quantity = sellQuantity;

        npcItems.push(pushItem);
      }
      if (useBag) {
        const newBag = {};
        npcItems.forEach(entry => {
          let it = entry;
          try { it = (typeof entry === 'string') ? JSON.parse(entry) : entry; } catch (_) { }
          const k = window.GuixuHelpers.SafeGetValue(it, 'name', window.GuixuHelpers.SafeGetValue(it, 'id', '物品'));
          newBag[k] = it;
        });
        relObj['储物袋'] = newBag;
      }
      // relObj.物品列表 已经通过引用被修改

      // 写回人物（保持与原类型一致）
      // 统一安全写回（兼容：对象字典原容器为字符串/对象；旧数组包装）
      if (containerType === 'object') {
        const wasStringContainer = (typeof stat_data['人物关系列表'] === 'string');
        let dict;
        try {
          dict = wasStringContainer ? JSON.parse(stat_data['人物关系列表']) : stat_data['人物关系列表'];
        } catch (_) { dict = {}; }
        if (!dict || typeof dict !== 'object' || Array.isArray(dict)) dict = {};
        const v = (typeof originalRelEntry === 'string') ? JSON.stringify(relObj) : relObj;
        dict[matchKeyOrIdx] = v;
        stat_data['人物关系列表'] = wasStringContainer ? JSON.stringify(dict) : dict;
      } else {
        // 旧结构 [ [ ... ] ]：保持包装层
        const wrap = Array.isArray(stat_data['人物关系列表']) ? stat_data['人物关系列表'] : [[]];
        const list = Array.isArray(wrap[0]) ? wrap[0] : [];
        list[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(relObj) : relObj;
        stat_data['人物关系列表'] = [list];
      }

      // 保存（当前楼层 + 0 楼），带错误捕获与调试输出
      const updates = [{ message_id: currentId, data: currentMvuState }];
      if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
      try {
        await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });
      } catch (err) {
        console.error('[归墟] setChatMessages 失败（出售操作）：', err, '准备写入：', updates);
        try { window.GuixuHelpers.showTemporaryMessage('保存数据失败：' + (err && err.message ? err.message : '未知错误')); } catch (e) { }
        // 抛出以便调用处（UI）能显示失败信息
        throw err;
      }
    },

    // 智能物品分类函数 - 统一的分类逻辑
    _getItemCategory(item) {
      const h = window.GuixuHelpers;

      // 优先使用显式的 type 字段
      const explicitType = h.SafeGetValue(item, 'type', null);
      if (explicitType && explicitType !== '其他') {
        return explicitType;
      }

      // 基于名称和描述进行智能分类
      const itemName = (h.SafeGetValue(item, 'name', '') || '').toLowerCase();
      const itemDesc = (h.SafeGetValue(item, 'description', '') || '').toLowerCase();
      const itemEffect = (h.SafeGetValue(item, 'effect', '') || '').toLowerCase();
      const text = `${itemName} ${itemDesc} ${itemEffect}`;

      // 物品分类关键词匹配
      const categoryKeywords = {
        '丹药': ['丹', '药', '丹药', '灵药', '仙丹', '药丸', '药液', '药膏', '疗伤', '回血', '回蓝', '恢复'],
        '武器': ['剑', '刀', '枪', '弓', '剑法', '刀法', '武器', '兵器', '长剑', '宝剑', '战刀', '长枪', '弯弓'],
        '防具': ['甲', '袍', '护', '防具', '盔', '靴', '衣', '甲胄', '护甲', '法袍', '战袍', '头盔', '护腕'],
        '饰品': ['戒', '项链', '手镯', '玉', '佩', '饰品', '珠', '戒指', '玉佩', '护符', '令牌'],
        '法宝': ['法宝', '宝物', '灵器', '仙器', '神器', '秘宝', '至宝', '圣器'],
        '功法': ['功法', '心法', '秘籍', '经', '诀', '术', '功', '法', '真经', '宝典'],
        '材料': ['材料', '矿', '石', '木', '草', '花', '兽', '皮', '骨', '精', '血', '矿石', '灵草']
      };

      // 按优先级检查分类（丹药优先级最高，因为最容易误分类）
      const priorityOrder = ['丹药', '武器', '防具', '饰品', '法宝', '功法', '材料'];

      for (const category of priorityOrder) {
        const keywords = categoryKeywords[category];
        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            return category;
          }
        }
      }

      return '其他';
    },

    // 统一读取 NPC 携带物品（支持 新：储物袋{名称:对象} / 旧：物品列表[]）
    _readNpcStorageAsArray(npc) {
      try {
        const bag = npc && npc['储物袋'];
        if (bag && typeof bag === 'object') {
          return Object.keys(bag)
            .filter(k => k !== '$meta')
            .map(k => {
              let val = bag[k];
              if (!val) return null;
              if (typeof val === 'string') {
                try { val = JSON.parse(val); } catch (_) { val = { name: k }; }
              }
              if (val && typeof val === 'object') {
                if (!Object.prototype.hasOwnProperty.call(val, 'name') || !val.name) val.name = k;
                return val;
              }
              return null;
            })
            .filter(Boolean);
        }
        const arr = Array.isArray(npc?.物品列表) ? npc.物品列表 : [];
        return arr.filter(Boolean);
      } catch (_) {
        return [];
      }
    },

    /**
     * 将计算得到的“属性上限”回写到 MVU（NPC 角色）
     * 仅当与现有值不一致时写回，保持容器原始结构（对象字典/旧数组包装、字符串化条目）
     */
    async _syncNpcFourDimMaxToMvu(relRef, computedMax) {
      try {
        const h = window.GuixuHelpers;
        const keys = ['法力','神海','道心','空速'];
        const normalizeMax = (o) => {
          const out = {};
          keys.forEach(k => {
            const v = Number((o || {})[k] || 0);
            out[k] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
          });
          return out;
        };
        const newMax = normalizeMax(computedMax || {});
        const currentId = window.GuixuAPI.getCurrentMessageId();
        const messages = await window.GuixuAPI.getChatMessages(currentId);
        const currentMvuState = (messages?.[0]?.data) || {};
        currentMvuState.stat_data = currentMvuState.stat_data || {};
        const stat_data = currentMvuState.stat_data;

        // 定位 NPC
        let loc = this._locateNpcInState(stat_data, relRef);
        if (!loc) {
          try {
            if (this._rebuildRelationshipDict(stat_data)) {
              loc = this._locateNpcInState(stat_data, relRef);
            }
          } catch (_) {}
        }
        if (!loc) return;

        const { containerType, matchKeyOrIdx } = loc;
        let relObj = loc.relObj || {};
        const originalRelEntry = loc.originalRelEntry;

        // 比较：若现有“属性上限”与 newMax 完全一致则跳过（兼容旧键）
        const oldMaxRaw = relObj && (relObj['属性上限'] ?? relObj['四维上限'] ?? relObj['四维属性']);
        let needWrite = true;
        try {
          if (oldMaxRaw && typeof oldMaxRaw === 'object') {
            const oldNorm = normalizeMax(oldMaxRaw);
            needWrite = keys.some(k => Number(oldNorm[k] || 0) !== Number(newMax[k] || 0));
          }
        } catch (_) {}

        // 迁移旧键为新键并清理旧键（不保留旧命名，避免回写到MVU）
        let needsCleanup = false;
        try {
          if (!relObj['基础属性'] && (relObj['基础四维'] || relObj['基础四维属性'])) {
            relObj['基础属性'] = Object.assign({}, relObj['基础四维'] || relObj['基础四维属性']);
            needsCleanup = true;
          }
        } catch (_) {}
        try {
          if (!relObj['当前属性'] && (relObj['当前四维'] || relObj['当前四维属性'])) {
            relObj['当前属性'] = Object.assign({}, relObj['当前四维'] || relObj['当前四维属性']);
            needsCleanup = true;
          }
        } catch (_) {}
        try {
          if (!relObj['属性上限'] && relObj['四维上限']) {
            relObj['属性上限'] = Object.assign({}, relObj['四维上限']);
            needsCleanup = true;
          }
        } catch (_) {}
        // 统一清理旧键
        try {
          ['四维上限','四维属性','基础四维','基础四维属性','当前四维','当前四维属性'].forEach(k => {
            if (Object.prototype.hasOwnProperty.call(relObj, k)) { delete relObj[k]; needsCleanup = true; }
          });
        } catch (_) {}

        // 若既不需要更新上限也未发生清理/迁移，则直接返回；否则继续写回
        if (!needWrite && !needsCleanup) return;

        // 回写（新结构）
        relObj['属性上限'] = newMax;

        if (containerType === 'object') {
          const wasStringContainer = (typeof stat_data['人物关系列表'] === 'string');
          let dict;
          try { dict = wasStringContainer ? JSON.parse(stat_data['人物关系列表']) : stat_data['人物关系列表']; } catch { dict = {}; }
          if (!dict || typeof dict !== 'object' || Array.isArray(dict)) dict = {};
          dict[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(relObj) : relObj;
          stat_data['人物关系列表'] = wasStringContainer ? JSON.stringify(dict) : dict;
        } else {
          const wrap = Array.isArray(stat_data['人物关系列表']) ? stat_data['人物关系列表'] : [[]];
          const list = Array.isArray(wrap[0]) ? wrap[0] : [];
          list[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(relObj) : relObj;
          stat_data['人物关系列表'] = [list];
        }

        const updates = [{ message_id: currentId, data: currentMvuState }];
        if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
        await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });
      } catch (e) {
        console.warn('[归墟] 回写四维上限失败:', e);
      }
    },

    // 自动修复物品的type字段
    _fixItemType(item) {
      const h = window.GuixuHelpers;
      const currentType = h.SafeGetValue(item, 'type', null);

      // 如果没有type字段或type为"其他"，则自动分类
      if (!currentType || currentType === '其他') {
        const correctType = this._getItemCategory(item);
        item.type = correctType;
      }

      return item;
    },

    // 批量修复玩家背包中的物品type字段
    async _fixPlayerInventoryTypes() {
      try {
        const h = window.GuixuHelpers;
        const currentId = window.GuixuAPI.getCurrentMessageId();
        const messages = await window.GuixuAPI.getChatMessages(currentId);
        if (!messages || !messages[0]) return false;

        const currentMvuState = messages[0].data || {};
        currentMvuState.stat_data = currentMvuState.stat_data || {};
        const stat_data = currentMvuState.stat_data;

        const inventoryLists = ['功法列表', '武器列表', '防具列表', '饰品列表', '法宝列表', '丹药列表', '其他列表'];
        let hasChanges = false;

        inventoryLists.forEach(listKey => {
          const list = stat_data[listKey];
          if (Array.isArray(list) && Array.isArray(list[0])) {
            const items = list[0];
            for (let i = 0; i < items.length; i++) {
              const rawItem = items[i];
              if (!rawItem) continue;

              try {
                let item = typeof rawItem === 'string' ? JSON.parse(rawItem) : rawItem;
                const originalType = h.SafeGetValue(item, 'type', null);

                // 修复type字段
                item = this._fixItemType(item);
                const newType = item.type;

                if (originalType !== newType) {
                  // 将修改后的物品写回
                  items[i] = typeof rawItem === 'string' ? JSON.stringify(item) : item;
                  hasChanges = true;
                  console.log(`[归墟] 修复物品分类：${h.SafeGetValue(item, 'name', '未知')} ${originalType || '无'} -> ${newType}`);
                }
              } catch (e) {
                console.warn('[归墟] 修复物品type字段时出错:', e, rawItem);
              }
            }
          }
        });

        // 如果有变更则保存
        if (hasChanges) {
          const updates = [{ message_id: currentId, data: currentMvuState }];
          if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
          await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });
          return true;
        }

        return false;
      } catch (error) {
        console.error('[归墟] 批量修复玩家物品type字段失败:', error);
        return false;
      }
    },

    // 实时刷新所有相关UI界面
    async _refreshAllRelatedUI() {
      try {
        // 刷新主界面数据（装备、属性等）
        if (window.GuixuMain?.updateDynamicData) {
          window.GuixuMain.updateDynamicData();
        }

        // 刷新背包界面（如果已打开）
        const inventoryModal = document.getElementById('inventory-modal');
        if (inventoryModal && inventoryModal.style.display !== 'none') {
          if (window.InventoryComponent?.show) {
            setTimeout(() => window.InventoryComponent.show(), 100);
          }
        }

        // 刷新人物关系界面本身（如果已打开）
        const relationshipsModal = document.getElementById('relationships-modal');
        if (relationshipsModal && relationshipsModal.style.display !== 'none') {
          setTimeout(() => this.show(), 100);
        }

        console.log('[归墟] 已刷新所有相关UI界面');
      } catch (error) {
        console.error('[归墟] 刷新UI界面时出错:', error);
      }
    },

    // 批量修复NPC物品的type字段
    async _fixNpcInventoryTypes() {
      try {
        const h = window.GuixuHelpers;
        const currentId = window.GuixuAPI.getCurrentMessageId();
        const messages = await window.GuixuAPI.getChatMessages(currentId);
        if (!messages || !messages[0]) return false;

        const currentMvuState = messages[0].data || {};
        currentMvuState.stat_data = currentMvuState.stat_data || {};
        const stat_data = currentMvuState.stat_data;

        const relationshipList = stat_data['人物关系列表'];
        if (!relationshipList || !Array.isArray(relationshipList[0])) return false;

        let hasChanges = false;
        const relations = relationshipList[0];

        for (let i = 0; i < relations.length; i++) {
          const rawRel = relations[i];
          if (!rawRel) continue;

          try {
            let rel = typeof rawRel === 'string' ? JSON.parse(rawRel) : rawRel;

            // 检查NPC的物品列表
            if (Array.isArray(rel.物品列表)) {
              let npcItemsChanged = false;

              for (let j = 0; j < rel.物品列表.length; j++) {
                const rawItem = rel.物品列表[j];
                if (!rawItem) continue;

                try {
                  let item = typeof rawItem === 'string' ? JSON.parse(rawItem) : rawItem;
                  const originalType = h.SafeGetValue(item, 'type', null);

                  // 修复type字段
                  item = this._fixItemType(item);
                  const newType = item.type;

                  if (originalType !== newType) {
                    rel.物品列表[j] = typeof rawItem === 'string' ? JSON.stringify(item) : item;
                    npcItemsChanged = true;
                    console.log(`[归墟] 修复NPC ${h.SafeGetValue(rel, 'name', '未知')} 物品分类：${h.SafeGetValue(item, 'name', '未知')} ${originalType || '无'} -> ${newType}`);
                  }
                } catch (e) {
                  console.warn('[归墟] 修复NPC物品type字段时出错:', e, rawItem);
                }
              }

              if (npcItemsChanged) {
                relations[i] = typeof rawRel === 'string' ? JSON.stringify(rel) : rel;
                hasChanges = true;
              }
            }
          } catch (e) {
            console.warn('[归墟] 修复NPC关系数据时出错:', e, rawRel);
          }
        }

        // 如果有变更则保存
        if (hasChanges) {
          const updates = [{ message_id: currentId, data: currentMvuState }];
          if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
          await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });
          return true;
        }

        return false;
      } catch (error) {
        console.error('[归墟] 批量修复NPC物品type字段失败:', error);
        return false;
      }
    },

    // 启动批量修复程序
    async _startBatchFix() {
      try {
        window.GuixuHelpers.showTemporaryMessage('开始批量修复物品分类...');

        const playerFixed = await this._fixPlayerInventoryTypes();
        const npcFixed = await this._fixNpcInventoryTypes();

        if (playerFixed || npcFixed) {
          window.GuixuHelpers.showTemporaryMessage('物品分类修复完成！请刷新界面查看效果。');
          // 刷新相关界面
          if (window.InventoryComponent && typeof window.InventoryComponent.show === 'function') {
            setTimeout(() => window.InventoryComponent.show(), 1000);
          }
        } else {
          window.GuixuHelpers.showTemporaryMessage('物品分类检查完成，无需修复。');
        }
      } catch (error) {
        console.error('[归墟] 批量修复过程出错:', error);
        window.GuixuHelpers.showTemporaryMessage('修复过程出错，请查看控制台日志。');
      }
    },

    // 将交易结果写回 MVU：扣除玩家灵石、移除/减少对方物品、将物品加入玩家对应分类，并增加对方灵石
    async _applyTradeTransaction(rel, item, offer, purchaseQuantity = 1) {
      const _ = window.GuixuAPI?.lodash || window._ || {
        get: (obj, path, def) => {
          try {
            const val = path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
            return val === undefined ? def : val;
          } catch {
            return def;
          }
        },
        set: (obj, path, value) => {
          try {
            const keys = path.split('.');
            let o = obj;
            while (keys.length > 1) {
              const k = keys.shift();
              if (!o[k] || typeof o[k] !== 'object') o[k] = {};
              o = o[k];
            }
            o[keys[0]] = value;
          } catch { }
          return obj;
        },
      };
      const h = window.GuixuHelpers;
      const currentId = window.GuixuAPI.getCurrentMessageId();
      const messages = await window.GuixuAPI.getChatMessages(currentId);
      if (!messages || !messages[0]) throw new Error('无法读取当前聊天数据');

      const currentMvuState = messages[0].data || {};
      currentMvuState.stat_data = currentMvuState.stat_data || {};
      const stat_data = currentMvuState.stat_data;

      // 1) 扣玩家灵石
      const myStones = Number(h.SafeGetValue(stat_data, '灵石', 0)) || 0;
      if (offer > myStones) throw new Error('余额不足');
      _.set(stat_data, '灵石', myStones - offer);

      // 2) 增对方灵石 + 减少/移除对方物品
      const container = stat_data['人物关系列表'];
      const relId = h.SafeGetValue(rel, 'id', null);
      const relName = h.SafeGetValue(rel, 'name', null);
      let relObj, originalRelEntry, containerType = 'array', matchKeyOrIdx = -1;
      const __loc = RelationshipsComponent._locateNpcInState(stat_data, rel);
      if (__loc) {
        containerType = __loc.containerType;
        matchKeyOrIdx = __loc.matchKeyOrIdx;
        relObj = __loc.relObj;
        originalRelEntry = __loc.originalRelEntry;
      }

      if (!__loc && container && typeof container === 'object' && container.$meta && container.$meta.extensible === true) {
        containerType = 'object';
        const entries = Object.entries(container).filter(([k]) => k !== '$meta');
        const relKey = h.SafeGetValue(rel, '__key', null);
        const found = entries.findIndex(([k, v]) => {
          try {
            // 新MVU对象字典：优先以字典键匹配（__key 或 name == 键名）
            if (relKey && String(k) === String(relKey)) return true;
            const obj = typeof v === 'string' ? JSON.parse(v) : v;
            if (relId != null) return h.SafeGetValue(obj, 'id', null) === relId;
            const objName = h.SafeGetValue(obj, 'name', null);
            if ((objName == null || objName === 'N/A' || objName === '') && relName && String(k) === String(relName)) return true;
            return objName === relName;
          } catch { return false; }
        });
        if (found === -1) throw new Error('在人物关系列表中未找到该角色');
        const [mk, ov] = entries[found];
        matchKeyOrIdx = mk;
        originalRelEntry = ov;
        relObj = (typeof ov === 'string') ? JSON.parse(ov) : (ov || {});
      } else if (!__loc) {
        const list = (stat_data?.['人物关系列表']?.[0]) || []
        if (!Array.isArray(list)) throw new Error('人物关系列表结构异常');
        const idx = list.findIndex(entry => {
          try {
            const obj = typeof entry === 'string' ? JSON.parse(entry) : entry;
            if (relId != null) return h.SafeGetValue(obj, 'id', null) === relId;
            return h.SafeGetValue(obj, 'name', null) === relName;
          } catch { return false; }
        });
        if (idx === -1) throw new Error('在人物关系列表中未找到该角色');
        matchKeyOrIdx = idx;
        originalRelEntry = list[idx];
        relObj = (typeof originalRelEntry === 'string') ? JSON.parse(originalRelEntry) : (originalRelEntry || {});
      }

      const npcStones = Number(h.SafeGetValue(relObj, '灵石', 0)) || 0;
      relObj['灵石'] = npcStones + offer;

      const itemId = h.SafeGetValue(item, 'id', h.SafeGetValue(item, 'uid', ''));
      const useBag = relObj && typeof relObj['储物袋'] === 'object' && relObj['储物袋'] !== null;
      const npcItems = useBag ? RelationshipsComponent._readNpcStorageAsArray(relObj) : (Array.isArray(relObj.物品列表) ? relObj.物品列表 : []);
      // 在 NPC 物品列表中定位目标条目（兼容字符串化条目）
      let itIndex = -1;
      try {
        for (let i = 0; i < npcItems.length; i++) {
          const entry = npcItems[i];
          if (!entry) continue;
          let parsed;
          try { parsed = typeof entry === 'string' ? JSON.parse(entry) : entry; } catch { parsed = entry; }
          const eid = h.SafeGetValue(parsed, 'id', h.SafeGetValue(parsed, 'uid', ''));
          const ename = h.SafeGetValue(parsed, 'name', null);
          if ((eid && String(eid) === String(itemId)) || (ename && String(ename) === String(h.SafeGetValue(item, 'name', '')))) {
            itIndex = i;
            break;
          }
        }
      } catch (e) { /* ignore */ }
      if (itIndex === -1) throw new Error('对方物品不存在');

      // 拷贝给玩家
      const bought = JSON.parse(JSON.stringify(npcItems[itIndex]));
      const q = Number(h.SafeGetValue(npcItems[itIndex], 'quantity', 1)) || 1;
      const buyQ = Number(purchaseQuantity || 1) || 1;
      if (q > buyQ) {
        npcItems[itIndex].quantity = q - buyQ;
      } else {
        npcItems.splice(itIndex, 1);
      }
      if (useBag) {
        const newBag = {};
        npcItems.forEach(entry => {
          let it = entry;
          try { it = (typeof entry === 'string') ? JSON.parse(entry) : entry; } catch (_) { }
          const k = window.GuixuHelpers.SafeGetValue(it, 'name', window.GuixuHelpers.SafeGetValue(it, 'id', '物品'));
          newBag[k] = it;
        });
        relObj['储物袋'] = newBag;
      } else {
        relObj.物品列表 = npcItems;
      }

      // 将更新后的 relObj 写回（保持与原类型一致）
      // 统一安全写回（兼容：对象字典原容器为字符串/对象；旧数组包装）
      if (containerType === 'object') {
        const wasStringContainer = (typeof stat_data['人物关系列表'] === 'string');
        let dict;
        try {
          dict = wasStringContainer ? JSON.parse(stat_data['人物关系列表']) : stat_data['人物关系列表'];
        } catch (_) { dict = {}; }
        if (!dict || typeof dict !== 'object' || Array.isArray(dict)) dict = {};
        const v = (typeof originalRelEntry === 'string') ? JSON.stringify(relObj) : relObj;
        dict[matchKeyOrIdx] = v;
        stat_data['人物关系列表'] = wasStringContainer ? JSON.stringify(dict) : dict;
      } else {
        // 旧结构 [ [ ... ] ]：保持包装层
        const wrap = Array.isArray(stat_data['人物关系列表']) ? stat_data['人物关系列表'] : [[]];
        const list = Array.isArray(wrap[0]) ? wrap[0] : [];
        list[matchKeyOrIdx] = (typeof originalRelEntry === 'string') ? JSON.stringify(relObj) : relObj;
        stat_data['人物关系列表'] = [list];
      }

      // 3) 加入玩家对应分类列表（使用统一的分类逻辑并自动修复type字段）
      // 新MVU写入优先：对象字典 { $meta:{ extensible:true }, "物品名": { ... } }；兼容旧 [ [ ... ] ] 结构

      // 自动修复购买物品的type字段（防护机制）
      const fixedBought = this._fixItemType(JSON.parse(JSON.stringify(bought)));

      // 使用修复后的type字段进行分类
      const mapTypeToListKey = (typ) => {
        switch (String(typ || '其他')) {
          case '功法': return '功法列表';
          case '武器': return '武器列表';
          case '防具': return '防具列表';
          case '饰品': return '饰品列表';
          case '法宝': return '法宝列表';
          case '丹药': return '丹药列表';
          case '材料': return '其他列表'; // 材料暂时放入其他列表
          case '其他':
          default: return '其他列表';
        }
      };

      const itemType = fixedBought.type;
      const userListKey = mapTypeToListKey(itemType);

      const normalize = (v) => {
        if (v === null || v === undefined) return '';
        try { return String(v).trim().toLowerCase(); } catch { return ''; }
      };
      const bId = normalize(h.SafeGetValue(bought, 'id', h.SafeGetValue(bought, 'uid', '')));
      const bName = normalize(h.SafeGetValue(bought, 'name', null));

      // 统一转换为对象字典容器后写入玩家背包（兼容旧数组包装）
      const ensureObjectDict = (lv) => {
        if (Array.isArray(lv)) {
          const arr = lv[0] || [];
          const obj = { $meta: { extensible: true } };
          const used = new Set();
          arr.forEach((i, idx) => {
            let v = i;
            if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) {} }
            if (!v || typeof v !== 'object') return;
            const nm = h.SafeGetValue(v, 'name', null);
            const idv = h.SafeGetValue(v, 'id', h.SafeGetValue(v, 'uid', null));
            let key = (nm && nm !== 'N/A') ? String(nm) : (idv != null ? String(idv) : `条目${idx+1}`);
            while (Object.prototype.hasOwnProperty.call(obj, key) || used.has(key)) key = `${key}_`;
            used.add(key);
            obj[key] = v;
          });
          return obj;
        }
        if (!lv || typeof lv !== 'object') return { $meta: { extensible: true } };
        if (!lv.$meta) { try { lv.$meta = { extensible: true }; } catch (_) {} }
        return lv;
      };

      const dictContainer = ensureObjectDict(stat_data[userListKey]);
      stat_data[userListKey] = dictContainer;

      // 合并数量或新增
      let matchedKey = null, originalVal, parsedObj = null;
      for (const [k, v] of Object.entries(dictContainer)) {
        if (k === '$meta') continue;
        let obj = v;
        try { obj = (typeof v === 'string') ? JSON.parse(v) : v; } catch { obj = v; }
        const cid = normalize(h.SafeGetValue(obj, 'id', h.SafeGetValue(obj, 'uid', '')));
        const cname = normalize(h.SafeGetValue(obj, 'name', null));
        if ((bId && cid && cid === bId) || (bName && cname && cname === bName)) {
          matchedKey = k; originalVal = v; parsedObj = obj; break;
        }
      }
      if (matchedKey) {
        const oldQ = Number(h.SafeGetValue(parsedObj, 'quantity', 1)) || 1;
        parsedObj.quantity = oldQ + purchaseQuantity;
        dictContainer[matchedKey] = (typeof originalVal === 'string') ? JSON.stringify(parsedObj) : parsedObj;
      } else {
        let keyName = h.SafeGetValue(fixedBought, 'name', h.SafeGetValue(fixedBought, 'id', '物品'));
        while (Object.prototype.hasOwnProperty.call(dictContainer, keyName)) keyName = `${keyName}_`;
        const newObj = JSON.parse(JSON.stringify(fixedBought));
        newObj.quantity = purchaseQuantity;
        dictContainer[keyName] = newObj;
      }

      // 4) 保存（当前楼层 + 0 楼），带错误捕获与调试输出
      const updates = [{ message_id: currentId, data: currentMvuState }];
      if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
      try {
        await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });
      } catch (err) {
        console.error('[归墟] setChatMessages 失败（购买操作）：', err, '准备写入：', updates);
        try { window.GuixuHelpers.showTemporaryMessage('保存数据失败：' + (err && err.message ? err.message : '未知错误')); } catch (e) { }
        throw err;
      }
    },
    _isMarked(name) {
      try {
        const k = 'guixu_rel_marked_names';
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        return Array.isArray(arr) && arr.includes(String(name));
      } catch (_) { return false; }
    },
    _toggleMarked(name) {
      try {
        const k = 'guixu_rel_marked_names';
        let arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (!Array.isArray(arr)) arr = [];
        const s = String(name);
        if (arr.includes(s)) arr = arr.filter(n => n !== s);
        else arr.push(s);
        localStorage.setItem(k, JSON.stringify(arr));
        return arr.includes(s);
      } catch (_) { return false; }
    },
    _getExtractSettings() {
      try {
        const def = { autoExtract: false, threshold: 10, autoDeleteAfterExtract: true };
        const raw = JSON.parse(localStorage.getItem('guixu_rel_extract_settings') || 'null');
        return Object.assign({}, def, raw || {});
      } catch (_) { return { autoExtract: false, threshold: 10, autoDeleteAfterExtract: true }; }
    },
    _saveExtractSettings(s) {
      try { localStorage.setItem('guixu_rel_extract_settings', JSON.stringify(s || this._getExtractSettings())); } catch (_) { }
    },
    _initRelSettingsControls(relationships) {
      try {
        const s = this._getExtractSettings();
        const toggle = document.getElementById('rel-auto-extract-toggle');
        const th = document.getElementById('rel-auto-extract-threshold');
        const del = document.getElementById('rel-auto-delete-toggle');
        const autoToggleLore = document.getElementById('rel-auto-toggle-lorebook');
        if (toggle) toggle.checked = !!s.autoExtract;
        if (th) th.value = String(parseInt(s.threshold, 10) || 10);
        if (del) del.checked = !!s.autoDeleteAfterExtract;
        // 同步“自动开关角色条目”与全局状态
        const globalEnabled = !!(window.GuixuState?.getState?.().isAutoToggleLorebookEnabled);
        if (autoToggleLore) autoToggleLore.checked = globalEnabled;

        toggle?.addEventListener('change', () => { const ss = this._getExtractSettings(); ss.autoExtract = !!toggle.checked; this._saveExtractSettings(ss); if (ss.autoExtract) this._maybeAutoExtract(relationships); });
        th?.addEventListener('change', () => { const v = parseInt(th.value, 10); const ss = this._getExtractSettings(); ss.threshold = Number.isFinite(v) && v > 0 ? v : ss.threshold; th.value = String(ss.threshold); this._saveExtractSettings(ss); });
        del?.addEventListener('change', () => { const ss = this._getExtractSettings(); ss.autoDeleteAfterExtract = !!del.checked; this._saveExtractSettings(ss); });
        autoToggleLore?.addEventListener('change', () => {
          const enabled = !!autoToggleLore.checked;
          window.GuixuState?.update?.('isAutoToggleLorebookEnabled', enabled);
          // 若主界面存在总开关，保持同步
          const topCb = document.getElementById('auto-toggle-lorebook-checkbox');
          if (topCb) topCb.checked = enabled;
        });
        const btnClear = document.getElementById('rel-clear-character-entries');
        btnClear?.addEventListener('click', async () => {
          try {
            const confirmed = await new Promise(resolve =>
              window.GuixuMain?.showCustomConfirm
                ? window.GuixuMain.showCustomConfirm(
                  '确定要清空角色目录中所有“角色:*”的世界书条目吗？此操作不可逆。',
                  () => resolve(true),
                  () => resolve(false)
                )
                : resolve(confirm('确定要清空角色目录（世界书）吗？此操作不可逆。'))
            );
            if (!confirmed) {
              window.GuixuHelpers?.showTemporaryMessage?.('已取消操作');
              return;
            }
            await this._clearAllCharacterEntries();
            window.GuixuHelpers?.showTemporaryMessage?.('已清空角色目录条目');
          } catch (e) {
            window.GuixuHelpers?.showTemporaryMessage?.('清空失败');
          }
        });
      } catch (e) { console.warn('[归墟] 初始化人物关系设置控件失败:', e); }
    },
    async _maybeAutoExtract(relationships) {
      try {
        const s = this._getExtractSettings();
        if (!s.autoExtract) return;
        const list = Array.isArray(relationships) ? relationships : [];
        if (list.length <= (parseInt(s.threshold, 10) || 10)) return;

        const markedSet = new Set(JSON.parse(localStorage.getItem('guixu_rel_marked_names') || '[]'));
        const toDelete = [];
        const processed = [];

        for (const raw of list) {
          if (!raw) continue;
          let rel; try { rel = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch { rel = raw; }
          const name = window.GuixuHelpers.SafeGetValue(rel, 'name', null);
          if (!name || markedSet.has(String(name))) continue;
          try {
            await this._extractCharacterToLorebook(rel);
            processed.push(name);
            if (s.autoDeleteAfterExtract) {
              toDelete.push(rel);
            }
          } catch (_) { }
        }

        if (s.autoDeleteAfterExtract && toDelete.length > 0) {
          // 仅提示一次
          const confirmMsg = `将删除 ${toDelete.length} 条关系记录（已提取到世界书）。是否继续？此操作不可逆。`;
          const confirmed = await new Promise(resolve =>
            window.GuixuMain.showCustomConfirm(confirmMsg, () => resolve(true), () => resolve(false))
          );
          if (confirmed) {
            for (const rel of toDelete) {
              try { await this.deleteRelationship(rel, { silent: true }); } catch (_) { }
            }
          } else {
            window.GuixuHelpers.showTemporaryMessage('已取消自动删除，仅完成提取。');
          }
        }
      } catch (e) { console.warn('[归墟] 自动提取失败:', e); }
    },
    async _autoExtractFromStateIfNeeded() {
      try {
        const messages = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
        let stat_data = messages?.[0]?.data?.stat_data;
        if (window.GuixuMain && typeof window.GuixuMain._deepStripMeta === 'function') {
          stat_data = window.GuixuMain._deepStripMeta(stat_data);
        }
        let relationships = window.GuixuHelpers.readList(stat_data, '人物关系列表');
        await this._maybeAutoExtract(relationships);
      } catch (e) {
        console.warn('[归墟] 自动提取触发失败:', e);
      }
    },
    _buildCharacterEntryContent(rel) {
      try {
        const h = window.GuixuHelpers;
        const lines = [];
        const name = h.SafeGetValue(rel, 'name', '未知之人');
        const tier = h.SafeGetValue(rel, 'tier', '凡人');
        const level = h.SafeGetValue(rel, 'level', h.SafeGetValue(rel, '等级', ''));
        const relationship = RelationshipsComponent._toChineseRelationship(h.SafeGetValue(rel, 'relationship', 'NEUTRAL'));
const favor = h.SafeGetValue(rel, 'favorability', 0);
const desc = h.SafeGetValue(rel, 'description', h.SafeGetValue(rel, '描述', h.SafeGetValue(rel, '身份背景', '')));
const personality = h.SafeGetValue(rel, '性格', h.SafeGetValue(rel, 'personality', ''));
        const appearance = h.SafeGetValue(rel, '外貌', h.SafeGetValue(rel, 'appearance', ''));

        // 基本信息
        lines.push(`姓名|${name}`);
        lines.push(`关系|${relationship}`);
        lines.push(`修为|${tier}${level ? ' ' + level : ''}`);
        lines.push(`好感度|${favor}`);
        if (desc) lines.push(`描述|${desc}`);
        if (personality) lines.push(`性格|${personality}`);
        if (appearance) lines.push(`外貌|${appearance}`);

        // 基础工具
        const parseMaybeJson = (v) => {
          try {
            if (typeof v === 'string') {
              const s = v.trim();
              if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                try { return JSON.parse(s); } catch {
                  // 非严格 JSON 兜底
                  try { return (new Function('return (' + s + ')'))(); } catch { return v; }
                }
              }
            }
            return v;
          } catch { return v; }
        };
        const normalizeField = (v) => {
          try {
            if (Array.isArray(v) && v.length > 0) return parseMaybeJson(v[0]);
            return parseMaybeJson(v);
          } catch { return v; }
        };
        const toArray = (v) => {
          const n = normalizeField(v);
          const isMeta = (s) => false;
          if (Array.isArray(n)) return n.filter(x => x && !isMeta(x));
          if (typeof n === 'string') {
            return n.split(/[，,、\n]+/).map(s => s.trim()).filter(s => s && !isMeta(s));
          }
          return [];
        };
        // 统一的词条解析：不按逗号拆分，优先使用原始数组；字符串若为JSON数组则展开，否则整体作为一条
        const effectsList = (v) => {
          const clean = (s) => String(s).trim();
          const isMeta = (s) => false;
          let n = v;
          if (typeof n === 'string') {
            const s = clean(n);
            if (!s) return [];
            if (s.startsWith('[') && s.endsWith(']')) {
              try {
                const arr = JSON.parse(s);
                n = Array.isArray(arr) ? arr : [s];
              } catch { n = [s]; }
            } else {
              n = [s];
            }
          }
          if (Array.isArray(n)) {
            return n
              .filter(x => x && !isMeta(x))
              .map(x => typeof x === 'string' ? clean(x) : (h.SafeGetValue(x, 'name', h.SafeGetValue(x, '名称', clean(JSON.stringify(x))))))
              .filter(Boolean);
          }
          if (n && typeof n === 'object') {
            // 单对象作为一条
            return [clean(h.SafeGetValue(n, 'name', h.SafeGetValue(n, '名称', JSON.stringify(n))))];
          }
          return [];
        };
        const safeList = (arr) => Array.isArray(arr) ? arr.filter(Boolean) : [];

        // 四维（当前 / 加成后）优先适配新字典键位
        const keys = ['法力', '神海', '道心', '空速'];
        const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
        const pickObj = (raw) => {
          const n = normalizeField(raw ?? {});
          return (n && typeof n === 'object' && !Array.isArray(n)) ? n : {};
        };
        // 计算上限：优先使用现成“四维上限”；若缺失，则基于“基础四维 + 装备/灵根/天赋加成”推导
        let totalAttrs = (() => {
          const v = rel?.['属性上限'] ?? rel?.['四维上限'] ?? rel?.['四维属性'];
          return pickObj(v);
        })();
        const curAttrs = (() => {
          const v = rel?.['当前属性'] ?? rel?.['当前四维'] ?? rel?.['当前四维属性'];
          return pickObj(v);
        })();

        if (!Object.keys(totalAttrs).length) {
          try {
            const ATTR_KEYS_CN = ['法力', '神海', '道心', '空速'];
            const parsePercent = (v) => {
              if (v === null || v === undefined) return 0;
              const s = String(v).trim();
              if (!s) return 0;
              if (s.endsWith('%')) {
                const n = parseFloat(s.slice(0, -1));
                return Number.isFinite(n) ? n / 100 : 0;
              }
              const n = parseFloat(s);
              return Number.isFinite(n) && n > 1.5 ? n / 100 : (Number.isFinite(n) ? n : 0);
            };
            const extractBonuses = (item) => {
              const flat = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
              const percent = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
              if (!item || typeof item !== 'object') return { flat, percent };
              const ab = pickObj(item['属性加成'] ?? item['attributes_bonus'] ?? {});
              const pb = pickObj(item['百分比加成'] ?? item['percent_bonus'] ?? {});
              Object.entries(ab).forEach(([k, v]) => { if (ATTR_KEYS_CN.includes(k)) { const n = parseInt(String(v), 10); if (Number.isFinite(n)) flat[k] += n; } });
              Object.entries(pb).forEach(([k, v]) => { if (ATTR_KEYS_CN.includes(k)) { const p = parsePercent(v); if (Number.isFinite(p)) percent[k] += p; } });
              return { flat, percent };
            };
            const merge = (a, b) => { ATTR_KEYS_CN.forEach(k => a[k] = (a[k] || 0) + (b[k] || 0)); };
            const base = pickObj(rel?.['基础四维'] ?? rel?.['基础四维属性']);
            const totalFlat = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
            const totalPct = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));

            // 来源：装备槽 + 灵根 + 天赋
          const slotDefs = [
            '主修功法', '辅修心法', '武器', '防具', '饰品', '法宝'
          ];
          slotDefs.forEach(key => {
            const it = window.GuixuHelpers?.readEquipped?.(rel, key);
            if (it && typeof it === 'object') {
              const { flat, percent } = extractBonuses(it);
              merge(totalFlat, flat); merge(totalPct, percent);
            }
          });
            // 灵根
            try {
              const inhRaw = rel?.['inherent_abilities'] ?? rel?.['内在能力'] ?? {};
              const inh = (inhRaw && typeof inhRaw === 'object') ? inhRaw : {};
              let lg = inh['灵根'] ?? inh['灵根列表'] ?? {};
              if (Array.isArray(lg) && lg.length > 0) lg = pickObj(lg[0]);
              lg = pickObj(lg);
              if (!Object.keys(lg).length) {
                const topLg = window.GuixuHelpers?.readList?.(rel, '灵根列表') || [];
                if (Array.isArray(topLg) && topLg.length) {
                  const first = topLg.find(x => x);
                  if (first) { try { lg = typeof first === 'string' ? JSON.parse(first) : first; } catch { lg = first; } }
                }
              }
              if (lg && typeof lg === 'object') {
                const { flat, percent } = extractBonuses(lg);
                merge(totalFlat, flat); merge(totalPct, percent);
              }
            } catch (_) {}
            // 天赋
            try {
              const tRaw = (rel?.['inherent_abilities'] ?? rel?.['内在能力'] ?? {})['天赋'] ?? [];
              const talents = Array.isArray(tRaw) ? tRaw : (Array.isArray(pickObj(tRaw)) ? pickObj(tRaw) : []);
              talents.forEach(t => {
                const obj = typeof t === 'string' ? (function(){ try{return JSON.parse(t);}catch{return null;} })() : t;
                if (obj && typeof obj === 'object') {
                  const { flat, percent } = extractBonuses(obj);
                  merge(totalFlat, flat); merge(totalPct, percent);
                }
              });
            } catch (_) {}

            totalAttrs = Object.fromEntries(ATTR_KEYS_CN.map(k => {
              const baseVal = Number(base?.[k] || 0);
              const flat = Number(totalFlat[k] || 0);
              const pct = Number(totalPct[k] || 0);
              return [k, Math.max(0, Math.floor((baseVal + flat) * (1 + pct)))];
            }));
          } catch (_) { /* ignore */ }
        }
        // 修正：如果四维上限疑似为基础值，则按“基础+装备/灵根/天赋加成”推导上限并与现值取最大
        try {
          const ATTR_KEYS_CN = ['法力','神海','道心','空速'];
          const baseCheck = pickObj(rel?.['基础属性'] ?? rel?.['基础四维'] ?? rel?.['基础四维属性']);
          const needFix = ATTR_KEYS_CN.some(k => toNum(totalAttrs[k]) <= toNum(baseCheck[k]));
          if (needFix) {
            const parsePercent = (v) => {
              if (v === null || v === undefined) return 0;
              const s = String(v).trim();
              if (!s) return 0;
              if (s.endsWith('%')) { const n = parseFloat(s.slice(0,-1)); return Number.isFinite(n) ? n/100 : 0; }
              const n = parseFloat(s);
              return Number.isFinite(n) && n > 1.5 ? n/100 : (Number.isFinite(n) ? n : 0);
            };
            const extractBonuses = (item) => {
              const flat = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
              const percent = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
              if (!item || typeof item !== 'object') return { flat, percent };
              const ab = pickObj(item['属性加成'] ?? item['attributes_bonus'] ?? {});
              const pb = pickObj(item['百分比加成'] ?? item['percent_bonus'] ?? {});
              Object.entries(ab).forEach(([k,v]) => { if (ATTR_KEYS_CN.includes(k)) { const n = parseInt(String(v),10); if (Number.isFinite(n)) flat[k] += n; }});
              Object.entries(pb).forEach(([k,v]) => { if (ATTR_KEYS_CN.includes(k)) { const p = parsePercent(v); if (Number.isFinite(p)) percent[k] += p; }});
              return { flat, percent };
            };
            const merge = (a,b) => { ATTR_KEYS_CN.forEach(k => a[k] = (a[k] || 0) + (b[k] || 0)); };
            const totalFlat = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
            const totalPct = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, 0]));
            // 装备
            ['主修功法','辅修心法','武器','防具','饰品','法宝'].forEach(key => {
              const it = window.GuixuHelpers?.readEquipped?.(rel, key);
              if (it && typeof it === 'object') {
                const { flat, percent } = extractBonuses(it);
                merge(totalFlat, flat); merge(totalPct, percent);
              }
            });
            // 灵根
            try {
              const inhRaw = rel?.['inherent_abilities'] ?? rel?.['内在能力'] ?? {};
              const inh = (inhRaw && typeof inhRaw === 'object') ? inhRaw : {};
              let lg = inh['灵根'] ?? inh['灵根列表'] ?? {};
              if (Array.isArray(lg) && lg.length > 0) lg = pickObj(lg[0]);
              lg = pickObj(lg);
              if (!Object.keys(lg).length) {
                const topLg = window.GuixuHelpers?.readList?.(rel, '灵根列表') || [];
              if (Array.isArray(topLg) && topLg.length) {
                const first = topLg.find(x => x);
                if (first) { try { lg = typeof first === 'string' ? JSON.parse(first) : first; } catch { lg = first; } }
              }
              }
              if (lg && typeof lg === 'object') {
                const { flat, percent } = extractBonuses(lg);
                merge(totalFlat, flat); merge(totalPct, percent);
              }
            } catch (_) {}
            // 天赋
            try {
              const tRaw = (rel?.['inherent_abilities'] ?? rel?.['内在能力'] ?? {})['天赋'] ?? [];
              const talents = Array.isArray(tRaw) ? tRaw : (Array.isArray(pickObj(tRaw)) ? pickObj(tRaw) : []);
              talents.forEach(t => {
                const obj = typeof t === 'string' ? (function(){ try{return JSON.parse(t);}catch{return null;} })() : t;
                if (obj && typeof obj === 'object') {
                  const { flat, percent } = extractBonuses(obj);
                  merge(totalFlat, flat); merge(totalPct, percent);
                }
              });
            } catch (_) {}
            const derived = Object.fromEntries(ATTR_KEYS_CN.map(k => {
              const baseVal = toNum(baseCheck?.[k]);
              const flat = toNum(totalFlat[k]);
              const pct = Number(totalPct[k] || 0);
              return [k, Math.max(0, Math.floor((baseVal + flat) * (1 + pct)))];
            }));
            totalAttrs = Object.fromEntries(ATTR_KEYS_CN.map(k => [k, Math.max(toNum(totalAttrs[k]), toNum(derived[k]))]));
          }
        } catch (_) {}
        const fourDimParts = keys.map(k => `${k}:${toNum(curAttrs[k])}/${toNum(totalAttrs[k])}`);
        if (fourDimParts.some(p => /:/.test(p))) {
          // 采用新命名：属性（当前/上限）
          lines.push(`属性（当前/上限）|${fourDimParts.join('；')}`);
        }
        // 基础四维（优先新键，其次旧键，最后以散列基础值兜底）
        try {
          let base = pickObj(rel?.['基础属性'] ?? rel?.['基础四维'] ?? rel?.['基础四维属性']);
          if (!Object.keys(base).length) {
            // 兜底：从散列基础键合成
            const map = {
              '法力': ['基础法力','base_mana'],
              '神海': ['基础神海','base_shenhai'],
              '道心': ['基础道心','base_daoxin'],
              '空速': ['基础空速','base_kongsu']
            };
            const b = {};
            Object.keys(map).forEach(k => {
              for (const key of map[k]) {
                const val = rel?.[key];
                const n = Number(val);
                if (Number.isFinite(n)) { b[k] = n; break; }
              }
            });
            base = b;
          }
          const kvBase = keys
            .filter(k => base[k] != null && String(base[k]).trim() !== '')
            .map(k => `${k}:${toNum(base[k])}`)
            .join('；');
          // 采用新命名：基础属性
          if (kvBase) lines.push(`基础属性|${kvBase}`);
        } catch (_) { }

        // 装备槽（提取到世界书：主修/辅修/武器/防具/饰品/法宝，含明细）
        try {
          const slotDefsExtract = [
            { key: '主修功法', label: '主修功法' },
            { key: '辅修心法', label: '辅修心法' },
            { key: '武器', label: '武器' },
            { key: '防具', label: '防具' },
            { key: '饰品', label: '饰品' },
            { key: '法宝', label: '法宝' }
          ];
          const parts = [];
          slotDefsExtract.forEach(def => {
            const it = window.GuixuHelpers.readEquipped(rel, def.key);
            if (it && typeof it === 'object') {
              const n = h.SafeGetValue(it, 'name', h.SafeGetValue(it, '名称', def.label));
              const t = h.SafeGetValue(it, 'tier', h.SafeGetValue(it, '品阶', '凡品'));
              const label = def.label;
              parts.push(`${label}:【${t}】${n}`);
              const ab = normalizeField(it['attributes_bonus'] ?? it['属性加成'] ?? {}) || {};
              const pb = normalizeField(it['百分比加成'] ?? it['percent_bonus'] ?? {}) || {};
              const se = (() => {
                const v = normalizeField(it['special_effects'] ?? it['词条效果'] ?? it['词条'] ?? []);
                if (Array.isArray(v)) return v.filter(x => x);
                if (typeof v === 'string') return v.split(/[，,、\n]+/).map(s => s.trim()).filter(Boolean);
                return [];
              })();
              const kvAb = Object.entries(ab || {}).filter(([k, v]) => v != null && String(v).trim() !== '').map(([k, v]) => `${k}:${v}`).join('；');
              const kvPb = Object.entries(pb || {}).filter(([k, v]) => v != null && String(v).trim() !== '').map(([k, v]) => `${k}:${v}`).join('；');
              if (kvAb) lines.push(`装备:${label}-属性加成|${kvAb}`);
              if (kvPb) lines.push(`装备:${label}-百分比加成|${kvPb}`);
              if (se.length) lines.push(`装备:${label}-词条|${se.join('；')}`);
            }
          });
          if (parts.length) {
            lines.push(`装备|${parts.join('；')}`);
          }
        } catch (_) { }
        // 取“内在能力”容器（灵根/功法/天赋）
        const inhRaw = (rel?.['inherent_abilities'] ?? rel?.['内在能力'] ?? {});
        const inh = (() => {
          const n = normalizeField(inhRaw) ?? {};
          return (n && typeof n === 'object' && !Array.isArray(n)) ? n : {};
        })();

        // 灵根
        let linggen = {};
        try {
          const lgRaw = inh['灵根'] || inh['灵根列表'] || inh['linggen'] || inh['灵根'] || {};
          if (Array.isArray(lgRaw) && lgRaw.length > 0) linggen = parseMaybeJson(lgRaw[0]) || {};
          else linggen = normalizeField(lgRaw) || {};
          // 新MVU对象字典回退：若内在容器缺失/为空，从顶层“灵根列表”读取第一条
          if (!linggen || typeof linggen !== 'object' || Object.keys(linggen).length === 0) {
            const topLinggens = (window.GuixuHelpers && typeof window.GuixuHelpers.readList === 'function')
              ? window.GuixuHelpers.readList(rel, '灵根列表')
              : [];
            if (Array.isArray(topLinggens) && topLinggens.length > 0) {
              const first = topLinggens.find(x => x);
              if (first) {
                try { linggen = typeof first === 'string' ? JSON.parse(first) : first; } catch { linggen = first; }
              }
            }
          }
        } catch { }
        if (linggen && (linggen.名称 || linggen.name)) {
          const lgName = linggen.名称 || linggen.name || '未知灵根';
          const lgTier = linggen.品阶 || linggen.tier || '凡品';
          const lgDesc = linggen.描述 || linggen.description || '';
          lines.push(`灵根|【${lgTier}】${lgName}${lgDesc ? ' - ' + lgDesc : ''}`);

          // 灵根属性加成/百分比加成/词条
          const lgAttrBonus = normalizeField(linggen['属性加成'] ?? linggen['attributes_bonus'] ?? {}) || {};
          const lgPercent = normalizeField(linggen['百分比加成'] ?? linggen['percent_bonus'] ?? {}) || {};
          const lgWords = effectsList(linggen['词条'] ?? linggen['词条效果'] ?? linggen['special_effects'] ?? []);
          if (lgAttrBonus && typeof lgAttrBonus === 'object' && Object.keys(lgAttrBonus).length) {
            const kv = Object.entries(lgAttrBonus).map(([k, v]) => `${k}:${v}`).join('；');
            lines.push(`灵根属性加成|${kv}`);
          }
          if (lgPercent && typeof lgPercent === 'object' && Object.keys(lgPercent).length) {
            const kv = Object.entries(lgPercent).map(([k, v]) => `${k}:${v}`).join('；');
            lines.push(`灵根百分比加成|${kv}`);
          }
          if (lgWords.length) {
            lines.push(`灵根词条|${lgWords.join('；')}`);
          }
        }

        // 功法/心法（功法列表）
        let gongfaList = [];
        try {
          const gfRaw = inh['功法'] || inh['gongfa'] || [];
          if (Array.isArray(gfRaw)) gongfaList = safeList(gfRaw).map(parseMaybeJson);
          else {
            const parsed = normalizeField(gfRaw);
            gongfaList = Array.isArray(parsed) ? safeList(parsed).map(parseMaybeJson) : (parsed ? [parsed] : []);
          }
        } catch { }

        // 天赋列表（合并内在容器与顶层“天赋列表”并去重）
        let talentList = [];
        try {
          const tRaw = inh['天赋'] || inh['talent'] || [];
          if (Array.isArray(tRaw)) talentList = safeList(tRaw).map(parseMaybeJson);
          else {
            const parsed = normalizeField(tRaw);
            talentList = Array.isArray(parsed) ? safeList(parsed).map(parseMaybeJson) : (parsed ? [parsed] : []);
          }
          // 合并顶层“天赋列表”
          const topTalents = (window.GuixuHelpers && typeof window.GuixuHelpers.readList === 'function')
            ? window.GuixuHelpers.readList(rel, '天赋列表')
            : [];
          const parsedTop = Array.isArray(topTalents)
            ? topTalents
              .filter(Boolean)
              .map(x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return x; } })
              .filter(Boolean)
            : [];
          const seen = new Set();
          const keyOf = (o) => {
            const id = window.GuixuHelpers.SafeGetValue(o, 'id', '');
            const nm = window.GuixuHelpers.SafeGetValue(o, 'name', '');
            return id && id !== 'N/A' ? `id:${id}` : `name:${nm}`;
          };
          const merged = [];
          [...talentList, ...parsedTop].forEach(o => {
            if (!o) return;
            const k = keyOf(o);
            if (!seen.has(k)) { seen.add(k); merged.push(o); }
          });
          talentList = merged;
        } catch { }
        if (talentList.length) {
          const tLines = talentList.map(it => {
            const n = h.SafeGetValue(it, 'name', h.SafeGetValue(it, '名称', '未知天赋'));
            const t = h.SafeGetValue(it, 'tier', h.SafeGetValue(it, '品阶', '凡品'));
            const d = h.SafeGetValue(it, 'description', h.SafeGetValue(it, '描述', ''));
            return `【${t}】${n}${d ? ' - ' + d : ''}`;
          });
          // 总览行
          lines.push(`天赋|${tLines.join('；')}`);
          // 明细行（属性加成/百分比加成/词条）
          talentList.forEach(it => {
            try {
              const n = h.SafeGetValue(it, 'name', h.SafeGetValue(it, '名称', '未知天赋'));
              const ab = normalizeField(it['attributes_bonus'] ?? it['属性加成'] ?? {}) || {};
              const pb = normalizeField(it['百分比加成'] ?? it['percent_bonus'] ?? {}) || {};
              // 词条：不按逗号拆分
              const specials = (() => {
                const v = normalizeField(it['special_effects'] ?? it['词条效果'] ?? it['词条'] ?? []);
                const clean = s => String(s).trim();
                if (Array.isArray(v)) return v.filter(Boolean).map(x => typeof x === 'string' ? clean(x) : clean(JSON.stringify(x)));
                if (typeof v === 'string') {
                  if ((v.trim().startsWith('[') && v.trim().endsWith(']'))) {
                    try { const arr = JSON.parse(v); return Array.isArray(arr) ? arr.map(clean).filter(Boolean) : [clean(v)]; } catch { return [clean(v)]; }
                  }
                  return [clean(v)];
                }
                return [];
              })();
              const kvAb = Object.entries(ab).filter(([k, v]) => v != null && String(v).trim() !== '').map(([k, v]) => `${k}:${v}`).join('；');
              const kvPb = Object.entries(pb).filter(([k, v]) => v != null && String(v).trim() !== '').map(([k, v]) => `${k}:${v}`).join('；');
              if (kvAb) lines.push(`天赋:${n}-属性加成|${kvAb}`);
              if (kvPb) lines.push(`天赋:${n}-百分比加成|${kvPb}`);
              if (specials.length) lines.push(`天赋:${n}-词条|${specials.join('；')}`);
            } catch (_) { }
          });
        }

        // 携带物品（统一读取 储物袋/物品列表）
        {
          const items = RelationshipsComponent._readNpcStorageAsArray(rel).map(x => {
            try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return x; }
          });
          if (items.length) {
            const iLines = items.map(it => {
              const n = h.SafeGetValue(it, 'name', '未知物品');
              const t = h.SafeGetValue(it, 'tier', '无');
              const q = Number(h.SafeGetValue(it, 'quantity', 1)) || 1;
              const base = Number(h.SafeGetValue(it, 'base_value', 0)) || 0;
              return `${n} x${q}（品阶:${t}，基础:${base}）`;
            });
            lines.push(`携带物品|${iLines.join('；')}`);
          }
        }

        // 过往交集（兼容对象字典/数组/字符串化JSON）
        (() => {
          try {
            let ev = rel?.event_history ?? rel?.['过往交集'] ?? null;
            // 字符串化 JSON 尝试解析
            if (typeof ev === 'string') {
              const s = ev.trim();
              if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                try { ev = JSON.parse(s); } catch (_) { /* 保留原字符串 */ }
              }
            }
            let list = [];
            if (Array.isArray(ev)) {
              list = ev.filter(Boolean);
            } else if (ev && typeof ev === 'object') {
              list = Object.entries(ev)
                .filter(([k]) => k !== '$meta')
                .map(([k, v]) => {
                  if (v == null) return '';
                  if (typeof v === 'string') return v.trim();
                  try {
                    return window.GuixuHelpers.SafeGetValue(v, 'description',
                             window.GuixuHelpers.SafeGetValue(v, 'name',
                               (function(x){ try { return JSON.stringify(x); } catch { return String(x); } })(v)));
                  } catch { return ''; }
                })
                .filter(s => typeof s === 'string' && s);
            } else if (typeof ev === 'string' && ev) {
              // 纯文本：按常见分隔符切分为多条
              list = ev.split(/[\n；;]+/).map(s => s.trim()).filter(Boolean);
            }
            if (list.length) lines.push(`过往交集|${list.join('；')}`);
          } catch (_) { /* ignore */ }
        })();

        return lines.join('\n');
      } catch (_) { return ''; }
    },
    async _extractCharacterToLorebook(rel) {
      const h = window.GuixuHelpers;
      const name = h.SafeGetValue(rel, 'name', null);
      if (!name) { window.GuixuHelpers.showTemporaryMessage('该人物缺少姓名，无法提取'); return; }
      const state = window.GuixuState.getState();
      const index = state.unifiedIndex || 1;
      // 新前缀：优先写入“【角色】”，旧前缀“角色:”仅用于兼容读取
      const ROLE_PREFIX_NEW = '【角色】';
      const ROLE_PREFIX_OLD = '角色:'; // 兼容兜底用（读取/清理时使用）
      const entryComment = index > 1 ? `${ROLE_PREFIX_NEW}${name}(${index})` : `${ROLE_PREFIX_NEW}${name}`;
      const book = window.GuixuConstants.LOREBOOK.NAME;
      const content = this._buildCharacterEntryContent(rel);
      if (!content) { window.GuixuHelpers.showTemporaryMessage('没有可写入的角色信息'); return; }
      try {
        const all = await window.GuixuAPI.getLorebookEntries(book);
        let target = all.find(e => (e.comment || '') === entryComment);
        if (target) {
          const exists = (target.content || '').includes(content);
          if (!exists) {
            const merged = (target.content ? (target.content + '\n\n') : '') + content;
            await window.GuixuAPI.setLorebookEntries(book, [{ uid: target.uid, content: merged, keys: Array.from(new Set([...(target.keys || []), name])) }]);
          }
        } else {
          await window.GuixuAPI.createLorebookEntries(book, [{
            comment: entryComment,
            content,
            keys: [name],
            enabled: false,
            position: 'before_character_definition',
            order: 30,
            selective: true,
            constant: false,
            case_sensitive: false
          }]);
        }
        window.GuixuHelpers.showTemporaryMessage(`已提取到世界书：${entryComment}`);
      } catch (e) {
        console.error('[归墟] 提取角色到世界书失败:', e);
        window.GuixuHelpers.showTemporaryMessage('提取失败');
      }
    },
    async _clearAllCharacterEntries() {
      try {
        const book = window.GuixuConstants.LOREBOOK.NAME;
        const all = await window.GuixuAPI.getLorebookEntries(book);
        // 兼容清理：同时匹配“【角色】”与旧前缀“角色:”
        const uids = all
          .filter(e => {
            const c = String(e.comment || '');
            return typeof e.comment === 'string' && (c.startsWith('【角色】') || c.startsWith('角色:'));
          })
          .map(e => e.uid);
        if (uids.length) await window.GuixuAPI.deleteLorebookEntries(book, uids);
      } catch (e) {
        console.warn('[归墟] 清空角色目录失败:', e);
        throw e;
      }
    }
  };

  window.RelationshipsComponent = RelationshipsComponent;
})(window);
