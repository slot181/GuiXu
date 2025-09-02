(function (window) {
    'use strict';

    // 依赖检查
    if (!window.GuixuState || !window.GuixuHelpers || !window.GuixuAPI || !window.GuixuDOM) {
        console.error('ActionService 依赖 GuixuState, GuixuHelpers, GuixuAPI, 和 GuixuDOM。');
        return;
    }

    const ActionService = {
        /**
         * 处理所有用户和系统动作的核心函数。
         * @param {string} userMessage - 用户在输入框中输入的消息。
         */
        async handleAction(userMessage = '') {
            const state = window.GuixuState.getState();

            // 1. 整合输入
            const commandText = this.buildActionCommandText(state.pendingActions);
            if (!userMessage && !commandText) {
                throw new Error('请输入回复或添加指令后发送。');
            }

            // 2. 构建 GenerateConfig 对象
            const combinedContent = this.buildCombinedContent(commandText, userMessage);
            const generateConfig = {
                injects: [{
                    role: 'user',
                    content: combinedContent,
                    position: 'in_chat',
                    depth: 0,
                    should_scan: true,
                }],
                should_stream: !!state.isStreamingEnabled,
            };
            state.update('lastSentPrompt', combinedContent);

            // 3. 调用AI生成（统一显示/隐藏等待提示）
            try { window.GuixuMain?.showWaitingMessage?.(); } catch (_) {}
            const aiResponse = await GuixuAPI.generate(generateConfig).finally(() => {
                try { window.GuixuMain?.hideWaitingMessage?.(); } catch (_) {}
            });
            if (typeof aiResponse !== 'string') {
                throw new Error('AI未返回有效文本。');
            }
            console.log('[归墟] AI原始回复:', aiResponse);

            // 4. 提取并更新状态
            this.extractAndCacheResponse(aiResponse);
            await this.updateMvuState(aiResponse);
            // 确保将前端计算得到的四维上限实时回写到 mvu 变量，再进行保存
            try { window.GuixuAttributeService?.calculateFinalAttributes?.(); } catch (_) {}
            
            // 5. 静默保存到当前楼层
            await this.saveToCurrentMessage(aiResponse);

            // 新轮对话已发送：清空本轮的装备回退缓冲，避免跨轮误还原
            try { window.GuixuState.update('equipSwapBuffer', {}); } catch (_) {}

            // 6. 返回新的状态和AI响应
            return {
                newMvuState: state.getState().currentMvuState,
                aiResponse: aiResponse
            };
        },

        /**
         * 使用上一轮输入一键重roll，重新生成上一轮回复。
         */
        async rerollLast() {
            try {
                const st = window.GuixuState.getState();
                const last = st.lastSentPrompt;
                if (!last || !String(last).trim()) {
                    window.GuixuHelpers?.showTemporaryMessage?.('未找到上一轮输入，无法重掷');
                    return;
                }
                const generateConfig = {
                    injects: [{
                        role: 'user',
                        content: last,
                        position: 'in_chat',
                        depth: 0,
                        should_scan: true,
                    }],
                    should_stream: !!st.isStreamingEnabled,
                };
                try { window.GuixuMain?.showWaitingMessage?.(); } catch (_) {}
                const aiResponse = await GuixuAPI.generate(generateConfig).finally(() => {
                    try { window.GuixuMain?.hideWaitingMessage?.(); } catch (_) {}
                });
                if (typeof aiResponse !== 'string') {
                    throw new Error('AI未返回有效文本。');
                }

                // 提取/更新MVU/保存
                this.extractAndCacheResponse(aiResponse);
                await this.updateMvuState(aiResponse);
                try { window.GuixuAttributeService?.calculateFinalAttributes?.(); } catch (_) {}
                await this.saveToCurrentMessage(aiResponse);

                // 刷新UI
                try {
                    const s2 = window.GuixuState.getState();
                    const stat = s2?.currentMvuState?.stat_data || null;
                    if (stat) window.GuixuMain?.renderUI?.(stat);
                    await window.GuixuMain?.loadAndDisplayCurrentScene?.(aiResponse);
                } catch (_) {}

                window.GuixuHelpers?.showTemporaryMessage?.('已使用上一轮输入重掷本轮回复');
            } catch (error) {
                console.error('[归墟] 重掷失败:', error);
                window.GuixuHelpers?.showTemporaryMessage?.(`重掷失败: ${error.message}`);
            }
        },

        /**
         * 从待处理动作数组构建指令文本。
         * @private
         */
        buildActionCommandText(pendingActions) {
            if (pendingActions.length === 0) return '';
            
            let commandText = '[本轮行动指令]\n';
            pendingActions.forEach(cmd => {
                let actionText = '';
                switch (cmd.action) {
                    case 'equip': actionText = `装备 [${cmd.itemName}] 到 [${cmd.category}] 槽位。`; break;
                    case 'unequip': actionText = `卸下 [${cmd.itemName}] 从 [${cmd.category}] 槽位。`; break;
                    case 'use': actionText = `使用 ${cmd.quantity} 个 [${cmd.itemName}]。`; break;
                    case 'discard':
                        actionText = cmd.quantity > 1 ? `丢弃 ${cmd.quantity} 个 [${cmd.itemName}]。` : `丢弃 [${cmd.itemName}]。`;
                        break;
                    case 'trade_buy': {
                        const npc = cmd.npcName || '未知之人';
                        const name = cmd.itemName || '未知物品';
                        const tier = cmd.tier || '练气';
                        const qty = Number(cmd.quantity || 1);
                        const unit = Number(cmd.unitPrice || 0);
                        const total = Number(cmd.totalPrice || 0);
                        actionText = `与 [${npc}] 交易，购买 ${qty} 个 [${name}]（品阶：${tier}，单价：${unit} 灵石），总价 ${total} 灵石。`;
                        break;
                    }
                    case 'trade_sell': {
                        const npc = cmd.npcName || '未知之人';
                        const name = cmd.itemName || '未知物品';
                        const tier = cmd.tier || '练气';
                        const qty = Number(cmd.quantity || 1);
                        const unit = Number(cmd.unitPrice || 0);
                        const total = Number(cmd.totalPrice || 0);
                        actionText = `与 [${npc}] 交易，出售 ${qty} 个 [${name}]（品阶：${tier}，单价：${unit} 灵石），总价 ${total} 灵石。`;
                        break;
                    }
                    case 'trade_abuse': {
                        const npc = cmd.npcName || '未知之人';
                        const attempts = Number(cmd.attempts || 0);
                        const deducted = Number(cmd.deductedFavor || 0);
                        actionText = `【交易-违规】多次尝试低买/高卖，已触怒 [${npc}]，好感度 -${deducted}（累计 ${attempts} 次），本轮禁止交易。`;
                        break;
                    }
                    default:
                        actionText = '[未知指令]';
                }
                commandText += `- ${actionText}\n`;
            });
            return commandText;
        },

        /**
         * 合并指令和用户输入。
         * @private
         */
        buildCombinedContent(commandText, userMessage) {
            let combined = '';
            if (commandText) combined += commandText + '\n';
            if (userMessage) combined += `<行动选择>\n${userMessage}\n</行动选择>`;
            return combined;
        },

        /**
         * 从AI响应中提取所有标签内容并缓存到State。
         * @private
         */
        extractAndCacheResponse(aiResponse) {
            const state = window.GuixuState;
            // 忽略 <thinking> 区块，防止其中的“自检标签”污染正文/提取
            const base = String(aiResponse || '')
                .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '')
                .replace(/<\s*action[^>]*>[\s\S]*?<\/\s*action\s*>/gi, '');
            const H = window.GuixuHelpers || GuixuHelpers;

            const __gt = H.extractLastTagContent('gametxt', base);
            state.update('lastExtractedNovelText', __gt);
            // 若成功捕捉到一次 <gametxt> 正文，为当前“世界书读写序号”打上已捕捉标记（供门禁判定使用）
            try {
                const idxSeen = window.GuixuState?.getState?.().unifiedIndex || 1;
                if (__gt && String(__gt).trim() !== '') {
                    localStorage.setItem(`guixu_gate_gametxt_seen_${idxSeen}`, '1');
                }
            } catch (_) {}
            // 兼容繁体/日体别名：<本世历程>/<本世歴程>、<往世涟漪>/<往世漣漪>
            state.update('lastExtractedJourney',
                (H.extractLastTagContentByAliases?.('本世历程', base, true)) ?? H.extractLastTagContent('本世历程', base)
            );
            state.update('lastExtractedPastLives',
                (H.extractLastTagContentByAliases?.('往世涟漪', base, true)) ?? H.extractLastTagContent('往世涟漪', base)
            );
            state.update('lastExtractedVariables', H.extractLastTagContent('UpdateVariable', base, true));
            state.update('lastExtractedCharacterCard', H.extractLastTagContent('角色提取', base));
        },

        /**
         * 使用AI响应更新MVU状态。
         * @private
         */
        async updateMvuState(aiResponse) {
            const state = window.GuixuState;
            const updateScript = aiResponse; // 整个响应作为脚本

            if (updateScript && state.currentMvuState) {
                const inputData = { old_variables: state.currentMvuState };
                try {
                    const mvuPromise = eventEmit('mag_invoke_mvu', updateScript, inputData);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('MVU event timeout')), 3000));
                    await Promise.race([mvuPromise, timeoutPromise]);

                    if (inputData.new_variables) {
                        state.update('currentMvuState', inputData.new_variables);
                    } else {
                        throw new Error('mvu 未返回新状态。');
                    }
                } catch (eventError) {
                    console.warn('[归墟] 调用 mag_invoke_mvu 失败，尝试前端备用方案:', eventError);
                    const modifiedState = GuixuHelpers.applyUpdateFallback(updateScript, state.currentMvuState);
                    if (modifiedState) {
                        state.update('currentMvuState', modifiedState);
                        console.log('[归墟-备用方案] 前端模拟更新成功。');
                    }
                }
            }
        },

        

        /**
         * 将结果静默保存到当前楼层消息。
         * 优化：
         * - 若待保存数据与当前楼层一致则跳过（避免无效写入/分配）
         * - 与 MvuIO 写回互斥降噪：若存在合并队列/正在刷新，短暂等待一拍，减少“连环两次写”
         * - 移除深拷贝(JSON stringify/parse)以降低瞬时内存压力
         * @private
         */
        async saveToCurrentMessage(aiResponse) {
            const state = window.GuixuState.getState();
            const currentId = GuixuAPI.getCurrentMessageId();

            // 若 MvuIO 尚有待写队列或正在刷新，短暂等待几拍，避免紧跟其后再次全量写入
            try {
                if (window.GuixuMvuIO) {
                    let tries = 0;
                    while ((window.GuixuMvuIO._flushing === true
                        || (Array.isArray(window.GuixuMvuIO._queue) && window.GuixuMvuIO._queue.length > 0))
                        && tries < 5) {
                        await new Promise(r => setTimeout(r, 80));
                        tries++;
                    }
                }
            } catch (_) {}

            const messages = await GuixuAPI.getChatMessages(currentId);
            if (messages && messages.length > 0) {
                const currentMsg = messages[0];
                const nextData = state.currentMvuState || {};
                const nextMessage = String(aiResponse || '');
                const currentData = currentMsg.data || null;
                const currentMessage = String(currentMsg.message || '');

                // 同时比较 stat_data 和 message 正文，避免遗漏仅正文变更的情况
                const hashStat = (o) => {
                    try {
                        const v = (o && typeof o === 'object') ? (o.stat_data ?? o) : o;
                        return JSON.stringify(v);
                    } catch (_) { return ''; }
                };
                const nextDataHash = hashStat(nextData);
                const currDataHash = hashStat(currentData);

                const combined = (dataHash, msg) => `${dataHash}#${msg.length}:${msg}`;
                const nextCombined = combined(nextDataHash, nextMessage);
                const currCombined = combined(currDataHash, currentMessage);

                if (!this._lastSaveCache) this._lastSaveCache = {};
                const lastCombined = this._lastSaveCache[currentId];

                // 缓存命中或与当前楼层一致则跳过
                if (lastCombined && lastCombined === nextCombined) {
                    console.log('[归墟] 跳过静默保存：内容未变化（命中缓存）。');
                    return;
                }
                if (currCombined === nextCombined) {
                    this._lastSaveCache[currentId] = nextCombined;
                    console.log('[归墟] 跳过静默保存：内容未变化（与当前楼层一致）。');
                    return;
                }

                // 差异写入：同时更新 data 与 message
                currentMsg.data = nextData;
                currentMsg.message = nextMessage;
                await GuixuAPI.setChatMessages([currentMsg], { refresh: 'none' });
                this._lastSaveCache[currentId] = nextCombined;
                console.log('[归墟] 已静默更新当前楼层（差异写入：data+message）。');
            } else {
                console.error('[归墟] 未找到当前楼层消息，无法更新。');
            }
        },

        // --- 存档/读档管理功能 ---
        async showSaveLoadManager() {
            window.GuixuBaseModal.open('save-load-modal');
            const manualContainer = GuixuDOM.$('#save-slots-container');
            const autoContainer = GuixuDOM.$('#auto-save-slot-container');
            const autoSaveCheckbox = GuixuDOM.$('#auto-save-checkbox');

            if (!manualContainer || !autoContainer || !autoSaveCheckbox) return;

            autoSaveCheckbox.checked = GuixuState.getState().isAutoSaveEnabled;

            let saves;
            try {
                saves = await this.getSavesFromStorage();
            } catch (e) {
                console.error("解析整个存档文件失败:", e);
                manualContainer.innerHTML = `<div style="color: #ff6b6b; padding: 20px; text-align: center;"><p>错误：主存档文件已损坏。</p></div>`;
                autoContainer.innerHTML = '';
                return;
            }

            let autoHtml = '';
            const autoSlotIds = ['auto_save_slot_0', 'auto_save_slot_1'];
            autoSlotIds.forEach(slotId => {
                autoHtml += this.renderSlot(saves[slotId], slotId, true);
            });
            autoContainer.innerHTML = autoHtml;

            let manualHtml = '';
            const totalSlots = 5;
            for (let i = 1; i <= totalSlots; i++) {
                manualHtml += this.renderSlot(saves[`slot_${i}`], `slot_${i}`, false);
            }
            manualContainer.innerHTML = manualHtml;
            
            this.bindSaveSlotListeners();
        },

        renderSlot(saveData, slotId, isAutoSave) {
            const { h } = GuixuDOM;
            const infoDiv = h('div', { className: 'save-slot-info' });
            let statDataForRender = null;

            if (saveData && typeof saveData.mvu_data === 'object' && saveData.mvu_data !== null) {
                statDataForRender = saveData.mvu_data.stat_data || saveData.mvu_data;
            }

            if (statDataForRender) {
                const date = new Date(saveData.timestamp).toLocaleString('zh-CN');
                const jingjie = GuixuHelpers.SafeGetValue(statDataForRender, '当前境界', '未知');
                const jinian = GuixuHelpers.SafeGetValue(statDataForRender, '当前时间纪年', '未知');
                const summary = (window.GuixuMain && typeof window.GuixuMain._getDisplayText === 'function')
                  ? window.GuixuMain._getDisplayText(saveData.message_content)
                  : (saveData.message_content || '');
                const saveName = saveData.save_name || (isAutoSave ? `自动存档 (${slotId.slice(-1)})` : `存档 ${slotId.split('_')[1]}`);
                
                infoDiv.append(
                    h('div', { className: 'slot-name' }, [saveName]),
                    h('div', { className: 'slot-time' }, [`${date} - ${jingjie} - ${jinian}`]),
                    h('div', { className: 'slot-summary' }, [summary ? summary.substring(0, 40) + '...' : '无正文记录'])
                );
            } else {
                const name = isAutoSave ? `自动存档 (${slotId.slice(-1)})` : `存档 ${slotId.split('_')[1]}`;
                infoDiv.append(
                    h('div', { className: 'slot-name' }, [name]),
                    h('div', { className: 'slot-time', style: 'font-style: italic; color: #8b7355;' }, ['空存档位'])
                );
            }

            const actionsDiv = h('div', { className: 'save-slot-actions' });
            if (isAutoSave) {
                actionsDiv.append(
                    h('button', { className: 'interaction-btn btn-load-slot', style: 'padding: 8px 12px;', disabled: !saveData }, ['读档']),
                    h('button', { className: 'interaction-btn btn-delete-slot', style: 'padding: 8px 12px; background: #8b0000;', disabled: !saveData }, ['删除'])
                );
            } else {
                actionsDiv.append(
                    h('button', { className: 'interaction-btn btn-save-slot', style: 'padding: 6px 10px; font-size: 12px;' }, ['存档']),
                    h('button', { className: 'interaction-btn btn-load-slot', style: 'padding: 6px 10px; font-size: 12px;', disabled: !saveData }, ['读档']),
                    h('button', { className: 'interaction-btn btn-export-slot', style: 'padding: 6px 10px; font-size: 12px; background: #004d40;', disabled: !saveData }, ['导出']),
                    h('button', { className: 'interaction-btn btn-delete-slot', style: 'padding: 6px 10px; font-size: 12px; background: #8b0000;', disabled: !saveData }, ['删除'])
                );
            }

            const slotDiv = h('div', { className: 'save-slot', 'data-slot-id': slotId }, [infoDiv, actionsDiv]);
            return slotDiv.outerHTML;
        },

        bindSaveSlotListeners() {
            const container = GuixuDOM.$('#save-load-modal .modal-body');
            if (!container) return;

            const newContainer = container.cloneNode(true);
            container.parentNode.replaceChild(newContainer, container);

            newContainer.querySelector('#auto-save-checkbox')?.addEventListener('change', (e) => {
                GuixuState.update('isAutoSaveEnabled', e.target.checked);
                GuixuHelpers.showTemporaryMessage(`自动存档已${e.target.checked ? '开启' : '关闭'}`);
                if (e.target.checked) GuixuState.startAutoSavePolling();
                else GuixuState.stopAutoSavePolling();
            });

            newContainer.addEventListener('click', (e) => {
                const target = e.target;
                const slotDiv = target.closest && target.closest('.save-slot');
                if (!slotDiv) return;

                const slotId = slotDiv.dataset.slotId;

                // 使用最近的按钮，增强兼容性
                const clickedButton = target.closest && target.closest('button');
                if (!clickedButton) return;

                e.preventDefault();
                e.stopPropagation();

                if (clickedButton.disabled) return;

                if (clickedButton.classList.contains('btn-save-slot')) {
                    this.saveGame(slotId);
                } else if (clickedButton.classList.contains('btn-load-slot')) {
                    this.loadGame(slotId);
                } else if (clickedButton.classList.contains('btn-export-slot')) {
                    this.exportSave(slotId);
                } else if (clickedButton.classList.contains('btn-delete-slot')) {
                    this.deleteSave(slotId);
                }
            });
        },

        // 云存档：从世界书条目读取所有存档记录
        async getSavesFromStorage() {
            try {
                const bookName = GuixuConstants.LOREBOOK.NAME;
                const entries = await GuixuAPI.getLorebookEntries(bookName);
                const map = {};
                (entries || []).forEach(e => {
                    const c = String(e.comment || '');
                    if (c.startsWith('存档:')) {
                        const slotId = c.slice(3); // 去掉前缀 '存档:'
                        try { map[slotId] = JSON.parse(e.content || '{}'); } catch (_) { /* ignore */ }
                    }
                });
                return map;
            } catch (e) {
                console.error('获取存档失败(世界书):', e);
                return {};
            }
        },

        _slotEntryName(slotId) {
            return `存档:${slotId}`;
        },

        async _upsertSaveEntry(slotId, saveData) {
            const bookName = GuixuConstants.LOREBOOK.NAME;
            const comment = this._slotEntryName(slotId);
            const all = await GuixuAPI.getLorebookEntries(bookName);
            const existing = (all || []).find(e => e.comment === comment);
            const content = JSON.stringify(saveData || {}, null, 0);
            if (existing) {
                await GuixuAPI.setLorebookEntries(bookName, [{ uid: existing.uid, content }]);
            } else {
                await GuixuAPI.createLorebookEntries(bookName, [{ comment, content, keys: [comment], enabled: false, position: 'before_character_definition', order: 10 }]);
            }
        },

        async _deleteSaveEntry(slotId) {
            const bookName = GuixuConstants.LOREBOOK.NAME;
            const comment = this._slotEntryName(slotId);
            const all = await GuixuAPI.getLorebookEntries(bookName);
            const existing = (all || []).find(e => e.comment === comment);
            if (existing) {
                await GuixuAPI.deleteLorebookEntries(bookName, [existing.uid]);
            }
        },

        async saveGame(slotId) {
            const saveName = await this.promptForSaveName(slotId);
            if (!saveName) {
                GuixuHelpers.showTemporaryMessage('存档已取消');
                return;
            }

            const allSaves = await this.getSavesFromStorage();
            const performSave = async () => {
                try {
                    const state = GuixuState.getState();
                    if (!state.currentMvuState || !state.currentMvuState.stat_data) {
                        throw new Error('MVU数据不完整，无法存档。');
                    }
                    // 若覆盖同一存档位，先删除旧的世界书备份条目，避免叠加产生冗余
                    const existingSave = allSaves[slotId];
                    if (existingSave && existingSave.lorebook_entries) {
                        await GuixuState.deleteLorebookBackup(existingSave);
                    }
                    // 在保存前进行一次属性重算与上限回写，确保存档中包含最新的四维上限
                    try { window.GuixuAttributeService?.calculateFinalAttributes?.(); } catch (_) {}

                    const lorebookEntries = await GuixuLorebookService.backupActiveLore(`${saveName}-本世历程`, `${saveName}-往世涟漪`, state.unifiedIndex);
                    const saveDataPayload = {
                        timestamp: new Date().toISOString(),
                        save_name: saveName,
                        message_content: (await GuixuAPI.getChatMessages(GuixuAPI.getCurrentMessageId()))?.[0]?.message || '',
                        lorebook_entries: lorebookEntries,
                        mvu_data: state.currentMvuState,
                        // 新增：保存当前装备状态
                        equipped_items: state.equippedItems,
                        // 保存当前世界书读写序号
                        unified_index: state.unifiedIndex,
                    };
                    allSaves[slotId] = saveDataPayload;
                    await this._upsertSaveEntry(slotId, saveDataPayload);
                    GuixuHelpers.showTemporaryMessage(`存档"${saveName}"已保存`);
                    this.showSaveLoadManager();
                } catch (error) {
                    console.error('执行存档操作失败:', error);
                    GuixuHelpers.showTemporaryMessage(`存档失败: ${error.message}`);
                }
            };

            if (allSaves[slotId]) {
                (window.GuixuMain && typeof window.GuixuMain.showCustomConfirm === 'function')
                  ? window.GuixuMain.showCustomConfirm(`存档位 ${slotId.split('_')[1]} 已有数据，确定要覆盖吗？`, performSave)
                  : (confirm(`存档位 ${slotId.split('_')[1]} 已有数据，确定要覆盖吗？`) ? performSave() : void 0);
            } else {
                await performSave();
            }
        },

        async loadGame(slotId) {
            const allSaves = await this.getSavesFromStorage();
            const saveData = allSaves[slotId];
            if (!saveData) {
                GuixuHelpers.showTemporaryMessage('没有找到存档文件。');
                return;
            }
            (window.GuixuMain && typeof window.GuixuMain.showCustomConfirm === 'function'
              ? window.GuixuMain.showCustomConfirm
              : (msg, ok) => { if (confirm(msg)) ok(); }
            )(`确定要读取存档"${saveData.save_name}"吗？`, async () => {
                try {
                    // 优先恢复世界书条目
                    if (saveData.lorebook_entries) {
                        await GuixuLorebookService.restoreActiveLore(saveData.lorebook_entries, GuixuState.getState().unifiedIndex);
                    }

                    // 恢复装备状态
                    if (saveData.equipped_items) {
                        GuixuState.update('equippedItems', saveData.equipped_items);
                    }
                    // 恢复当时的世界书读写序号，保证读档后剧情按正确序号加载
                    if (typeof saveData.unified_index === 'number') {
                        GuixuState.update('unifiedIndex', saveData.unified_index);
                    }

                    // 写入当前楼层（移除 0 楼语义）
                    const currentId = GuixuAPI.getCurrentMessageId();
                    const updates = [
                        { message_id: currentId, message: saveData.message_content || '', data: saveData.mvu_data }
                    ];
                    await GuixuAPI.setChatMessages(updates, { refresh: 'none' });

                    // 同步前端缓存并触发渲染与属性重算+上限回写
                    try { window.GuixuState.update('currentMvuState', saveData.mvu_data); } catch (_) {}
                    try { window.GuixuMain?.updateDynamicData?.(); } catch (_) {}
                    try { window.GuixuAttributeService?.calculateFinalAttributes?.(); } catch (_) {}
                    try { window.GuixuBaseModal?.closeAll?.(); } catch (_) {}
                    GuixuHelpers.showTemporaryMessage(`读档"${saveData.save_name}"成功！`);

                } catch (error) {
                    console.error('读档失败:', error);
                    GuixuHelpers.showTemporaryMessage(`读档失败: ${error.message}`);
                }
            });
        },

        async deleteSave(slotId) {
            const allSaves = await this.getSavesFromStorage();
            const saveDataToDelete = allSaves[slotId];
            if (!saveDataToDelete) return;

            (window.GuixuMain && typeof window.GuixuMain.showCustomConfirm === 'function'
              ? window.GuixuMain.showCustomConfirm
              : (msg, ok) => { if (confirm(msg)) ok(); }
            )(`确定要删除 "${saveDataToDelete.save_name}" 吗？`, async () => {
                try {
                    await GuixuState.deleteLorebookBackup(saveDataToDelete);
                    // 额外：清除该存档对应世界序号的所有“本世历程/往世涟漪”激活条目
                    await GuixuState.deleteWorldLoreForIndex(Number(saveDataToDelete.unified_index) || GuixuState.getState().unifiedIndex || 1);
                    delete allSaves[slotId];
                    await this._deleteSaveEntry(slotId);
                    GuixuHelpers.showTemporaryMessage(`"${saveDataToDelete.save_name}" 已删除。`);
                    this.showSaveLoadManager();
                } catch (error) {
                    console.error('删除存档失败:', error);
                    GuixuHelpers.showTemporaryMessage(`删除存档失败: ${error.message}`);
                }
            });
        },

        async clearAllSaves() {
            const allSaves = await this.getSavesFromStorage();
            const saveKeys = Object.keys(allSaves);

            if (saveKeys.length === 0) {
                try {
                    const bookName = GuixuConstants.LOREBOOK.NAME;
                    const allLoreEntries = await GuixuAPI.getLorebookEntries(bookName);
                    const baseJourney = GuixuConstants.LOREBOOK.ENTRIES.JOURNEY;
                    const basePast = GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES;

                    const activeLoreEntries = (allLoreEntries || []).filter(e => {
                        const c = String(e.comment || "");
                        return c === baseJourney || c.startsWith(baseJourney + "(") || c === basePast || c.startsWith(basePast + "(");
                    });

                    if (activeLoreEntries.length > 0) {
                        const indices = new Set();
                        activeLoreEntries.forEach(e => {
                            const c = String(e.comment || "");
                            let idx = 1;
                            const m = c.match(/\((\d+)\)$/);
                            if (m) idx = parseInt(m[1], 10);
                            indices.add(idx);
                        });

                        const idxList = Array.from(indices).sort((a, b) => a - b).join(", ");
                        const msg = `未发现任何存档记录，但检测到世界书中存在 ${activeLoreEntries.length} 条“本世历程/往世涟漪”激活条目（涉及世界序号：${idxList}）。\n是否清理这些激活条目？此操作不可恢复。`;

                        const doClean = async () => {
                            try {
                                for (const idx of indices) {
                                    await GuixuState.deleteWorldLoreForIndex(idx);
                                }
                                GuixuHelpers.showTemporaryMessage("已清理检测到的激活条目。");
                                await this.showSaveLoadManager();
                            } catch (e) {
                                console.error("清理激活条目失败:", e);
                                GuixuHelpers.showTemporaryMessage(`清理失败: ${e.message}`);
                            }
                        };

                        if (window.GuixuMain && typeof window.GuixuMain.showCustomConfirm === "function") {
                            window.GuixuMain.showCustomConfirm(msg, doClean, "高危操作确认");
                        } else {
                            if (confirm(msg)) { await doClean(); }
                        }
                    } else {
                        GuixuHelpers.showTemporaryMessage("没有可清除的存档数据。");
                    }
                } catch (e) {
                    console.error("检测世界书激活条目失败:", e);
                    GuixuHelpers.showTemporaryMessage("没有可清除的存档数据。");
                }
                return;
            }

            const confirmMsg = `你确定要清除所有 ${saveKeys.length} 个存档吗？\n此操作将删除所有存档及其关联的世界书快照，且不可恢复。`;
            
            const confirmAction = async () => {
                try { window.GuixuMain?.showWaitingMessage?.('正在清除存档...'); } catch (_) {}
                
                try {
                    const bookName = GuixuConstants.LOREBOOK.NAME;
                    const allLoreEntries = await GuixuAPI.getLorebookEntries(bookName);
                    const entryNamesToDelete = new Set();
                    const entryUidsToDelete = new Set();

                    // 1. 收集所有存档条目的 comment 和 uid
                    allLoreEntries.forEach(entry => {
                        if (String(entry.comment).startsWith('存档:')) {
                            const slotId = entry.comment.slice(3);
                            if (saveKeys.includes(slotId)) {
                                entryNamesToDelete.add(entry.comment);
                                entryUidsToDelete.add(entry.uid);
                            }
                        }
                    });

                    // 2. 从存档内容中收集所有关联的 lorebook_entries 名称
                    Object.values(allSaves).forEach(saveData => {
                        if (saveData && saveData.lorebook_entries) {
                            Object.values(saveData.lorebook_entries).forEach(name => {
                                if (name) entryNamesToDelete.add(name);
                            });
                        }
                    });
                    
                    // 3. 根据名称找到所有关联备份条目的 uid
                    allLoreEntries.forEach(entry => {
                        if (entryNamesToDelete.has(entry.comment)) {
                            entryUidsToDelete.add(entry.uid);
                        }
                    });

                    if (entryUidsToDelete.size > 0) {
                        await GuixuAPI.deleteLorebookEntries(bookName, Array.from(entryUidsToDelete));
                        GuixuHelpers.showTemporaryMessage(`所有存档及关联的世界书快照已清除。`);
                    } else {
                        GuixuHelpers.showTemporaryMessage("没有找到需要清除的存档条目。");
                    }

                    // 额外：按世界序号清除所有“本世历程/往世涟漪”激活条目
                    const indices = new Set();
                    Object.values(allSaves).forEach(s => { const idx = Number(s?.unified_index) || 1; indices.add(idx); });
                    for (const idx of indices) {
                        try { await GuixuState.deleteWorldLoreForIndex(idx); }
                        catch (e) { console.warn('清除激活条目失败:', e); }
                    }
                    
                    await this.showSaveLoadManager();

                } catch (error) {
                    console.error('清除所有存档时出错:', error);
                    GuixuHelpers.showTemporaryMessage(`清除存档失败: ${error.message}`);
                } finally {
                    try { window.GuixuMain?.hideWaitingMessage?.(); } catch (_) {}
                }
            };

            (window.GuixuMain && typeof window.GuixuMain.showCustomConfirm === 'function'
                ? window.GuixuMain.showCustomConfirm
                : (msg, ok) => { if (confirm(msg)) ok(); }
            )(confirmMsg, confirmAction, "高危操作确认");
        },

        async handleFileImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const importedSave = JSON.parse(e.target.result);
                    if (!importedSave.timestamp || !importedSave.mvu_data || !importedSave.save_name) {
                        throw new Error('存档文件格式无效。');
                    }
                    const slotId = await this.promptForSlotSelection(importedSave.save_name);
                    if (!slotId) return;
                    await this._upsertSaveEntry(slotId, importedSave);
                    GuixuHelpers.showTemporaryMessage(`存档 "${importedSave.save_name}" 已导入。`);
                    await this.showSaveLoadManager();
                } catch (error) {
                    GuixuHelpers.showTemporaryMessage(`导入失败: ${error.message}`);
                }
            };
            reader.readAsText(file);
            event.target.value = '';
        },

        async exportSave(slotId) {
            const saveData = (await this.getSavesFromStorage())[slotId];
            if (!saveData) {
                GuixuHelpers.showTemporaryMessage('该存档位为空。');
                return;
            }
            const fileName = `${saveData.save_name.replace(/[^a-z0-9]/gi, '_')}.json`;
            this._downloadJSON(saveData, fileName);
        },

        _downloadJSON(data, fileName) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = GuixuDOM.h('a', { href: url, download: fileName });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        async promptForSlotSelection(importName) {
            return new Promise(resolve => {
                const { h } = GuixuDOM;
                let slotsHtml = [];
                for (let i = 1; i <= 5; i++) {
                    slotsHtml.push(h('button', { className: 'interaction-btn slot-select-btn', 'data-slot-id': `slot_${i}` }, [`存档位 ${i}`]));
                }
                const modal = h('div', { className: 'modal-overlay', style: 'display: flex; z-index: 2001; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); justify-content: center; align-items: center;' }, [
                    h('div', { className: 'modal-content', style: 'background: rgba(26, 26, 46, 0.95); border: 1px solid #c9aa71; border-radius: 8px; padding: 20px; width: 450px; height: auto; box-shadow: 0 0 20px rgba(201, 170, 113, 0.3);' }, [
                        h('div', { className: 'modal-header', style: 'display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(201, 170, 113, 0.5); padding-bottom: 10px; margin-bottom: 15px;' }, [h('h2', { className: 'modal-title', style: 'font-size: 18px; color: #c9aa71; margin: 0;' }, ['选择导入位置'])]),
                        h('div', { className: 'modal-body', style: 'padding: 20px; color: #e0dcd1;' }, [
                            h('p', { style: 'margin-bottom: 20px; color: #c9aa71;' }, [`请选择一个存档位以导入 "${importName}":`]),
                            h('div', { style: 'display: flex; flex-wrap: wrap; gap: 10px; justify-content: center;' }, slotsHtml),
                            h('div', { style: 'text-align: right; margin-top: 25px;' }, [
                                h('button', { id: 'import-cancel-btn', className: 'interaction-btn', style: 'padding: 10px 8px; background: linear-gradient(45deg, #1a1a2e, #2d1b3d); border: 1px solid #c9aa71; border-radius: 5px; color: #c9aa71; font-size: 12px; cursor: pointer;' }, ['取消'])
                            ])
                        ])
                    ])
                ]);
                GuixuDOM.$('.guixu-root-container').appendChild(modal);
                modal.addEventListener('click', (e) => {
                    if (e.target.classList.contains('slot-select-btn')) {
                        modal.remove();
                        resolve(e.target.dataset.slotId);
                    } else if (e.target.id === 'import-cancel-btn' || e.target === modal) {
                        modal.remove();
                        resolve(null);
                    }
                });
            });
        },

        async promptForSaveName(slotId) {
            return new Promise(resolve => {
                const { h } = GuixuDOM;
                const input = h('input', { type: 'text', id: 'save-name-input', placeholder: '例如：突破金丹期', style: 'width: 100%; padding: 10px; background: rgba(0,0,0,0.5); border: 1px solid #8b7355; color: #e0dcd1; border-radius: 4px; font-size: 14px; margin-bottom: 15px;' });
                const confirmBtn = h('button', { 
                    id: 'save-name-confirm', 
                    className: 'interaction-btn primary-btn',
                    style: 'padding: 10px 8px; background: linear-gradient(45deg, #8b4513, #cd853f); border: 1px solid #daa520; color: #fff; border-radius: 5px; font-size: 12px; cursor: pointer;'
                }, ['确认']);
                const cancelBtn = h('button', { 
                    id: 'save-name-cancel', 
                    className: 'interaction-btn',
                    style: 'padding: 10px 8px; background: linear-gradient(45deg, #1a1a2e, #2d1b3d); border: 1px solid #c9aa71; border-radius: 5px; color: #c9aa71; font-size: 12px; cursor: pointer;'
                }, ['取消']);
                const modal = h('div', { className: 'modal-overlay', style: 'display: flex; z-index: 2000; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); justify-content: center; align-items: center;' }, [
                    h('div', { className: 'modal-content', style: 'background: rgba(26, 26, 46, 0.95); border: 1px solid #c9aa71; border-radius: 8px; padding: 20px; width: 400px; height: auto; box-shadow: 0 0 20px rgba(201, 170, 113, 0.3);' }, [
                        h('div', { className: 'modal-header', style: 'display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(201, 170, 113, 0.5); padding-bottom: 10px; margin-bottom: 15px;' }, [h('h2', { className: 'modal-title', style: 'font-size: 18px; color: #c9aa71; margin: 0;' }, ['存档命名'])]),
                        h('div', { className: 'modal-body', style: 'padding: 20px; color: #e0dcd1;' }, [
                            h('p', { style: 'margin-bottom: 15px; color: #c9aa71;' }, [`请为存档位 ${slotId.split('_')[1]} 输入一个名称：`]),
                            input,
                            h('div', { style: 'display: flex; gap: 10px; justify-content: flex-end;' }, [cancelBtn, confirmBtn])
                        ])
                    ])
                ]);
                GuixuDOM.$('.guixu-root-container').appendChild(modal);
                confirmBtn.onclick = () => {
                    const saveName = input.value.trim();
                    if (!saveName) { GuixuHelpers.showTemporaryMessage('请输入存档名称'); return; }
                    modal.remove();
                    resolve(saveName);
                };
                cancelBtn.onclick = () => { modal.remove(); resolve(null); };
                input.onkeypress = (e) => { if (e.key === 'Enter') confirmBtn.click(); };
                setTimeout(() => input.focus(), 100);
            });
        }
    };

    // 将服务挂载到 window 对象
    window.GuixuActionService = ActionService;

})(window);
