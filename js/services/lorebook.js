// /js/services/lorebook.js
// 类脑/旅程梦星作品，禁止二传，禁止商业化，均无偿免费开源分享
(function (window) {
    'use strict';

    // 依赖检查
    if (!window.GuixuState || !window.GuixuHelpers || !window.GuixuAPI || !window.GuixuConstants) {
        console.error('LorebookService 依赖 GuixuState, GuixuHelpers, GuixuAPI, 和 GuixuConstants。');
        return;
    }

    const LorebookService = {
        /**
         * 向世界书写入内容的核心方法。
         * @param {string} baseEntryKey - 基础条目名 (例如, '本世历程', '往世涟漪').
         * @param {string} contentToWrite - 要写入的内容.
         * @param {boolean} silent - 是否显示临时消息.
         */
        async write(baseEntryKey, contentToWrite, silent = false) {
            if (!contentToWrite || contentToWrite.trim() === '') {
                if (!silent) GuixuHelpers.showTemporaryMessage('没有可写入的内容。');
                return;
            }

            const state = window.GuixuState.getState();
            const index = state.unifiedIndex;
            const finalEntryKey = index > 1 ? `${baseEntryKey}(${index})` : baseEntryKey;
            const bookName = GuixuConstants.LOREBOOK.NAME;
            
            try {
                const allEntries = await GuixuAPI.getLorebookEntries(bookName);
                let targetEntry = allEntries.find(entry => entry.comment === finalEntryKey);

                if (targetEntry) { // 条目已存在，追加内容
                    await this.appendToEntry(targetEntry, contentToWrite, baseEntryKey, silent);
                } else { // 条目不存在，创建新条目
                    await this.createNewEntry(bookName, allEntries, finalEntryKey, baseEntryKey, contentToWrite, silent);
                }

                // 更新状态变量以防轮询重复写入
                this.updateLastWrittenState(baseEntryKey, contentToWrite);

            } catch (error) {
                console.error(`写入世界书 "${finalEntryKey}" 时出错:`, error);
                if (!silent) GuixuHelpers.showTemporaryMessage(`写入失败: ${error.message}`);
            }
        },

        /**
         * 向已存在的条目追加内容。
         * @private
         */
        async appendToEntry(targetEntry, contentToWrite, baseEntryKey, silent, options = {}) {
            const bookName = GuixuConstants.LOREBOOK.NAME;
            const state = window.GuixuState.getState();
            
            let reformattedContent = this.reformatContent(contentToWrite, baseEntryKey);
            if (!reformattedContent) {
                 if (!silent) GuixuHelpers.showTemporaryMessage(`无法解析“${baseEntryKey}”的内容。`);
                 return;
            }

            const existingContent = targetEntry.content || '';
            if (this.isDuplicate(existingContent, reformattedContent, baseEntryKey)) {
                if (!silent) GuixuHelpers.showTemporaryMessage('内容已存在，无需重复写入。');
                return;
            }

            let updatedContent = existingContent + (existingContent ? '\n\n' : '') + reformattedContent;

            // 在合并内容后、写入之前执行修剪（允许强制开启）
            const forceTrim = options.forceAutoTrim === true;
            if (baseEntryKey === GuixuConstants.LOREBOOK.ENTRIES.JOURNEY && (state.isAutoTrimEnabled || forceTrim)) {
                console.log('[归墟] 自动修剪已开启，正在处理合并后的内容...');
                updatedContent = this.getTrimmedJourneyContent(updatedContent);
            }

            await GuixuAPI.setLorebookEntries(bookName, [{ uid: targetEntry.uid, content: updatedContent }]);
            if (!silent) GuixuHelpers.showTemporaryMessage(`已成功追加内容到“${targetEntry.comment}”。`);
        },

        /**
         * 创建新的世界书条目。
         * @private
         */
        async createNewEntry(bookName, allEntries, finalEntryKey, baseEntryKey, contentToWrite, silent) {
            if (!silent) GuixuHelpers.showTemporaryMessage(`条目 "${finalEntryKey}" 不存在，正在创建...`);
            
            let reformattedContent = this.reformatContent(contentToWrite, baseEntryKey);
             if (!reformattedContent) {
                 if (!silent) GuixuHelpers.showTemporaryMessage(`无法解析“${baseEntryKey}”的内容。`);
                 return;
            }

            const baseEntryTemplate = allEntries.find(entry => entry.comment === baseEntryKey);
            const newEntryData = {
                comment: finalEntryKey,
                content: reformattedContent,
                keys: baseEntryTemplate ? [...baseEntryTemplate.keys, finalEntryKey] : [finalEntryKey],
                enabled: false,
                ...(baseEntryTemplate ? { 
                    selective: baseEntryTemplate.selective, 
                    constant: baseEntryTemplate.constant, 
                    position: baseEntryTemplate.position, 
                    case_sensitive: baseEntryTemplate.case_sensitive 
                } : {})
            };
            await GuixuAPI.createLorebookEntries(bookName, [newEntryData]);
            if (!silent) GuixuHelpers.showTemporaryMessage(`已成功创建并写入到“${finalEntryKey}”。`);
        },

        /**
         * 格式化要写入的内容。
         * @private
         */
        reformatContent(content, baseEntryKey) {
            if (baseEntryKey === GuixuConstants.LOREBOOK.ENTRIES.JOURNEY || baseEntryKey === GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES) {
                const fields = baseEntryKey === GuixuConstants.LOREBOOK.ENTRIES.JOURNEY 
                    ? GuixuConstants.LOREBOOK_FIELDS.JOURNEY 
                    : GuixuConstants.LOREBOOK_FIELDS.PAST_LIVES;
                
                const parsedData = window.GuixuHelpers.parseJourneyEntry(content)[0] || {};
                if (Object.keys(parsedData).length === 0) return null;
                
                return fields.map(key => (parsedData[key] ? `${key}|${parsedData[key]}` : null)).filter(Boolean).join('\n');
            }
            return content.trim();
        },

        /**
         * 检查内容是否重复。
         * @private
         */
        isDuplicate(existingContent, newContent, baseEntryKey) {
            if (baseEntryKey === GuixuConstants.LOREBOOK.ENTRIES.JOURNEY) {
                const getSeq = (text) => {
                    if (!text) return null;
                    const match = text.match(/^序号\|(\d+)/);
                    return match ? match[1] : null;
                };
                const newEventSeq = getSeq(newContent);
                if (newEventSeq) {
                    const existingSequences = existingContent.split('\n\n').map(block => getSeq(block.trim())).filter(seq => seq !== null);
                    return existingSequences.includes(newEventSeq);
                }
            }
            return existingContent.includes(newContent.trim());
        },

        /**
         * 更新内存中的最后写入状态。
         * @private
         */
        updateLastWrittenState(baseEntryKey, content) {
            const state = window.GuixuState;
            switch(baseEntryKey) {
                case GuixuConstants.LOREBOOK.ENTRIES.JOURNEY:
                    state.update('lastWrittenJourney', content);
                    break;
                case GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES:
                    state.update('lastWrittenPastLives', content);
                    break;
                case GuixuConstants.LOREBOOK.ENTRIES.NOVEL_MODE:
                    state.update('lastWrittenNovelText', content);
                    break;
            }
        },

        /**
         * 修剪“本世历程”中的自动化系统内容。
         * @param {string} fullContent - 完整的“本世历程”内容。
         * @returns {string} 修剪后的内容。
         */
        getTrimmedJourneyContent(fullContent) {
            if (!fullContent) return fullContent;
            const events = window.GuixuHelpers.parseJourneyEntry(fullContent);
            if (events.length <= 2) {
                return fullContent; // 不需要修剪
            }

            let trimCount = 0;
            const updatedEvents = events.map((event, idx) => {
                // 保留最后两个事件的自动化信息
                if (idx < events.length - 2) {
                    if (event['自动化系统']) {
                        const newEvent = { ...event };
                        delete newEvent['自动化系统'];
                        trimCount++;
                        return newEvent;
                    }
                }
                return event;
            });

            if (trimCount === 0) {
                return fullContent; // 没有内容被改变
            }
            
            // 重构内容字符串
            return updatedEvents.map(event => {
                const lines = [];
                if (event['序号'] !== undefined) {
                    lines.push(`序号|${event['序号']}`);
                }
                for (const key in event) {
                    if (event.hasOwnProperty(key) && key !== '序号') {
                        lines.push(`${key}|${event[key]}`);
                    }
                }
                return lines.join('\n');
            }).join('\n\n');
        },

        /**
         * 自动开关世界书条目。
         * 兼容两种签名：
         *  - toggleLorebook(index:number, enabled:boolean)
         *  - toggleLorebook(enabled:boolean) // index 将取当前 state.unifiedIndex
         */
        async toggleLorebook(indexOrEnabled, maybeEnabled) {
            const state = window.GuixuState.getState();
            let enabled;
            let index;
            if (typeof indexOrEnabled === 'number') {
                index = indexOrEnabled;
                enabled = !!maybeEnabled;
            } else {
                enabled = !!indexOrEnabled;
                index = state.unifiedIndex;
            }

            const bookName = GuixuConstants.LOREBOOK.NAME;
            const baseKeys = [
                GuixuConstants.LOREBOOK.ENTRIES.JOURNEY,
                GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES,
                GuixuConstants.LOREBOOK.ENTRIES.NOVEL_MODE
            ];

            try {
                const allEntries = await GuixuAPI.getLorebookEntries(bookName);

                // 规则：
                // - 当 enabled === true：仅开启当前 index 的条目，其余相同基底条目的其它 index 一律关闭（实现“自动关闭上一序列”）
                // - 当 enabled === false：关闭当前 index 的条目（不动其它，通常用于总开关关闭）
                const updates = [];

                for (const entry of allEntries) {
                    const comment = entry.comment || '';
                    // 匹配是否属于我们管理的三个基底条目之一
                    const matchedBase = baseKeys.find(base => comment === base || comment.startsWith(`${base}(`));
                    if (!matchedBase) continue;

                    // 解析该条目的 index，未带 (n) 视为 index=1
                    let entryIndex = 1;
                    const match = comment.match(/\((\d+)\)$/);
                    if (match) entryIndex = parseInt(match[1], 10);

                    let desiredEnabled = entry.enabled;

                    if (enabled) {
                        // 仅当前 index 为开启，其它 index 必须关闭
                        desiredEnabled = (entryIndex === index);
                    } else {
                        // 仅关闭当前 index 的条目
                        if (entryIndex === index) desiredEnabled = false;
                    }

                    if (desiredEnabled !== entry.enabled) {
                        updates.push({ uid: entry.uid, enabled: desiredEnabled });
                    }
                }

                if (updates.length > 0) {
                    await GuixuAPI.setLorebookEntries(bookName, updates);
                    console.log(`[归墟] 自动开关世界书：已更新 ${updates.length} 个条目，目标状态 = ${enabled}（当前序号=${index}）`);
                }
            } catch (error) {
                console.error('自动开关世界书时出错:', error);
            }
        },

        /**
         * 备份当前激活的世界书条目内容到新的存档专用条目中。
         */
        async backupActiveLore(saveJourneyEntryName, savePastLivesEntryName, activeIndex) {
            const bookName = GuixuConstants.LOREBOOK.NAME;
            const journeyKey = activeIndex > 1 ? `${GuixuConstants.LOREBOOK.ENTRIES.JOURNEY}(${activeIndex})` : GuixuConstants.LOREBOOK.ENTRIES.JOURNEY;
            const pastLivesKey = activeIndex > 1 ? `${GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES}(${activeIndex})` : GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES;

            try {
                const allEntries = await GuixuAPI.getLorebookEntries(bookName);
                const journeyEntry = allEntries.find(entry => entry.comment === journeyKey);
                const pastLivesEntry = allEntries.find(entry => entry.comment === pastLivesKey);

                const entriesToCreate = [
                    {
                        comment: saveJourneyEntryName,
                        content: journeyEntry?.content || '',
                        keys: [saveJourneyEntryName],
                        enabled: false,
                        position: 'before_character_definition',
                        order: 20
                    },
                    {
                        comment: savePastLivesEntryName,
                        content: pastLivesEntry?.content || '',
                        keys: [savePastLivesEntryName],
                        enabled: false,
                        position: 'before_character_definition',
                        order: 19
                    }
                ];

                await GuixuAPI.createLorebookEntries(bookName, entriesToCreate);
                console.log(`[归墟存档] 已成功备份当前历程和涟漪到新的世界书条目。`);
                return { journey_entry_name: saveJourneyEntryName, past_lives_entry_name: savePastLivesEntryName };
            } catch (error) {
                console.error('备份世界书时出错:', error);
                throw new Error('备份世界书失败。');
            }
        },
        /**
         * 从备份条目恢复到激活条目（覆盖当前激活条目的内容）。
         * @param {{journey_entry_name:string, past_lives_entry_name:string}} backupNames
         * @param {number} activeIndex
         */
        async restoreActiveLore(backupNames, activeIndex) {
            const bookName = GuixuConstants.LOREBOOK.NAME;
            const journeyKey = activeIndex > 1 ? `${GuixuConstants.LOREBOOK.ENTRIES.JOURNEY}(${activeIndex})` : GuixuConstants.LOREBOOK.ENTRIES.JOURNEY;
            const pastLivesKey = activeIndex > 1 ? `${GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES}(${activeIndex})` : GuixuConstants.LOREBOOK.ENTRIES.PAST_LIVES;

            const allEntries = await GuixuAPI.getLorebookEntries(bookName);

            const backupJourney = allEntries.find(e => e.comment === backupNames.journey_entry_name);
            const backupPast = allEntries.find(e => e.comment === backupNames.past_lives_entry_name);

            const activeJourney = allEntries.find(e => e.comment === journeyKey);
            const activePast = allEntries.find(e => e.comment === pastLivesKey);

            const updates = [];
            if (activeJourney) {
                updates.push({ uid: activeJourney.uid, content: backupJourney?.content || '' });
            } else {
                await GuixuAPI.createLorebookEntries(bookName, [{
                    comment: journeyKey,
                    content: backupJourney?.content || '',
                    keys: [journeyKey],
                    enabled: false,
                    position: 'before_character_definition',
                    order: 20
                }]);
            }

            if (activePast) {
                updates.push({ uid: activePast.uid, content: backupPast?.content || '' });
            } else {
                await GuixuAPI.createLorebookEntries(bookName, [{
                    comment: pastLivesKey,
                    content: backupPast?.content || '',
                    keys: [pastLivesKey],
                    enabled: false,
                    position: 'before_character_definition',
                    order: 19
                }]);
            }

            if (updates.length > 0) {
                await GuixuAPI.setLorebookEntries(bookName, updates);
            }
        },

        /**
         * 兼容旧调用：writeToLorebook(baseEntryKey, content, index, autoTrimEnabled, silent)
         * 若提供 index/autoTrimEnabled，则按提供的参数执行；否则回落到当前状态。
         */
        async writeToLorebook(baseEntryKey, contentToWrite, index = null, autoTrimEnabled = null, silent = false) {
            if (!contentToWrite || contentToWrite.trim() === '') {
                if (!silent) GuixuHelpers.showTemporaryMessage('没有可写入的内容。');
                return;
            }
            const state = window.GuixuState.getState();
            const useIndex = (typeof index === 'number' && index > 0) ? index : state.unifiedIndex;
            const finalEntryKey = useIndex > 1 ? `${baseEntryKey}(${useIndex})` : baseEntryKey;
            const bookName = GuixuConstants.LOREBOOK.NAME;

            try {
                const allEntries = await GuixuAPI.getLorebookEntries(bookName);
                let targetEntry = allEntries.find(entry => entry.comment === finalEntryKey);

                if (targetEntry) {
                    await this.appendToEntry(targetEntry, contentToWrite, baseEntryKey, silent, { forceAutoTrim: autoTrimEnabled === true });
                } else {
                    await this.createNewEntry(bookName, allEntries, finalEntryKey, baseEntryKey, contentToWrite, silent);
                }
                this.updateLastWrittenState(baseEntryKey, contentToWrite);
            } catch (error) {
                console.error(`写入世界书 "${finalEntryKey}" 时出错:`, error);
                if (!silent) GuixuHelpers.showTemporaryMessage(`写入失败: ${error.message}`);
            }
        }
        ,

        /**
         * 将提取的角色卡内容写入一个固定条目（带统一索引）。
         */
        async writeCharacterCard(content) {
            if (!content || !content.trim()) {
                GuixuHelpers.showTemporaryMessage('没有可写入的角色卡内容。');
                return;
            }
            const state = window.GuixuState.getState();
            const index = state.unifiedIndex;
            const entry = index > 1 ? `提取角色(${index})` : '提取角色';
            return this.write(entry, content, false);
        }
    };

    // 将服务挂载到 window 对象
    window.GuixuLorebookService = LorebookService;

})(window);
