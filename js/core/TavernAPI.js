/**
 * 归墟 - 酒馆API封装
 * 挂载到 window.GuixuAPI
 */
(function (global) {
  'use strict';

  // 检查核心API是否存在
  if (typeof TavernHelper === 'undefined' || typeof getChatMessages === 'undefined') {
    console.error('[归墟] TavernAPI 模块无法初始化：缺少核心酒馆依赖。');
    return;
  }

  const API = {
    // 聊天记录
    getChatMessages: async (messageId) => getChatMessages(messageId),
    getCurrentMessageId: () => getCurrentMessageId(),
    // 门禁守卫调整：不再拦截任何对 stat_data 的写回；直接透传到酒馆
    setChatMessages: async (messages, options) => {
      try {
        // 为兼容旧逻辑保留封装，但不做任何删除 data 的操作
        return await TavernHelper.setChatMessages(messages, options);
      } catch (_) {
        return await TavernHelper.setChatMessages(messages, options);
      }
    },
 
    // AI生成
    generate: async (config) => TavernHelper.generate(config),

    // 世界书
    getLorebookEntries: async (bookName) => TavernHelper.getLorebookEntries(bookName),
    setLorebookEntries: async (bookName, entries) => TavernHelper.setLorebookEntries(bookName, entries),
    createLorebookEntries: async (bookName, entries) => TavernHelper.createLorebookEntries(bookName, entries),
    deleteLorebookEntries: async (bookName, uids) => TavernHelper.deleteLorebookEntries(bookName, uids),

    // 事件系统
    eventOn: (eventName, callback) => eventOn(eventName, callback),
    eventEmit: (eventName, ...args) => eventEmit(eventName, ...args),
    tavernEvents: () => tavern_events,

    // Lodash (如果需要)
    get lodash() {
      return global._;
    }
  };

  global.GuixuAPI = Object.freeze(API);

})(window);
