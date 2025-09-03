(function (window) {
  'use strict';

  const GuixuState = {
    // --- 核心动态数据 ---
    equippedItems: {
      wuqi: null,
      fangju: null,
      shipin: null,
      fabao1: null,
      zhuxiuGongfa: null,
      fuxiuXinfa: null,
    },
    currentMvuState: null, // 缓存最新的完整mvu状态
    prevRoundMvuState: null, // 上一轮开始前的MVU快照（用于重掷恢复）
    prevRoundMessageContent: '', // 上一轮开始前的楼层正文快照（用于重掷恢复）
    pendingActions: [], // 指令队列/购物车
    equipSwapBuffer: {}, // 本轮会话内的槽位临时回退缓存：slotKey -> 之前的装备对象
    // 交易违规计数（会话级/可持久化）：key -> attempts
    tradeAbuseCounters: {},

    // --- 从MVU加载的原始数据 ---
    baseAttributes: {}, // 基础属性
    
    // --- 计算衍生的数据 ---
    calculatedMaxAttributes: {}, // 计算后的属性上限

    // --- AI响应提取内容缓存 ---
    lastExtractedJourney: null,
    lastExtractedPastLives: null,
    lastExtractedNovelText: null,
    lastExtractedCharacterCard: null,
    lastExtractedVariables: null,
    lastExtractedThinking: '',
    lastActionGuidelines: [],
    
    // --- 写入世界书状态追踪 ---
    lastWrittenJourney: null,
    lastWrittenPastLives: null,
    lastWrittenNovelText: null,

    // --- 用户输入与配置 ---
    lastSentPrompt: null,
    isNovelModeEnabled: false,
    isAutoWriteEnabled: true,
    isMobileView: false,
    unifiedIndex: 1,
    isAutoToggleLorebookEnabled: false,
    isAutoSaveEnabled: false,
    autoWritePaused: false,
    isAutoTrimEnabled: false,
    isStreamingEnabled: false,
    currencyUnit: '下品灵石',
    userPreferences: {
      backgroundUrl: '',
      bgMaskOpacity: 0.7,
      storyFontSize: 14,
      bgFitMode: 'cover'
    },

    // --- 计时器ID ---
    autoWriteIntervalId: null,
    novelModeAutoWriteIntervalId: null,
    autoToggleIntervalId: null,
    autoSaveIntervalId: null,

    // --- 初始化方法 ---
    // 从localStorage加载状态
    load() {
      this.loadStateFromStorage('guixu_equipped_items', 'equippedItems', {});
      this.loadStateFromStorage('guixu_pending_actions', 'pendingActions', []);
      this.loadStateFromStorage('guixu_trade_abuse_counters', 'tradeAbuseCounters', {});
      this.loadStateFromStorage('guixu_auto_write_enabled', 'isAutoWriteEnabled', true);
      this.loadStateFromStorage('guixu_novel_mode_enabled', 'isNovelModeEnabled', false);
      this.loadStateFromStorage('guixu_view_mode', 'isMobileView', false, (val) => val === 'mobile');
      this.loadStateFromStorage('guixu_unified_index', 'unifiedIndex', 1, parseInt);
      this.loadStateFromStorage('guixu_auto_toggle_enabled', 'isAutoToggleLorebookEnabled', false);
      this.loadStateFromStorage('guixu_auto_save_enabled', 'isAutoSaveEnabled', false);
      this.loadStateFromStorage('guixu_auto_trim_enabled', 'isAutoTrimEnabled', false);
      this.loadStateFromStorage('guixu_streaming_enabled', 'isStreamingEnabled', false);
      this.loadStateFromStorage('guixu_user_preferences', 'userPreferences', { backgroundUrl: '', bgMaskOpacity: 0.7, storyFontSize: 14, bgFitMode: 'cover' });
      this.loadStateFromStorage('guixu_currency_unit', 'currencyUnit', '下品灵石');
      this.loadStateFromStorage('guixu_action_guidelines', 'lastActionGuidelines', []);
      this.loadStateFromStorage('guixu_last_thinking', 'lastExtractedThinking', '');

      // 类型归一化
      if (!Array.isArray(this.lastActionGuidelines)) this.lastActionGuidelines = [];
      if (typeof this.lastExtractedThinking !== 'string') this.lastExtractedThinking = '';
      if (typeof this.currencyUnit !== 'string') this.currencyUnit = '下品灵石';
    },

    // --- 状态存取辅助函数 ---
    loadStateFromStorage(key, stateProperty, defaultValue, parser = null) {
      try {
        const savedValue = localStorage.getItem(key);
        if (savedValue !== null) {
          let value = JSON.parse(savedValue);
          if (parser) {
            value = parser(value);
          }
          this[stateProperty] = value;
        } else {
          this[stateProperty] = defaultValue;
        }
      } catch (e) {
        console.error(`加载状态 "${key}" 失败:`, e);
        this[stateProperty] = defaultValue;
      }
    },

    saveStateToStorage(key, stateProperty) {
      try {
        localStorage.setItem(key, JSON.stringify(this[stateProperty]));
      } catch (e) {
        console.error(`保存状态 "${key}" 失败:`, e);
      }
    },

    /**
     * 规范化并去重“指令队列”（pendingActions）
     * 规则更新：
     * - equip/unequip：对同一 (itemName,category) 按顺序成对抵消（如先装备后卸下 => 两条均清除；反复切换仅保留最后的净效果）
     * - use/discard：按 (action,itemName[,category]) 聚合数量求和
     * - 保持整体相对顺序尽可能稳定（以首次出现位置为基准）
     */
    normalizePendingActions(actions) {
      try {
        const arr = Array.isArray(actions) ? actions : [];

        // 1) 聚合 use/discard
        const aggMap = new Map(); // sig -> obj
        const aggOrder = [];      // {sig,index}
        const sigOf = (a) => {
          const name = a?.itemName || a?.name || '';
          const category = a?.category || '';
          if (a?.action === 'use') return `use|${name}`;
          if (a?.action === 'discard') return `discard|${name}|${category}`;
          return '';
        };

        // 2) equip/unequip 抵消栈
        const keyOfEquip = (a) => {
          const name = a?.itemName || a?.name || '';
          const category = a?.category || '';
          return `${name}|${category}`;
        };
        const stacks = new Map();   // key -> [{action,obj}]
        const firstIndex = new Map(); // key -> first index

        // 3) 其它动作直通（保持位置）
        const passthrough = [];

        for (let i = 0; i < arr.length; i++) {
          const a = arr[i];
          if (!a || typeof a !== 'object') continue;
          const act = a.action;

          if (act === 'use' || act === 'discard') {
            const sig = sigOf(a);
            if (!aggMap.has(sig)) {
              aggMap.set(sig, { ...a, quantity: Number(a.quantity) || 1 });
              aggOrder.push({ sig, index: i });
            } else {
              const obj = aggMap.get(sig);
              obj.quantity = (Number(obj.quantity) || 0) + (Number(a.quantity) || 1);
            }
            continue;
          }

          if (act === 'equip' || act === 'unequip') {
            const key = keyOfEquip(a);
            if (!stacks.has(key)) {
              stacks.set(key, []);
              firstIndex.set(key, i);
            }
            const stack = stacks.get(key);
            if (stack.length > 0 && stack[stack.length - 1].action !== act) {
              // 相邻相反动作抵消（等价于撤销）
              stack.pop();
            } else {
              stack.push({ action: act, obj: { ...a } });
            }
            continue;
          }

          // 未知/其它动作：保底直通
          passthrough.push({ obj: { ...a }, index: i });
        }

        // 汇总 equip/unequip 净效果
        const equipUnequipNet = [];
        for (const [key, stack] of stacks.entries()) {
          const idx = firstIndex.get(key);
          stack.forEach(entry => equipUnequipNet.push({ obj: entry.obj, index: idx }));
        }

        // 汇总 use/discard
        const useDiscardList = aggOrder.map(({ sig, index }) => ({ obj: aggMap.get(sig), index }));

        // 合并并按 index 恢复顺序
        const merged = [...useDiscardList, ...equipUnequipNet, ...passthrough]
          .sort((a, b) => a.index - b.index)
          .map(e => e.obj);

        return merged;
      } catch (e) {
        console.warn('[归墟] normalizePendingActions 失败:', e);
        return Array.isArray(actions) ? actions : [];
      }
    },

    // --- 暴露给全局的接口 ---
    getState() {
      return this;
    },
    
    // 更新并保存状态的便捷方法
    update(key, value) {
        if (this.hasOwnProperty(key)) {
            if (key === 'pendingActions') {
                value = this.normalizePendingActions(Array.isArray(value) ? value : []);
            }
            // 新增：当修改世界书读写序号时，将门禁相关缓存从旧序号迁移到新序号，避免被误判为“首轮”从而触发门禁重置
            if (key === 'unifiedIndex') {
                try {
                    const oldIdx = Number(this.unifiedIndex) || 1;   // 变更前的序号
                    const newIdx = Number(value) || 1;               // 即将设置的新序号
                    if (newIdx !== oldIdx) {
                        // 1) “已解锁”标记：若旧序号已解锁，则新序号也视为已解锁
                        try {
                            const v = localStorage.getItem(`guixu_gate_unblocked_${oldIdx}`);
                            if (v === '1') localStorage.setItem(`guixu_gate_unblocked_${newIdx}`, '1');
                        } catch (_) {}
                        // 2) “gametxt 已捕捉”标记：若旧序号已捕捉正文，则新序号继承，避免再次被判定为首轮
                        try {
                            const v2 = localStorage.getItem(`guixu_gate_gametxt_seen_${oldIdx}`);
                            if (v2 === '1') localStorage.setItem(`guixu_gate_gametxt_seen_${newIdx}`, '1');
                        } catch (_) {}
                        // 3) “首轮自动一次刷新”标记：若旧序号已执行过一次自动刷新，避免新序号再次触发
                        try {
                            const v3 = sessionStorage.getItem(`guixu_gate_auto_refreshed_${oldIdx}`);
                            if (v3 === '1') sessionStorage.setItem(`guixu_gate_auto_refreshed_${newIdx}`, '1');
                        } catch (_) {}
                    }
                } catch (_) {}
            }
            this[key] = value;
            // 根据key决定对应的localStorage键名并保存
            const storageMap = {
                equippedItems: 'guixu_equipped_items',
                pendingActions: 'guixu_pending_actions',
                isAutoWriteEnabled: 'guixu_auto_write_enabled',
                isNovelModeEnabled: 'guixu_novel_mode_enabled',
                isMobileView: 'guixu_view_mode',
                unifiedIndex: 'guixu_unified_index',
                isAutoToggleLorebookEnabled: 'guixu_auto_toggle_enabled',
                isAutoSaveEnabled: 'guixu_auto_save_enabled',
                isAutoTrimEnabled: 'guixu_auto_trim_enabled',
                tradeAbuseCounters: 'guixu_trade_abuse_counters',
                userPreferences: 'guixu_user_preferences',
                isStreamingEnabled: 'guixu_streaming_enabled',
                currencyUnit: 'guixu_currency_unit',
                lastActionGuidelines: 'guixu_action_guidelines',
                lastExtractedThinking: 'guixu_last_thinking',
            };
            if (storageMap[key]) {
                let valueToStore = value;
                if (key === 'isMobileView') {
                    valueToStore = value ? 'mobile' : 'desktop';
                }
                localStorage.setItem(storageMap[key], JSON.stringify(valueToStore));
            }
            // 广播状态变更事件：用于触发UI实时刷新（避免手动调用）
            try {
                // 通用状态变更
                document.dispatchEvent(new CustomEvent('guixu:stateChanged', { detail: { key, value } }));
                // MVU 完整状态变更 -> 携带 stat_data
                if (key === 'currentMvuState') {
                    const stat = (value && value.stat_data) ? value.stat_data : (this.currentMvuState && this.currentMvuState.stat_data) || null;
                    document.dispatchEvent(new CustomEvent('guixu:mvuChanged', { detail: { stat_data: stat } }));
                }
                // 装备槽位本地状态变更（equippedItems）
                if (key === 'equippedItems') {
                    document.dispatchEvent(new CustomEvent('guixu:equippedChanged', { detail: { equippedItems: value } }));
                }
            } catch (e) {
                console.warn('[归墟] 派发状态变更事件失败:', e);
            }
        } else {
            console.warn(`GuixuState 中不存在键: ${key}`);
        }
    },

    // --- 轮询服务 ---
    startAutoWritePolling() {
      this.stopAutoWritePolling();
      if (!this.isAutoWriteEnabled) return;
      console.log('[归墟] 启动自动写入轮询 (5秒)...');
      this.autoWriteIntervalId = setInterval(async () => {
        try {
          if (this.autoWritePaused) return;
          if (this.lastExtractedJourney && this.lastExtractedJourney !== this.lastWrittenJourney) {
            await window.GuixuLorebookService.writeToLorebook('本世历程', this.lastExtractedJourney, this.unifiedIndex, this.isAutoTrimEnabled, true);
            this.update('lastWrittenJourney', this.lastExtractedJourney);
          }
          if (this.lastExtractedPastLives && this.lastExtractedPastLives !== this.lastWrittenPastLives) {
            await window.GuixuLorebookService.writeToLorebook('往世涟漪', this.lastExtractedPastLives, this.unifiedIndex, false, true);
            this.update('lastWrittenPastLives', this.lastExtractedPastLives);
          }
        } catch (e) {
          console.warn('[归墟] 自动写入轮询异常:', e);
        }
      }, 5000);
    },

    stopAutoWritePolling() {
      if (this.autoWriteIntervalId) {
        clearInterval(this.autoWriteIntervalId);
        this.autoWriteIntervalId = null;
        console.log('[归墟] 停止自动写入轮询。');
      }
    },

    startNovelModeAutoWritePolling() {
        this.stopNovelModeAutoWritePolling();
        if (!this.isNovelModeEnabled) return;
        console.log('[归墟] 启动小说模式自动写入轮询 (5秒)...');
        this.novelModeAutoWriteIntervalId = setInterval(async () => {
            if (this.lastExtractedNovelText && this.lastExtractedNovelText !== this.lastWrittenNovelText) {
                await window.GuixuLorebookService.writeToLorebook('小说模式', this.lastExtractedNovelText, this.unifiedIndex, false, true);
                this.update('lastWrittenNovelText', this.lastExtractedNovelText);
            }
        }, 5000);
    },

    stopNovelModeAutoWritePolling() {
        if (this.novelModeAutoWriteIntervalId) {
            clearInterval(this.novelModeAutoWriteIntervalId);
            this.novelModeAutoWriteIntervalId = null;
            console.log('[归墟] 停止小说模式自动写入轮询。');
        }
    },

    startAutoTogglePolling() {
        this.stopAutoTogglePolling();
        if (!this.isAutoToggleLorebookEnabled) return;
        console.log('[归墟] 启动世界书自动开关轮询 (2秒)...');
        this.autoToggleIntervalId = setInterval(async () => {
            await window.GuixuLorebookService.toggleLorebook(this.unifiedIndex, true);
        }, 2000);
    },

    stopAutoTogglePolling() {
        if (this.autoToggleIntervalId) {
            clearInterval(this.autoToggleIntervalId);
            this.autoToggleIntervalId = null;
            console.log('[归墟] 停止世界书自动开关轮询。');
        }
    },

    startAutoSavePolling() {
        this.stopAutoSavePolling();
        if (!this.isAutoSaveEnabled) return;
        console.log('[归墟] 启动自动存档轮询 (10秒)...');
        this.autoSaveIntervalId = setInterval(() => {
            this.performAutoSave();
        }, 10000);
    },

    stopAutoSavePolling() {
        if (this.autoSaveIntervalId) {
            clearInterval(this.autoSaveIntervalId);
            this.autoSaveIntervalId = null;
            console.log('[归墟] 停止自动存档轮询。');
        }
    },

    async performAutoSave() {
        console.log('[归墟] 检查是否需要自动存档...');
        if (!this.currentMvuState) {
          console.warn('[归墟] 自动存档跳过：无法获取当前mvu状态。');
          return;
        }

        try {
          const allSaves = await window.GuixuActionService.getSavesFromStorage();
          const slot0 = allSaves['auto_save_slot_0'];

          // 仅在对话内容发生变化时才进行自动存档（避免装备/卸下等UI变量改动触发自动存档轮换）
          const currentMessageContent = (await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId()))?.[0]?.message || '';
          if (slot0 && slot0.message_content === currentMessageContent) {
            console.log('[归墟] 自动存档跳过：对话未变化（仅变量或UI变更）。');
            return;
          }

          if (slot0) {
            const currentStateString = JSON.stringify(this.currentMvuState.stat_data);
            const latestSaveStateString = JSON.stringify(slot0.mvu_data.stat_data);
            if (currentStateString === latestSaveStateString) {
              console.log('[归墟] 自动存档跳过：游戏状态自上次自动存档以来未发生变化。');
              return;
            }
          }

          console.log('[归墟] 状态已改变，执行双缓冲自动存档...');

          if (slot0) {
            const oldSlot1 = allSaves['auto_save_slot_1'];
            if (oldSlot1) {
              await this.deleteLorebookBackup(oldSlot1);
            }
            const newSlot1SaveName = `自动存档(上一次) - ${new Date(slot0.timestamp).toLocaleString('sv-SE')}`;
            await this.renameLorebookEntry(slot0.lorebook_entries.journey_entry_name, `${newSlot1SaveName}-本世历程`);
            await this.renameLorebookEntry(slot0.lorebook_entries.past_lives_entry_name, `${newSlot1SaveName}-往世涟漪`);
            slot0.save_name = newSlot1SaveName;
            slot0.lorebook_entries.journey_entry_name = `${newSlot1SaveName}-本世历程`;
            slot0.lorebook_entries.past_lives_entry_name = `${newSlot1SaveName}-往世涟漪`;
            allSaves['auto_save_slot_1'] = slot0;
            await window.GuixuActionService._upsertSaveEntry('auto_save_slot_1', slot0);
          }

          const newSaveName = `自动存档(最新) - ${new Date().toLocaleString('sv-SE')}`;
          
          const lorebookEntries = {
            journey_entry_name: `${newSaveName}-本世历程`,
            past_lives_entry_name: `${newSaveName}-往世涟漪`
          };

          await window.GuixuLorebookService.backupActiveLore(lorebookEntries.journey_entry_name, lorebookEntries.past_lives_entry_name, this.unifiedIndex);

          const saveDataPayload = {
            timestamp: new Date().toISOString(),
            save_name: newSaveName,
            message_content: currentMessageContent,
            lorebook_entries: lorebookEntries,
            mvu_data: this.currentMvuState,
            unified_index: this.unifiedIndex
          };

          allSaves['auto_save_slot_0'] = saveDataPayload;
          await window.GuixuActionService._upsertSaveEntry('auto_save_slot_0', saveDataPayload);
          
          window.GuixuHelpers.showTemporaryMessage(`已自动存档`);
          if (document.getElementById('save-load-modal')?.style.display === 'flex') {
            window.GuixuActionService?.showSaveLoadManager?.();
          }
        } catch (error) {
          console.error('自动存档失败:', error);
          window.GuixuHelpers.showTemporaryMessage(`自动存档失败: ${error.message}`);
        }
    },
    
    async renameLorebookEntry(oldName, newName) {
        if (!oldName || !newName || oldName === newName) return;
        const bookName = window.GuixuConstants.LOREBOOK.NAME;
        try {
            const allEntries = await window.GuixuAPI.getLorebookEntries(bookName);
            const oldEntry = allEntries.find(e => e.comment === oldName);
            if (!oldEntry) {
                console.warn(`[重命名] 未找到旧条目: ${oldName}`);
                return;
            }
            const newEntryData = { ...oldEntry };
            delete newEntryData.uid;
            newEntryData.comment = newName;
            newEntryData.keys = [newName];
            await window.GuixuAPI.createLorebookEntries(bookName, [newEntryData]);
            await window.GuixuAPI.deleteLorebookEntries(bookName, [oldEntry.uid]);
            console.log(`[重命名] 成功将 "${oldName}" 重命名为 "${newName}"`);
        } catch (error) {
            console.error(`重命名世界书条目从 "${oldName}" 到 "${newName}" 时失败:`, error);
            throw new Error(`重命名世界书条目失败: ${error.message}`);
        }
    },

    async deleteLorebookBackup(saveData) {
        if (!saveData || !saveData.lorebook_entries) return;
        const bookName = window.GuixuConstants.LOREBOOK.NAME;
        const { journey_entry_name, past_lives_entry_name } = saveData.lorebook_entries;
        try {
            const allEntries = await window.GuixuAPI.getLorebookEntries(bookName);
            const entriesToDelete = [];
            const journeyEntry = allEntries.find(e => e.comment === journey_entry_name);
            if (journeyEntry) entriesToDelete.push(journeyEntry.uid);
            const pastLivesEntry = allEntries.find(e => e.comment === past_lives_entry_name);
            if (pastLivesEntry) entriesToDelete.push(pastLivesEntry.uid);
            if (entriesToDelete.length > 0) {
                await window.GuixuAPI.deleteLorebookEntries(bookName, entriesToDelete);
                console.log(`[归墟删除] 已删除 ${entriesToDelete.length} 个关联的世界书条目。`);
            }
        } catch (error) {
            console.error('删除关联的世界书条目时出错:', error);
            window.GuixuHelpers.showTemporaryMessage('警告：删除关联的世界书条目失败。');
        }
    },

    /**
     * 删除指定世界序号的所有“本世历程/往世涟漪”激活条目。
     * - index=1: 删除“本世历程”“往世涟漪”
     * - index>1: 删除“本世历程(index)”“往世涟漪(index)”
     */
    async deleteWorldLoreForIndex(index) {
        try {
            const bookName = window.GuixuConstants.LOREBOOK.NAME;
            const baseJourney = window.GuixuConstants.LOREBOOK.ENTRIES.JOURNEY;
            const basePast = window.GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES;
            const allEntries = await window.GuixuAPI.getLorebookEntries(bookName);
            const targets = new Set();

            const matchComment = (comment, base, idx) => {
                if (idx > 1) return comment === `${base}(${idx})`;
                return comment === base;
            };

            for (const entry of allEntries) {
                const comment = String(entry.comment || '');
                if (matchComment(comment, baseJourney, Number(index) || 1) || matchComment(comment, basePast, Number(index) || 1)) {
                    targets.add(entry.uid);
                }
            }

            if (targets.size > 0) {
                await window.GuixuAPI.deleteLorebookEntries(bookName, Array.from(targets));
                console.log(`[归墟删除] 已清除世界序号 ${index || 1} 的本世历程/往世涟漪激活条目，共 ${targets.size} 条。`);
            }
        } catch (error) {
            console.error('删除指定世界序号的世界书条目时出错:', error);
            window.GuixuHelpers.showTemporaryMessage('警告：删除世界书激活条目失败。');
        }
    }
  };

  // 初始化时加载所有状态
  GuixuState.load();

  // 将状态管理器挂载到 window 对象
  window.GuixuState = GuixuState;

})(window);
