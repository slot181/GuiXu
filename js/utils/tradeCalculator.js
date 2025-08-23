/**
 * 归墟 - 交易价格计算工具
 * 基于对数压缩版交易面板公式
 */
(function (global) {
  'use strict';

  // 交易系统配置常量
  const TRADE_CONFIG = {
    // 品阶倍率 (r) - 根据constants.js中的TIERS映射
    TIER_MULTIPLIER: 1.45,
    
    // 价格调整参数
    ALPHA: 0.20,    // 买入加价率
    BETA: 0.35,     // 卖出折价率（提升折价，压低高品阶卖价）
    D0: 0.25,       // 买方折扣上限基准
    U0: 0.05,       // 卖方溢价上限基准（下调上限，限制高神海溢价）
    C: 0.5,         // 高阶弱化系数（加大弱化，抑制高阶涨幅）
    
    // 神海系统参数
    S0: 500,        // 神海对数压缩拐点
    ETA: 1.4,       // 卖出溢价放缓指数(>1，放缓溢价增长)
    SMAX: 2000000,  // 该周目预估神海上限
    TICK: 10,        // 价格最小计价单位
  };

  // 交易价格计算器
  const TradeCalculator = {
    
    // 数学/工具函数
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    
    // 四舍五入到最小计价单位
    roundToTick: (x, tick = TRADE_CONFIG.TICK) => Math.round(x / tick) * tick,
    
    // 根据品阶名称获取T值（品阶等级）- 使用修仙境界对应
    getTierLevel: (tierName) => {
      // 使用window.GuixuConstants中的TIERS映射（修仙境界）
      if (global.GuixuConstants && global.GuixuConstants.TIERS) {
        return global.GuixuConstants.TIERS[tierName] || 1;
      }
      
      // 备用映射 - 修仙境界对应品阶
      const tierMap = {
        '练气': 1, '筑基': 2, '金丹': 3, '元婴': 4,
        '化神': 5, '合体': 6, '飞升': 7, '神桥': 8
      };
      return tierMap[tierName] || 1;
    },
    
    // 可选安全校验（初始化时跑一次）
    validateConfig: () => {
      const { ALPHA, BETA, D0, U0 } = TRADE_CONFIG;
      return (1 + ALPHA) * (1 - D0) >= (1 - BETA) * (1 + U0);
    },
    
    /**
     * 主函数：计算交易价格
     * @param {number} P0 - 物品基础价格
     * @param {number|string} T - 物品品阶等级(1-8)或品阶名称
     * @param {number} S - 玩家当前神海数量
     * @returns {object} 包含买价、卖价、中间价等信息的对象
     */
    computeTradePrices: (P0, T, S) => {
      // 1) 输入保护
      if (P0 < 0) P0 = 0;
      
      // 如果T是字符串（品阶名称），转换为数字
      if (typeof T === 'string') {
        T = TradeCalculator.getTierLevel(T);
      }
      T = TradeCalculator.clamp(T, 1, 8);
      
      if (S < 0) S = 0;

      // 2) 中价（不含买卖加成）
      const g = Math.pow(TRADE_CONFIG.TIER_MULTIPLIER, T - 1);
      const Pmid = P0 * g;

      // 3) 神海压缩到[0,1]
      const denom = Math.log(1 + TRADE_CONFIG.SMAX / TRADE_CONFIG.S0);
      let S_norm;
      if (denom <= 0) {
        S_norm = 0;
      } else {
        S_norm = Math.log(1 + S / TRADE_CONFIG.S0) / denom;
      }
      S_norm = TradeCalculator.clamp(S_norm, 0, 1);

      // 4) 高阶弱化后的上限
      const Dmax = TRADE_CONFIG.D0 / (1 + TRADE_CONFIG.C * (T - 1));
      const Umax = TRADE_CONFIG.U0 / (1 + TRADE_CONFIG.C * (T - 1));

      // 5) 折扣/溢价
      const d = Dmax * S_norm;
      const u = Umax * Math.pow(S_norm, TRADE_CONFIG.ETA);

      // 6) 面板买卖价（先算原始，再按tick取整）
      const Pbuy_raw = Pmid * (1 + TRADE_CONFIG.ALPHA) * (1 - d);
      const Psell_raw = Pmid * (1 - TRADE_CONFIG.BETA) * (1 + u);

      let Pbuy = TradeCalculator.roundToTick(Pbuy_raw);
      let Psell = TradeCalculator.roundToTick(Psell_raw);

      // 7) 防套利钳制：确保买价 ≥ 卖价 + 1个tick
      if (Psell >= Pbuy) {
        Psell = Pbuy - TRADE_CONFIG.TICK;
        if (Psell < 0) Psell = 0; // 保底不为负
      }

      // 8) 返回结果与可选调试信息
      return {
        buy_price: Pbuy,      // NPC卖给玩家的价格（玩家买入价）
        sell_price: Psell,    // NPC从玩家买的价格（玩家卖出价）
        mid_price: TradeCalculator.roundToTick(Pmid),
        discount_d: d,        // 玩家买入折扣占比
        premium_u: u,         // 玩家卖出溢价占比
        S_norm: S_norm,       // 神海归一化值
        tier_multiplier: g,   // 品阶倍率
        base_price: P0        // 原始基础价格
      };
    },
    
    /**
     * 批量计算多个物品的价格
     * @param {Array} items - 物品数组，每个物品包含{base_value, tier}
     * @param {number} playerShenhai - 玩家神海
     * @returns {Array} 计算结果数组
     */
    batchCalculate: (items, playerShenhai) => {
      return items.map(item => {
        const basePrice = Number(item.base_value || 0);
        const tier = item.tier || '凡品';
        const result = TradeCalculator.computeTradePrices(basePrice, tier, playerShenhai);
        return {
          ...item,
          ...result
        };
      });
    },
    
    /**
     * 获取配置信息（用于调试）
     */
    getConfig: () => ({ ...TRADE_CONFIG }),
    
    /**
     * 示例计算（用于测试）
     */
    runExample: () => {
      console.log('=== 归墟交易价格计算示例 ===');
      
      // 假设玩家神海 S=560
      const playerShenhai = 560;
      
      // 玄元一气经（T=3，P0=50000）
      const example1 = TradeCalculator.computeTradePrices(50000, 3, playerShenhai);
      console.log('玄元一气经（金丹级，50000）:', example1);
      
      // 青锋剑（T=2，P0=800）
      const example2 = TradeCalculator.computeTradePrices(800, 2, playerShenhai);
      console.log('青锋剑（筑基级，800）:', example2);
      
      // 使用品阶名称
      const example3 = TradeCalculator.computeTradePrices(10000, '元婴', playerShenhai);
      console.log('元婴级物品（10000）:', example3);
      
      return { example1, example2, example3 };
    }
  };

  // 挂载到全局
  global.GuixuTradeCalculator = TradeCalculator;
  
  // 输出配置验证结果
  if (!TradeCalculator.validateConfig()) {
    console.warn('[归墟交易计算器] 配置验证失败，可能存在套利风险');
  }

})(window);
