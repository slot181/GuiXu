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
              .filter(k => k !== '$meta')
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
          return Array.isArray(arr) ? arr : [];
        }
        // 新：对象字典（兼容是否存在 $meta）
        if (v && typeof v === 'object') {
          return Object.keys(v)
            .filter(k => k !== '$meta')
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
     * - 新：stat[slotKey] 为对象或 null
     */
    readEquipped(stat, slotKey) {
      try {
        const v = stat && stat[slotKey];
        if (Array.isArray(v)) {
          const first = v[0];
          if (!first) return null;
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
        const baseFlags = ignoreCase ? 'gi' : 'g';

        // 1) 严格匹配（优先）
        const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const strict = new RegExp(`<\\s*${esc(tagName)}[^>]*>\\s*([\\s\\S]*?)\\s*<\\/\\s*${esc(tagName)}\\s*>`, baseFlags);
        let m, last = null;
        while ((m = strict.exec(text)) !== null) last = m;
        if (last) return String(last[1]).trim();

        // 2) 松散匹配：允许在标签名字符之间穿插连字符/空白（例：<行-动-方-针> / </行-动-针>）
        const chars = String(tagName).split('').map(ch => esc(ch));
        const looseName = chars.join('[\\s\\-—_·•－]*');
        const loose = new RegExp(`<\\s*${looseName}[^>]*>\\s*([\\s\\S]*?)\\s*<\\/\\s*${looseName}\\s*>`, baseFlags);
        last = null;
        while ((m = loose.exec(text)) !== null) last = m;
        return last ? String(last[1]).trim() : null;
      } catch (e) {
        console.error('[归墟] extractLastTagContent 解析失败:', e);
        return null;
      }
    },

    /**
     * 新增：获取标签别名列表（兼容繁体）
     * @param {string} tagName
     * @returns {string[]} 别名数组（包含原名）
     */
    getTagAliases(tagName) {
      try {
        const map = {
          '本世历程': ['本世历程', '本世歴程', '本世歷程'],
          '往世涟漪': ['往世涟漪', '往世漣漪'],
        };
        const list = map[tagName] || [tagName];
        // 去重
        return Array.from(new Set(list.filter(Boolean).map(String)));
      } catch (_) {
        return [tagName];
      }
    },

    /**
     * 新增：按别名集合提取最后一次标签内容（优先严格，其次宽松；默认忽略大小写）
     * @param {string|string[]} tagName - 主标签名或别名数组
     * @param {string} text
     * @param {boolean} [ignoreCase=true]
     * @returns {string|null}
     */
    extractLastTagContentByAliases(tagName, text, ignoreCase = true) {
      try {
        if (!text) return null;
        const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const aliases = Array.isArray(tagName)
          ? Array.from(new Set(tagName.filter(Boolean).map(String)))
          : (this.getTagAliases ? this.getTagAliases(String(tagName)) : [String(tagName)]);
        if (aliases.length === 0) return null;

        const flags = ignoreCase ? 'gi' : 'g';

        // 1) 严格多别名匹配（别名作为分支）
        const strictGroup = aliases.map(a => esc(a)).join('|');
        let re = new RegExp(`<\\s*(?:${strictGroup})[^>]*>\\s*([\\s\\S]*?)\\s*<\\/\\s*(?:${strictGroup})\\s*>`, flags);
        let m, last = null;
        while ((m = re.exec(text)) !== null) last = m;
        if (last) return String(last[1]).trim();

        // 2) 宽松多别名匹配：允许别名字符间穿插连字符/空白等
        const makeLoose = (name) => name.split('').map(ch => esc(ch)).join('[\\s\\-—_·•－]*');
        const looseGroup = aliases.map(makeLoose).join('|');
        re = new RegExp(`<\\s*(?:${looseGroup})[^>]*>\\s*([\\s\\S]*?)\\s*<\\/\\s*(?:${looseGroup})\\s*>`, flags);
        last = null;
        while ((m = re.exec(text)) !== null) last = m;
        return last ? String(last[1]).trim() : null;
      } catch (e) {
        console.error('[归墟] extractLastTagContentByAliases 解析失败:', e);
        return null;
      }
    },

    /**
     * 新增：验证一组标签是否存在且正确闭合。
     * 返回 { missing: string[], unclosed: string[] }
     */
    validateTagClosures(text, requiredTags = []) {
      try {
        const res = { missing: [], unclosed: [] };
        const normalize = (s) => String(s || '')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')    // 去除零宽字符
          .replace(/\u3000/g, ' ')                  // 全角空格 -> 半角
          .replace(/\uFF1C/g, '<')                  // 全角左尖括号 -> <
          .replace(/\uFF1E/g, '>');                 // 全角右尖括号 -> >
        const txt = normalize(text);
        if (!txt || !Array.isArray(requiredTags) || requiredTags.length === 0) return res;

        const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hasOpening = (aliases) => {
          // 允许严格/宽松两种形式；避免 \b 在中文标签场景下误判为“未生成”
          const strictGroup = aliases.map(a => esc(a)).join('|');
          const strictRe = new RegExp(`<\\s*(?:${strictGroup})(?=[\\s>])[^>]*>`, 'i');
          if (strictRe.test(txt)) return true;
          // 宽松：字符间允许连字符/空白等（兼容 <本-世-历-程>）
          const makeLoose = (name) => name.split('').map(ch => esc(ch)).join('[\\s\\-—_·•－]*');
          const looseGroup = aliases.map(makeLoose).join('|');
          const looseRe = new RegExp(`<\\s*(?:${looseGroup})(?=[\\s>])[^>]*>`, 'i');
          return looseRe.test(txt);
        };
        // 仅用于诊断：检测是否出现了 HTML 实体转义的“伪标签”（<本世历程>）
        const hasEscapedOpening = (aliases) => {
          // 检测 HTML 实体形式：<本世历程> 或 <本-世-历-程 />
          const strictGroup = aliases.map(a => esc(a)).join('|');
          const strictRe = new RegExp(`<\\s*(?:${strictGroup})(?=[\\s;>])[^&]*(>|\\/>)`, 'i');
          if (strictRe.test(txt)) return true;
          const makeLoose = (name) => name.split('').map(ch => esc(ch)).join('[\\s\\-—_·•－]*');
          const looseGroup = aliases.map(makeLoose).join('|');
          const looseRe = new RegExp(`<\\s*(?:${looseGroup})(?=[\\s;>])[^&]*(>|\\/>)`, 'i');
          return looseRe.test(txt);
        };
        const hasEscapedClosing = (aliases) => {
          // 检测 HTML 实体形式：</本世历程> 或 </本-世-历-程>
          const strictGroup = aliases.map(a => esc(a)).join('|');
          const strictRe = new RegExp(`<\\/\\s*(?:${strictGroup})\\s*>`, 'i');
          if (strictRe.test(txt)) return true;
          const makeLoose = (name) => name.split('').map(ch => esc(ch)).join('[\\s\\-—_·•－]*');
          const looseGroup = aliases.map(makeLoose).join('|');
          const looseRe = new RegExp(`<\\/\\s*(?:${looseGroup})\\s*>`, 'i');
          return looseRe.test(txt);
        };

        for (const name of requiredTags) {
          const aliases = Array.isArray(name)
            ? Array.from(new Set(name.filter(Boolean).map(String)))
            : (this.getTagAliases ? this.getTagAliases(String(name)) : [String(name)]);
          const closed = !!this.extractLastTagContentByAliases(aliases, txt, true);
          const open = hasOpening(aliases);
          // 诊断：是否仅存在 HTML 转义的“伪标签”
          const escapedOpen = hasEscapedOpening(aliases);
          const escapedClose = hasEscapedClosing(aliases);

          if (!open) {
            if (escapedOpen) {
              try {
                console.warn('[归墟][validateTagClosures] 检测到 HTML 转义的伪标签：<%s>，实际未生成可解析的真实标签。请在外部编辑功能中修正为 <%s>…</%s>。', String(name), String(name), String(name));
              } catch (_) {}
            }
            res.missing.push(String(name));
          } else if (!closed) {
            // 若仅有转义闭合而无真实闭合，同样提示未闭合（并输出诊断日志）
            if (escapedClose) {
              try {
                console.warn('[归墟][validateTagClosures] 发现 </%s>（转义闭合），但缺少真实闭合 </%s>。', String(name), String(name));
              } catch (_) {}
            }
            res.unclosed.push(String(name));
          }
        }
        return res;
      } catch (_) {
        return { missing: [], unclosed: [] };
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
