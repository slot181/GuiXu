/**
 * 归墟 - 通用辅助函数
 * 挂载到 window.GuixuHelpers
 */
(function (global) {
  'use strict';

  const Constants = global.GuixuConstants;
  if (!Constants) {
    console.error('[归墟] Helpers 模块无法初始化：缺少核心依赖（Constants）。');
    return;
  }

  const Helpers = {
    /**
     * 安全地从嵌套对象中获取值。
     * @param {object} obj - 目标对象.
     * @param {string|string[]} path - 访问路径.
     * @param {*} [defaultValue='N/A'] - 未找到时的默认值.
     * @returns {*} 获取到的值或默认值.
     */
    SafeGetValue(obj, path, defaultValue = 'N/A') {
      // 兼容新旧两种MVU路径：
      // - 旧：点路径 + 末尾 ".0" 表示数组首元素
      // - 新：对象/列表对象（{$meta:{extensible:true}, ...}）
      try {
        const tryResolve = (root, keys) => {
          let cur = root;
          for (let i = 0; i < keys.length; i++) {
            if (
              cur === undefined ||
              cur === null ||
              typeof cur !== 'object' ||
              !Object.prototype.hasOwnProperty.call(cur, keys[i])
            ) {
              return { found: false, value: undefined };
            }
            cur = cur[keys[i]];
          }
          return { found: true, value: cur };
        };

        const toScalar = (val) => {
          if (val === undefined || val === null) return defaultValue;
          if (Array.isArray(val)) {
            if (val.length === 0) return defaultValue;
            const first = val[0];
            if (typeof first === 'boolean') return first;
            return String(first);
          }
          if (typeof val === 'boolean') return val;
          if (typeof val === 'object') {
            // 兼容：对象字典（无论是否带 $meta）
            const entries = Object.keys(val)
              .filter(k => k !== '$meta' && k !== '$__META_EXTENSIBLE__$')
              .map(k => val[k]);
            if (entries.length > 0) {
              let first = entries[0];
              // 尝试解析字符串化 JSON
              if (typeof first === 'string') {
                try { first = JSON.parse(first); } catch (_) {}
              }
              if (typeof first === 'boolean') return first;
              if (first == null) return defaultValue;
              return typeof first === 'object' ? JSON.stringify(first) : String(first);
            }
            // 非字典对象，字符串化返回
            try { return JSON.stringify(val); } catch { return String(val); }
          }
          return String(val);
        };

        const rawPath = Array.isArray(path) ? path : String(path).split('.');
        // 尝试原路径
        let r = tryResolve(obj, rawPath);
        if (r.found) return toScalar(r.value);

        // 若末尾为 “.0”，尝试去掉末尾的 0 再取（新对象结构的容错）
        if (rawPath.length && rawPath[rawPath.length - 1] === '0') {
          const alt = rawPath.slice(0, -1);
          r = tryResolve(obj, alt);
          if (r.found) return toScalar(r.value);
        }
        return defaultValue;
      } catch (_) {
        return defaultValue;
      }
    },

    /**
     * 读取“列表”字段为数组视图（兼容旧数组包装与新对象字典）
     * - 旧：stat[key] 为数组包装，实际数组在 [0]
     * - 新：stat[key] 为对象字典（含 $meta:{extensible:true}）
     *   - 返回值为 values()，并且保留条目键：
     *     · 若条目缺少 name，则自动注入 name=字典键
     *     · 总是附加 __key=字典键，供需要时使用（不破坏旧用法）
     */
    readList(stat, key) {
      try {
        const v = stat && stat[key];
        // 旧：数组包装 -> 取第0项数组，并过滤占位符
        if (Array.isArray(v)) {
          const arr = v[0] || [];
          return Array.isArray(arr) ? arr.filter(x => x !== '$__META_EXTENSIBLE__$') : [];
        }
        // 新：对象字典（兼容是否存在 $meta）
        if (v && typeof v === 'object') {
          return Object.keys(v)
            .filter(k => k !== '$meta' && k !== '$__META_EXTENSIBLE__$')
            .map(k => {
              let val = v[k];
              // 尝试解析字符串化 JSON
              if (typeof val === 'string') {
                try { val = JSON.parse(val); } catch (_) {}
              }
              // 对象型条目注入 name/__key
              if (val && typeof val === 'object') {
                const out = Array.isArray(val) ? val.slice() : { ...val };
                try {
                  if (!Object.prototype.hasOwnProperty.call(out, 'name') || out.name == null || out.name === '' || out.name === 'N/A') {
                    out.name = k;
                  }
                } catch (_) {}
                try { out.__key = k; } catch (_) {}
                return out;
              }
              return val;
            });
        }
        return [];
      } catch (_) {
        return [];
      }
    },

    /**
     * 读取“装备槽”字段为单个对象（兼容旧数组包装与新对象）
     * - 旧：stat[slotKey] 为 [ item ] 或 [ '$__META_EXTENSIBLE__$' ]
     * - 新：stat[slotKey] 为对象或 null
     */
    readEquipped(stat, slotKey) {
      try {
        const v = stat && stat[slotKey];
        if (Array.isArray(v)) {
          const first = v[0];
          if (!first || first === '$__META_EXTENSIBLE__$') return null;
          return typeof first === 'object' ? first : null;
        }
        if (v && typeof v === 'object' && !v.$meta) {
          return v;
        }
        return null;
      } catch (_) {
        return null;
      }
    },

    /**
     * 根据品阶获取对应的CSS样式字符串。
     * @param {string} tier - 品阶名称.
     * @returns {string} CSS样式.
     */
    getTierStyle(tier) {
      const animatedStyle = 'background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: god-tier-animation 3s linear infinite; font-weight: bold;';
      const styles = {
        练气: 'color: #FFFFFF;',
        筑基: 'color: #66CDAA;',
        金丹: 'color: #FFD700;',
        元婴: `background: linear-gradient(90deg, #DA70D6, #BA55D3, #9932CC, #BA55D3, #DA70D6); ${animatedStyle}`,
        化神: `background: linear-gradient(90deg, #DC143C, #FF4500, #B22222, #FF4500, #DC143C); ${animatedStyle}`,
        合体: `background: linear-gradient(90deg, #C71585, #FF1493, #DB7093, #FF1493, #C71585); ${animatedStyle}`,
        飞升: `background: linear-gradient(90deg, #FF416C, #FF4B2B, #FF6B6B, #FF4B2B, #FF416C); ${animatedStyle}`,
        神桥: `background: linear-gradient(90deg, #cccccc, #ffffff, #bbbbbb, #ffffff, #cccccc); ${animatedStyle}`,
      };
      const baseStyle = 'font-style: italic;';
      return (styles[tier] || 'color: #e0dcd1;') + baseStyle;
    },

    /**
     * 仅返回颜色样式（用于物品/天赋/灵根），未匹配到则退回默认颜色。
     */
    getTierColorStyle(tier) {
      // 顶阶品阶启用动态动画（与物品/境界一致）
      const animatedStyle = 'background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent; animation: god-tier-animation 3s linear infinite; font-weight: bold;';
      const colorMap = {
        凡品: 'color: #9e9e9e;',
        下品: 'color: #8bc34a;',
        中品: 'color: #4caf50;',
        上品: 'color: #00bcd4;',
        极品: 'color: #2196f3;',
        天品: `background: linear-gradient(90deg, #b388ff, #7c4dff, #b388ff); ${animatedStyle}`,
        仙品: `background: linear-gradient(90deg, #fff2a8, #ffd700, #fff2a8); ${animatedStyle}`,
        神品: `background: linear-gradient(90deg, #ff6b6b, #ffd93d, #ff6b6b); ${animatedStyle}`
      };
      // 若物品品阶未匹配，则尝试按境界走 getTierStyle，然后回退默认
      return colorMap[tier] || this.getTierStyle(tier) || 'color: #e0dcd1;';
    },

    /**
     * 获取品阶的排序值。
     * @param {string} tier - 品阶名称.
     * @returns {number} 排序值.
     */
    getTierOrder(tier) {
      return Constants.TIERS[tier] || 0;
    },

    /**
     * 根据品阶对物品数组进行排序。
     * @param {object[]} items - 物品数组.
     * @param {function} getTierFn - 从物品对象中获取品阶的函数.
     * @returns {object[]} 排序后的新数组.
     */
    sortByTier(items, getTierFn) {
      if (!Array.isArray(items)) return items;
      return [...items].sort((a, b) => {
        const tierA = getTierFn(a);
        const tierB = getTierFn(b);
        const orderA = this.getTierOrder(tierA);
        const orderB = this.getTierOrder(tierB);
        if (orderA === orderB) return 0;
        return orderB - orderA;
      });
    },

    /**
     * 显示一个临时消息弹窗。
     * @param {string} message - 要显示的消息.
     * @param {number} [duration=2000] - 显示时长（毫秒）.
     */
    showTemporaryMessage(message, duration = 2000) {
      // 移除已存在的消息
      const existingMsg = document.querySelector('.temp-message-popup');
      if (existingMsg) existingMsg.remove();

      // 创建消息元素
      const msgElement = document.createElement('div');
      msgElement.className = 'temp-message-popup';
      msgElement.textContent = message;
      msgElement.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(26, 26, 46, 0.95);
        color: #c9aa71;
        border: 1px solid #c9aa71;
        border-radius: 8px;
        padding: 15px 25px;
        z-index: 10001;
        font-size: 14px;
        font-weight: 600;
        font-family: "Microsoft YaHei", sans-serif;
        box-shadow: 0 0 20px rgba(201, 170, 113, 0.3);
        text-align: center;
        pointer-events: none;
        white-space: nowrap;
      `;
      
      // 添加到归墟容器或body
      const container = document.querySelector('.guixu-root-container') || document.body;
      container.appendChild(msgElement);

      // 自动移除
      setTimeout(() => {
        if (msgElement && msgElement.parentNode) {
          msgElement.remove();
        }
      }, duration);
    },

    /**
     * 解析“本世历程”或类似格式的字符串为事件对象数组。
     * @param {string} contentString - 包含事件的字符串。
     * @returns {object[]} 解析后的事件对象数组。
     */
    parseJourneyEntry(contentString) {
      if (!contentString?.trim()) return [];
      
      const eventBlocks = contentString.trim().split(/\n\n+/);
      
      return eventBlocks.map(block => {
          const event = {};
          const lines = block.trim().split('\n');
          let currentKey = null;

          lines.forEach(line => {
              const separatorIndex = line.indexOf('|');
              if (separatorIndex !== -1) {
                  const key = line.substring(0, separatorIndex).trim();
                  const value = line.substring(separatorIndex + 1);
                  if (key) {
                      event[key] = value.trim();
                      currentKey = key;
                  }
              } else if (currentKey && event[currentKey] !== undefined) {
                  event[currentKey] += '\n' + line;
              }
          });
          return event;
      }).filter(event => event && Object.keys(event).length > 0 && (event['序号'] || event['第x世']));
    },
    /**
     * 提取文本中指定标签的最后一次内容。
     * 例如：extractLastTagContent('gametxt', aiText)
     */
    extractLastTagContent(tagName, text, ignoreCase = false) {
      try {
        if (!tagName || !text) return null;
        const flags = ignoreCase ? 'gi' : 'g';
        const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, flags);
        let match;
        let lastContent = null;
        while ((match = pattern.exec(text)) !== null) {
          lastContent = match[1];
        }
        return lastContent ? String(lastContent).trim() : null;
      } catch (e) {
        console.error('[归墟] extractLastTagContent 解析失败:', e);
        return null;
      }
    },

    /**
     * 本地兜底：从 AI 文本中解析 _.set('路径', 旧值, 新值); 并应用到旧的 MVU 状态，返回新的状态。
     * 注意：该函数仅作为 mag_invoke_mvu 失败时的降级方案，力求“不抛错、尽量更新”。
     */
    applyUpdateFallback(text, oldState) {
      try {
        if (!text || !oldState || typeof oldState !== 'object') return null;

        // 深拷贝，避免直接修改引用
        const newState = JSON.parse(JSON.stringify(oldState));
        if (!newState.stat_data || typeof newState.stat_data !== 'object') {
          newState.stat_data = {};
        }

        // 匹配所有 _.set('path', old, new);
        const regex = /_.set\s*\(\s*(['"])(.*?)\1\s*,\s*([\s\S]*?)\s*,\s*([\s\S]*?)\s*\)\s*;/g;
        let match;
        let applied = 0;

        const parseValue = (token) => {
          if (typeof token !== 'string') return token;
          const t = token.trim();
          // 字符串字面量
          const strMatch = t.match(/^(['"])([\s\S]*?)\1$/);
          if (strMatch) return strMatch[2];

          // 尝试 JSON.parse（可解析数字/对象/数组/布尔/null）
          try {
            return JSON.parse(t);
          } catch (_) {
            // 再尝试数字
            const num = Number(t);
            if (!Number.isNaN(num)) return num;
            // 兜底为原始字符串
            return t;
          }
        };

        const setByPath = (rootObj, path, value) => {
          const parts = String(path).split('.').filter(Boolean);
          let node = rootObj.stat_data;
          for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            if (!node[key] || typeof node[key] !== 'object') {
              node[key] = {};
            }
            node = node[key];
          }
          const leaf = parts[parts.length - 1];

          const existing = node[leaf];
          if (Array.isArray(existing)) {
            const desc = existing.length > 1 ? existing[1] : undefined;
            node[leaf] = typeof desc !== 'undefined' ? [value, desc] : [value];
          } else {
            node[leaf] = [value];
          }
        };

        while ((match = regex.exec(text)) !== null) {
          const path = match[2];
          const newToken = match[4];
          const newValue = parseValue(newToken);
          try {
            setByPath(newState, path, newValue);
            applied++;
          } catch (e) {
            console.warn('[归墟] applyUpdateFallback 单条更新失败:', path, e);
          }
        }

        return applied > 0 ? newState : null;
      } catch (e) {
        console.error('[归墟] applyUpdateFallback 执行失败:', e);
        return null;
      }
    }
  ,
    /**
     * 货币换算与展示（基础单位：下品灵石）
     * 提供：获取/设置首选展示单位、基础单位↔展示单位换算、格式化展示（万/亿紧凑）
     * 用法：
     *   const h = window.GuixuHelpers;
     *   const unit = h.Currency.getPreferredUnit(); // '下品灵石' | '中品灵石' | '上品灵石'
     *   h.Currency.setPreferredUnit('中品灵石');
     *   h.Currency.toBase(12, '中品灵石');       // => 1200 （换算到下品）
     *   h.Currency.fromBase(12345, '上品灵石'); // => 1.2345
     *   h.Currency.formatFromBase(123456, '中品灵石', { decimals: 2, compact: true }) // => "1.23万" 等
     */
    Currency: {
      BASE_UNIT: '下品灵石',
      UNITS: [
        { name: '下品灵石', ratio: 1 },
        { name: '中品灵石', ratio: 100 },
        { name: '上品灵石', ratio: 10000 },
      ],
      getUnits() {
        try { return this.UNITS.map(u => u.name); } catch (_) { return ['下品灵石','中品灵石','上品灵石']; }
      },
      getUnitRatio(unit) {
        const u = this.UNITS.find(x => x.name === unit);
        return u ? u.ratio : 1;
      },
      getPreferredUnit() {
        try {
          const st = (global.GuixuState && typeof global.GuixuState.getState === 'function') ? (global.GuixuState.getState() || {}) : {};
          const u = st.currencyUnit || localStorage.getItem('guixu_currency_unit') || this.BASE_UNIT;
          return (this.UNITS.find(x => x.name === u)?.name) || this.BASE_UNIT;
        } catch (_) {
          return this.BASE_UNIT;
        }
      },
      setPreferredUnit(unit) {
        const valid = this.UNITS.find(x => x.name === unit);
        const u = valid ? unit : this.BASE_UNIT;
        try { global.GuixuState?.update?.('currencyUnit', u); } catch (_) {}
        try { localStorage.setItem('guixu_currency_unit', u); } catch (_) {}
        try { document.dispatchEvent(new CustomEvent('guixu:currencyUnitChanged', { detail: { unit: u } })); } catch (_) {}
        return u;
      },
      toBase(amount, unit) {
        const r = this.getUnitRatio(unit || this.getPreferredUnit());
        const n = Number(amount);
        return Number.isFinite(n) ? Math.round(n * r) : 0;
      },
      fromBase(amountBase, unit) {
        const r = this.getUnitRatio(unit || this.getPreferredUnit());
        const n = Number(amountBase);
        return Number.isFinite(n) ? (n / r) : 0;
      },
      formatFromBase(amountBase, unit, opts = {}) {
        const val = this.fromBase(amountBase, unit);
        const decimals = typeof opts.decimals === 'number' ? opts.decimals : 2;
        const compact = opts.compact !== false;
        const keep = (x) => {
          const s = decimals >= 0 ? Number(x).toFixed(decimals) : String(x);
          return s.replace(/\.0+$/, '').replace(/(\.\d{1,2})\d+$/, '$1');
        };
        if (!compact) return keep(val);
        const abs = Math.abs(val);
        if (abs >= 1e8) return keep(val / 1e8) + '亿';
        if (abs >= 1e4) return keep(val / 1e4) + '万';
        return keep(val);
      }
    }
  };
  
  global.GuixuHelpers = Object.freeze(Helpers);

})(window);
