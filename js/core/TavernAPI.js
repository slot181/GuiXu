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
    setChatMessages: async (messages, options) => TavernHelper.setChatMessages(messages, options),

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
