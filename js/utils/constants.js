/**
 * 归墟 - 全局常量
 * 挂载到 window.GuixuConstants
 */
(function (global) {
  'use strict';

  const Constants = {
    LOREBOOK: {
      NAME: '归墟（拼好卡）',
      ENTRIES: {
        JOURNEY: '本世历程',
        PAST_LIVES: '往世涟漪',
        NOVEL_MODE: '小说模式',
        CURRENT_SCENE: '当前场景',
      },
    },
    WAITING_MESSAGES: [
      '呜呜呜呜伟大的stone大人啊，请给你虔诚的信徒回复吧......',
      'stone大人，我们敬爱你口牙！！请给我回复吧！！',
      'stone大人正在回应你的请求，七个工作日给你回复',
      '正在向伟大stone祈祷......呜呜呜你快一点好不好'
    ],
    DEFAULT_TEXT: {
      EQUIP_SLOT_WEAPON: '武器',
      EQUIP_SLOT_ARMOR: '防具',
      EQUIP_SLOT_ACCESSORY: '饰品',
      EQUIP_SLOT_FABAO: '法宝',
      EQUIP_SLOT_GONGFA: '主修功法',
      EQUIP_SLOT_XINFA: '辅修心法',
    },
    TIERS: {
      // 天赋/灵根品阶
      凡品: 1, 下品: 2, 中品: 3, 上品: 4, 极品: 5, 天品: 6, 仙品: 7, 神品: 8,
      // 修仙境界
      练气: 1, 筑基: 2, 金丹: 3, 元婴: 4, 化神: 5, 合体: 6, 飞升: 7, 神桥: 8,
    },
    LOREBOOK_FIELDS: {
      JOURNEY: ['序号', '日期', '标题', '地点', '人物', '描述', '人物关系', '标签', '重要信息', '暗线与伏笔', '自动化系统'],
      PAST_LIVES: ['第x世', '事件脉络', '本世概述', '本世成就', '本世获得物品', '本世人物关系网', '死亡原因', '本世总结', '本世评价'],
    },
    // 前缀调整：新前缀采用【背景图片】，并保留旧版前缀兼容列表
    BACKGROUND: {
      PREFIX: '【背景图片】',
      LEGACY_PREFIXES: ['归墟背景/']
    },
  };

  // 冻结对象，防止意外修改
  const deepFreeze = (obj) => {
    Object.keys(obj).forEach(prop => {
      if (obj[prop] && typeof obj[prop] === 'object') {
        deepFreeze(obj[prop]);
      }
    });
    return Object.freeze(obj);
  };

  global.GuixuConstants = deepFreeze(Constants);

})(window);
