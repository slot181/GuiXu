(function (window) {
  'use strict';

  // 依赖检查
  if (!window.GuixuState || !window.GuixuHelpers || !window.GuixuAPI) {
    console.error('AttributeService 依赖 GuixuState, GuixuHelpers, 和 GuixuAPI。');
    return;
  }

  const H = window.GuixuHelpers;
  const _ = window.GuixuAPI.lodash || {
    get: (obj, path, def) => {
      try {
        const val = path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
        return val === undefined ? def : val;
      } catch { return def; }
    }
  };

  // 中/英映射
  const AttrMapCN2Key = { '法力': 'fali', '神海': 'shenhai', '道心': 'daoxin', '空速': 'kongsu', '气运': 'qiyun' };
  const AttrKey2CN = { fali: '法力', shenhai: '神海', daoxin: '道心', kongsu: '空速', qiyun: '气运' };
  const CoreKeys = ['fali', 'shenhai', 'daoxin', 'kongsu'];

  // 解析“百分比”字符串为小数（0.12）
  function parsePercent(v) {
    if (v === null || v === undefined) return 0;
    const s = String(v).trim();
    if (!s) return 0;
    if (s.endsWith('%')) {
      const n = parseFloat(s.slice(0, -1));
      return Number.isFinite(n) ? n / 100 : 0;
    }
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 1.5 ? n / 100 : (Number.isFinite(n) ? n : 0);
  }

  // 从 item 上解析属性加成（固定/百分比），统一映射到 fali/shenhai/daoxin/kongsu/qiyun
  function extractBonusesFromItem(item) {
    const flat = { fali: 0, shenhai: 0, daoxin: 0, kongsu: 0, qiyun: 0 };
    const percent = { fali: 0, shenhai: 0, daoxin: 0, kongsu: 0, qiyun: 0 };
    if (!item || typeof item !== 'object') return { flat, percent };

    const ab = item.attributes_bonus || item['属性加成'] || {};
    const pb = item['百分比加成'] || item.percent_bonus || {};

    if (ab && typeof ab === 'object') {
      Object.entries(ab).forEach(([k, v]) => {
        const key = AttrMapCN2Key[k] || null;
        if (!key) return;
        const n = parseInt(String(v), 10);
        if (Number.isFinite(n)) flat[key] += n;
      });
    }
    if (pb && typeof pb === 'object') {
      Object.entries(pb).forEach(([k, v]) => {
        const key = AttrMapCN2Key[k] || null;
        if (!key) return;
        const p = parsePercent(v);
        if (Number.isFinite(p)) percent[key] += p;
      });
    }
    return { flat, percent };
  }

  // 汇总对象 a += b
  function mergeBonus(a, b) {
    Object.keys(a).forEach(k => { a[k] += (b[k] || 0); });
  }

  // 深拷贝
  function cloneBonus(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Number(v) || 0]));
  }

  // 数值规整：将任意输入转为非负整数
  const __toIntLocal = (v) => Math.max(0, parseInt(String(v ?? 0), 10) || 0);

  const AttributeService = {
    /**
     * 计算最终属性（当前/上限），并缓存到全局状态。
     * 返回:
     * {
     *   current: { fali, shenhai, daoxin, kongsu },
     *   max: { fali, shenhai, daoxin, kongsu, qiyun }
     * }
     */
    calculateFinalAttributes() {
      const state = window.GuixuState.getState();
      if (!state.currentMvuState || !state.currentMvuState.stat_data) {
        console.warn('无法计算属性：mvu状态不可用。');
        return {
          current: { fali: 0, shenhai: 0, daoxin: 0, kongsu: 0 },
          max: { fali: 0, shenhai: 0, daoxin: 0, kongsu: 0, qiyun: 0 }
        };
      }

      const stat_data = state.currentMvuState.stat_data;

      // 基础属性
      // 适配新MVU：直接读取对象字典，避免 SafeGetValue 将对象转为字符串
      const base4 = (stat_data && typeof stat_data['基础四维'] === 'object' ? stat_data['基础四维'] : null)
        || (stat_data && typeof stat_data['基础四维属性'] === 'object' ? stat_data['基础四维属性'] : null)
        || {};
      const baseAttrs = {
        fali: __toIntLocal(H.SafeGetValue(base4, '法力', 0)),
        shenhai: __toIntLocal(H.SafeGetValue(base4, '神海', 0)),
        daoxin: __toIntLocal(H.SafeGetValue(base4, '道心', 0)),
        kongsu: __toIntLocal(H.SafeGetValue(base4, '空速', 0)),
        // 气运不属于四维，这里仅用于面板展示徽章，读取顶层气运
        qiyun: __toIntLocal(H.SafeGetValue(stat_data, '气运', 0)),
      };

      // 上限：前端计算（基础四维 + 固定加成）×（1 + 百分比加成）；计算结果回写到新结构“四维上限”
      const { totalFlatBonuses: __flatB, totalPercentBonuses: __pctB } = this.calculateAllBonuses(stat_data, state.equippedItems || {});
      const __cap = (k) => {
        const base = Number(baseAttrs[k] || 0);
        const flat = Number(__flatB[k] || 0);
        const pct = Number(__pctB[k] || 0);
        const cap = Math.round((base + flat) * (1 + pct));
        return Math.max(0, cap);
      };
      const calculatedMaxAttrs = {
        fali: __cap('fali'),
        shenhai: __cap('shenhai'),
        daoxin: __cap('daoxin'),
        kongsu: __cap('kongsu'),
        // 气运用于徽章展示，不在四维上限中维护
        qiyun: __toIntLocal(H.SafeGetValue(stat_data, '气运', 0)),
      };

      // 保底写入（与旧代码兼容）
      try { state.update && state.update('calculatedMaxAttributes', calculatedMaxAttrs); } catch (_) {}
      // 回写：仅写入新结构“四维上限”，不再写顶层旧散键
      try { this._writeBackPlayerCoreMax?.(calculatedMaxAttrs); } catch (_) {}

      // 当前值（不超过上限）
      // 适配新MVU：直接读取对象字典
      const cur4 = (stat_data && typeof stat_data['当前四维'] === 'object' ? stat_data['当前四维'] : null)
        || (stat_data && typeof stat_data['当前四维属性'] === 'object' ? stat_data['当前四维属性'] : null)
        || {};
      const currentAttrs = {
        fali: Math.min(__toIntLocal(H.SafeGetValue(cur4, '法力', 0)), calculatedMaxAttrs.fali),
        shenhai: Math.min(__toIntLocal(H.SafeGetValue(cur4, '神海', 0)), calculatedMaxAttrs.shenhai),
        daoxin: Math.min(__toIntLocal(H.SafeGetValue(cur4, '道心', 0)), calculatedMaxAttrs.daoxin),
        kongsu: Math.min(__toIntLocal(H.SafeGetValue(cur4, '空速', 0)), calculatedMaxAttrs.kongsu),
      };


      return { current: currentAttrs, max: calculatedMaxAttrs, base: baseAttrs };
    },

    /**
     * 收集所有来源（装备、天赋、灵根）的属性加成（总和）。
     */
    calculateAllBonuses(stat_data, equippedItems) {
      const totalFlatBonuses = { fali: 0, shenhai: 0, daoxin: 0, kongsu: 0, qiyun: 0 };
      const totalPercentBonuses = { fali: 0, shenhai: 0, daoxin: 0, kongsu: 0, qiyun: 0 };

      const addItem = (item) => {
        const { flat, percent } = extractBonusesFromItem(item);
        mergeBonus(totalFlatBonuses, flat);
        mergeBonus(totalPercentBonuses, percent);
      };

      // 装备（优先从状态管理器，其次从 MVU 变量读取；两者去重，避免重复计入）
      try {
        const seen = new Set();
        const keyOf = (it) => {
          try {
            const id = H.SafeGetValue(it, 'id', '');
            const name = H.SafeGetValue(it, 'name', H.SafeGetValue(it, '名称', ''));
            return id ? `id:${id}` : (name ? `name:${name}` : '');
          } catch (_) { return ''; }
        };
        const pushIfNew = (it) => {
          if (!it || typeof it !== 'object') return;
          const sig = keyOf(it);
          if (sig && !seen.has(sig)) {
            seen.add(sig);
            addItem(it);
          }
        };

        // 1) 来自本地 equippedItems（读档可能缺失该缓存，若存在则优先使用）
        if (equippedItems && typeof equippedItems === 'object') {
          Object.values(equippedItems).forEach(pushIfNew);
        }

        // 2) 回退/补充：从 stat_data 的“已装备”字段读取（与 UI 渲染来源一致）
        // 兼容对象/数组两种旧形态；若 helper 不存在则静默跳过
        const slots = ['武器','主修功法','辅修心法','防具','饰品','法宝'];
        slots.forEach(k => {
          try {
            const v = H.readEquipped ? H.readEquipped(stat_data, k) : null;
            if (Array.isArray(v)) {
              v.forEach(pushIfNew);
            } else {
              pushIfNew(v);
            }
          } catch (_) {}
        });
      } catch (_) {}

      // 天赋（兼容对象列表）
      try {
        const tianfuList = H.readList(stat_data, '天赋列表');
        Array.isArray(tianfuList) && tianfuList.forEach(tf => {
          if (!tf) return;
          const obj = typeof tf === 'string' ? (function(){ try { return JSON.parse(tf); } catch { return null; } })() : tf;
          if (obj) addItem(obj);
        });
      } catch (_) {}

      // 灵根（兼容对象列表）
      try {
        const linggenList = H.readList(stat_data, '灵根列表');
        Array.isArray(linggenList) && linggenList.forEach(lg => {
          if (!lg) return;
          const obj = typeof lg === 'string' ? (function(){ try { return JSON.parse(lg); } catch { return null; } })() : lg;
          if (obj) addItem(obj);
        });
      } catch (_) {}

      return { totalFlatBonuses, totalPercentBonuses };
    },

    /**
     * 提供“详细分解”数据：基础值 + 每个来源（灵根/天赋/装备）的固定/百分比贡献
     * 返回:
     * {
     *   base: { fali, shenhai, daoxin, kongsu, qiyun },
     *   sources: [
     *     { type: '灵根'|'天赋'|'装备', name, flat:{...}, percent:{...} }
     *   ]
     * }
     */
    getDetailedBreakdown() {
      const st = window.GuixuState.getState();
      const stat_data = st.currentMvuState?.stat_data || {};

      // 适配新MVU：直接读取对象字典
      const base4b = (stat_data && typeof stat_data['基础四维'] === 'object' ? stat_data['基础四维'] : null)
        || (stat_data && typeof stat_data['基础四维属性'] === 'object' ? stat_data['基础四维属性'] : null)
        || {};
      const base = {
        fali: __toIntLocal(H.SafeGetValue(base4b, '法力', 0)),
        shenhai: __toIntLocal(H.SafeGetValue(base4b, '神海', 0)),
        daoxin: __toIntLocal(H.SafeGetValue(base4b, '道心', 0)),
        kongsu: __toIntLocal(H.SafeGetValue(base4b, '空速', 0)),
        qiyun: __toIntLocal(H.SafeGetValue(stat_data, '气运', 0)),
      };

      const sources = [];

      // 收集器
      const pushItem = (type, item) => {
        const name = H.SafeGetValue(item, 'name', H.SafeGetValue(item, '名称', '未知')) || '未知';
        const { flat, percent } = extractBonusesFromItem(item);
        sources.push({ type, name, flat, percent });
      };

      // 装备（与计算一致：合并本地缓存与 MVU 变量并去重）
      try {
        const seen = new Set();
        const keyOf = (it) => {
          try {
            const id = H.SafeGetValue(it, 'id', '');
            const name = H.SafeGetValue(it, 'name', H.SafeGetValue(it, '名称', ''));
            return id ? `id:${id}` : (name ? `name:${name}` : '');
          } catch (_) { return ''; }
        };
        const pushIfNew = (it) => {
          if (!it || typeof it !== 'object') return;
          const sig = keyOf(it);
          if (sig && !seen.has(sig)) {
            seen.add(sig);
            pushItem('物品', it);
          }
        };

        // 1) 本地 equippedItems
        const eq = st.equippedItems || {};
        Object.values(eq).forEach(pushIfNew);

        // 2) MVU 槽位
        const slots = ['武器','主修功法','辅修心法','防具','饰品','法宝'];
        const sd = st.currentMvuState?.stat_data || {};
        slots.forEach(k => {
          try {
            const v = H.readEquipped ? H.readEquipped(sd, k) : null;
            if (Array.isArray(v)) v.forEach(pushIfNew);
            else pushIfNew(v);
          } catch (_) {}
        });
      } catch (_) {}

      // 天赋（兼容对象列表）
      try {
        const tianfuList = H.readList(stat_data, '天赋列表');
        Array.isArray(tianfuList) && tianfuList.forEach(tf => {
          if (!tf) return;
          const obj = typeof tf === 'string' ? (function(){ try { return JSON.parse(tf); } catch { return null; } })() : tf;
          if (obj) pushItem('天赋', obj);
        });
      } catch (_) {}

      // 灵根（兼容对象列表）
      try {
        const linggenList = H.readList(stat_data, '灵根列表');
Array.isArray(linggenList) && linggenList.forEach(lg => {
            if (!lg) return;
            const obj = typeof lg === 'string' ? (function(){ try { return JSON.parse(lg); } catch { return null; } })() : lg;
            if (obj) pushItem('灵根', obj);
          });
      } catch (_) {}

      return { base, sources };
    },

    // 简易转义（避免 tooltip 文本破坏 HTML）
    _esc(text) {
      const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
      return String(text).replace(/[&<>"']/g, (ch) => map[ch] || ch);
    },

    // 规范化一个词条值为可展示文本（支持 number/string/object 常见结构）
    _formatEffectValue(v) {
      try {
        if (v == null) return '';
        if (typeof v === 'number') return String(v);
        if (typeof v === 'string') return v;

        // [value, unit] 或 [key, value]
        if (Array.isArray(v)) {
          if (v.length === 2) {
            const [a, b] = v;
            if (typeof a === 'string' && (typeof b === 'number' || typeof b === 'string')) return String(b);
            if ((typeof a === 'number' || typeof a === 'string') && typeof b === 'string') return `${a}${b}`;
          }
          return v.map(x => this._formatEffectValue(x)).filter(Boolean).join(' / ');
        }

        if (typeof v === 'object') {
          if (typeof v.percent !== 'undefined') return typeof v.percent === 'number' ? `${v.percent}%` : String(v.percent);
          if (typeof v.amount !== 'undefined') return `${v.amount}${typeof v.unit === 'string' ? v.unit : ''}`;
          if (typeof v.value !== 'undefined') {
            const unit = typeof v.unit === 'string' ? v.unit : (v.isPercent ? '%' : '');
            return `${v.value}${unit || ''}`;
          }
          if (typeof v.val !== 'undefined') return `${v.val}${typeof v.unit === 'string' ? v.unit : ''}`;
          if (typeof v.rate !== 'undefined') return typeof v.rate === 'number' ? `${v.rate}%` : String(v.rate);
          if (typeof v.magnitude !== 'undefined') return `${v.magnitude}${typeof v.unit === 'string' ? v.unit : ''}`;
          try { return JSON.stringify(v); } catch (_) { return String(v); }
        }
      } catch (_) {}
      return String(v);
    },

    // 解析一个条目的 special_effects（支持对象/数组/字符串）
    _extractEffectsFromItem(item) {
      try {
        if (!item || typeof item !== 'object') return [];
        let eff = item.special_effects ?? item['词条效果'] ?? item['词条'];
        if (eff == null) return [];

        // 字符串：尝试 JSON，否则按多行/分号/逗号切
        if (typeof eff === 'string') {
          const t = eff.trim();
          if (!t) return [];
          try {
            if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
              const parsed = JSON.parse(t);
              eff = parsed;
            }
          } catch (_) {}
          if (typeof eff === 'string') {
            const parts = eff.split(/[\n;,]+/).map(s => s.trim()).filter(Boolean);
            const out = [];
            parts.forEach(p => {
              const m = p.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
              if (m) out.push({ key: m[1].trim(), value: m[2].trim() });
              else out.push({ key: '', value: p });
            });
            return out;
          }
        }

        // 数组
        if (Array.isArray(eff)) {
          return eff
            .filter(x => !!x)
            .map(entry => {
              if (typeof entry === 'string') {
                const m = entry.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
                if (m) return { key: m[1].trim(), value: m[2].trim() };
                return { key: '', value: entry };
              }
              if (Array.isArray(entry)) {
                if (entry.length >= 2) return { key: String(entry[0] ?? ''), value: entry[1] };
                return { key: '', value: entry.map(x => this._formatEffectValue(x)).join(' / ') };
              }
              if (entry && typeof entry === 'object') {
                const k = entry.key ?? entry.k ?? entry.name ?? entry.label ?? entry.title ?? entry.desc ?? entry.description ?? '';
                const v = typeof entry.value !== 'undefined'
                  ? entry.value
                  : (entry.v ?? entry.val ?? entry.amount ?? entry.percent ?? entry.rate ?? entry.magnitude ?? entry);
                return { key: String(k || ''), value: v };
              }
              return { key: '', value: entry };
            });
        }

        // 对象：键-值对
        if (typeof eff === 'object') {
          return Object.entries(eff)
            .filter(([k]) => k !== '$meta')
            .map(([k, v]) => ({ key: String(k), value: v }));
        }

        return [{ key: '', value: eff }];
      } catch (_) {
        return [];
      }
    },

    // 汇总“词条效果”到简短列表（类型-名称：键 值）
    _renderSpecialEffectsSummary() {
      try {
        const st = window.GuixuState.getState();
        const sd = st.currentMvuState?.stat_data || {};
        const Hh = window.GuixuHelpers;

        const lines = [];

        const pushItem = (type, item) => {
          if (!item || typeof item !== 'object') return;
          const name = Hh.SafeGetValue(item, 'name', Hh.SafeGetValue(item, '名称', '未知')) || '未知';
          const entries = this._extractEffectsFromItem(item);
          entries.forEach(({ key, value }) => {
            const label = key ? `${type}-${name}：${key}` : `${type}-${name}`;
            lines.push({ label, value: this._formatEffectValue(value) });
          });
        };

        // 装备
        try {
          const eq = st.equippedItems || {};
          Object.values(eq).forEach(it => { if (it) pushItem('物品', it); });
        } catch (_) {}

        // 天赋
        try {
          const tianfuList = Hh.readList(sd, '天赋列表');
          Array.isArray(tianfuList) && tianfuList.forEach(tf => {
            const obj = typeof tf === 'string' ? (function(){ try { return JSON.parse(tf); } catch { return null; } })() : tf;
            if (obj) pushItem('天赋', obj);
          });
        } catch (_) {}

        // 灵根
        try {
          const linggenList = Hh.readList(sd, '灵根列表');
          Array.isArray(linggenList) && linggenList.forEach(lg => {
            const obj = typeof lg === 'string' ? (function(){ try { return JSON.parse(lg); } catch { return null; } })() : lg;
            if (obj) pushItem('灵根', obj);
          });
        } catch (_) {}

        if (!lines.length) return '';

        // 限制最多展示若干条，避免超长
        const maxShow = 24;
        const shown = lines.slice(0, maxShow);
        const more = lines.length > maxShow ? `<div class="attr-break-item"><span class="attr-break-name">……</span><span class="attr-break-val">其余 ${lines.length - maxShow} 条</span></div>` : '';

        return `
          <div class="attr-break-group">
            <div class="attr-break-title">词条效果</div>
            <div class="attr-break-items">
              ${shown.map(x => `
                <div class="attr-break-item">
                  <span class="attr-break-name">${this._esc(x.label)}</span>
                  <span class="attr-break-val"><strong>${this._esc(x.value)}</strong></span>
                </div>
              `).join('')}
              ${more}
            </div>
          </div>
        `;
      } catch (e) {
        console.warn('[归墟] 词条效果分解渲染失败:', e);
        return '';
      }
    },

    // 渲染“属性+修为”合并模块（进度条显示 + 点击浮窗分解）
    renderUnifiedPanel() {
      const container = document.querySelector('.character-panel');
      if (!container) return;

      const ensureTooltip = () => {
        let tip = document.getElementById('attr-breakdown-tooltip');
        if (!tip) {
          tip = document.createElement('div');
          tip.id = 'attr-breakdown-tooltip';
          tip.style.position = 'absolute';
          tip.style.display = 'none';
          tip.style.zIndex = '1003';
          tip.className = 'attr-tooltip';
          container.appendChild(tip);
        }
        // 确保面板容器为相对定位，避免绝对定位参照 body 导致偏移（移动端嵌入场景尤甚）
        try {
          const cs = window.getComputedStyle(container);
          if (cs && cs.position === 'static') {
            container.style.position = 'relative';
          }
        } catch (_) {}
        return tip;
      };

      const { current, max } = this.calculateFinalAttributes();

      // 读取修为进度/瓶颈（复用旧数据源）
      const st = window.GuixuState.getState();
      const sd = st.currentMvuState?.stat_data || {};
      const progRaw = H.SafeGetValue(sd, '修为进度', '0');
      const progress = Math.max(0, Math.min(100, parseFloat(progRaw) || 0));
      const bottleneck = H.SafeGetValue(sd, '修为瓶颈', '无');
      // 气运：优先读取顶层 mvu 变量“气运”，无则回退到计算后的上限值
      const playerQiyun = Math.max(0, parseInt(H.SafeGetValue(sd, '气运', H.SafeGetValue(sd, '气運', max.qiyun)), 10) || 0);

      // 构建HTML
      const hostId = 'attr-cultivation-panel';
      let host = document.getElementById(hostId);
      if (!host) {
        // 移除旧的“核心属性/修为详情”区块，避免重复
        try {
          const titles = Array.from(container.querySelectorAll('.panel-section .section-title')).map(t => t.textContent || '');
          const toRemove = Array.from(container.querySelectorAll('.panel-section')).filter(sec => {
            const t = (sec.querySelector('.section-title')?.textContent || '').trim();
            return t.includes('核心属性') || t.includes('修为详情');
          });
          toRemove.forEach(el => el.remove());
        } catch (_) {}

        host = document.createElement('div');
        host.id = hostId;
        host.className = 'panel-section';
        container.insertBefore(host, container.firstChild);
      }

      host.innerHTML = `
        <div class="section-title">修行概览</div>
        <div class="qiyun-row">
          <div class="qiyun-badge"><span class="label">气运</span><span class="value">${playerQiyun}</span></div>
        </div>
        <div class="attr-card">
          ${CoreKeys.map(k => {
            const cn = AttrKey2CN[k];
            const cur = Math.max(0, Number(current[k] || 0));
            const mx = Math.max(0, Number(max[k] || 0));
            const pct = mx > 0 ? Math.round((cur / mx) * 100) : 0;
            return `
              <div class="attr-row" data-attr="${k}" role="button" tabindex="0" aria-label="${cn} 明细">
                <div class="attr-head">
                  <span class="attr-name">${cn}</span>
                  <span class="attr-values">${cur}/${mx}</span>
                </div>
                <div class="attr-bar">
                  <div class="attr-bar-fill" style="width:${pct}%"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        

        <div class="attr-cultivation-wrap">
          <div class="attr-head">
            <span class="attr-name">修为进度</span>
            <span class="attr-values">${progress}%</span>
          </div>
          <div class="attr-bar attr-bar--cultivation">
            <div class="attr-bar-fill" style="width:${progress}%"></div>
          </div>
          <div class="attr-bottleneck">
            <span class="attr-bottleneck-label">当前瓶颈</span>
            <span class="attr-bottleneck-value">${bottleneck}</span>
          </div>
        </div>
      `;

      // 绑定点击浮窗
      const tip = ensureTooltip();
      // 全局只绑定一次文档级点击监听，避免重复绑定造成内存泄漏（移动端/桌面端、全屏/非全屏通用）
      if (!this._docClickBound) {
        this._docClickBound = true;
        this._docClickHandler = (ev) => {
          try {
            const t = document.getElementById('attr-breakdown-tooltip');
            if (!t) return;
            const inside = t.contains(ev.target);
            const row = ev.target.closest?.('.attr-row');
            if (!inside && !row) { t.style.display = 'none'; }
          } catch (_) {}
        };
        document.addEventListener('click', this._docClickHandler, { passive: true });
      }

      host.querySelectorAll('.attr-row').forEach(row => {
        const key = row.getAttribute('data-attr');
        row.addEventListener('click', (ev) => this._showBreakdownTooltip(ev.currentTarget, key, tip, ev));
        row.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            // 无点击事件时，使用目标元素下方作为定位
            this._showBreakdownTooltip(ev.currentTarget, key, tip, null);
          }
        });
      });
    },

    _showBreakdownTooltip(targetEl, attrKey, tipEl, ev) {
      try {
        const { base, sources } = this.getDetailedBreakdown();
        const cn = AttrKey2CN[attrKey] || attrKey;

        // 汇总：分组到“灵根/天赋/物品”
        const groups = { '灵根': [], '天赋': [], '物品': [] };
        sources.forEach(s => {
          const lineFlat = (s.flat && Number(s.flat[attrKey])) || 0;
          const linePct = (s.percent && Number(s.percent[attrKey])) || 0;
          if (!lineFlat && !linePct) return;
          const type = s.type && groups[s.type] ? s.type : '物品';
          groups[type].push({
            name: s.name || '未知',
            flat: lineFlat,
            pct: linePct
          });
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

        tipEl.innerHTML = `
          <div class="attr-tip-title">${cn} 加成明细</div>
          <div class="attr-break-content">
            <div class="attr-breakline"><span class="attr-break-k">基础${cn}</span><span class="attr-break-v">${Number(base[attrKey] || 0)}</span></div>
            ${renderGroup('灵根', groups['灵根'])}
            ${renderGroup('天赋', groups['天赋'])}
            ${renderGroup('物品', groups['物品'])}
          </div>
        `;

        // 定位：优先在点击位置弹出，次选贴着条目下方；并进行边界收敛以防越界
        // 以实际承载浮窗的容器为参照，确保定位贴近点击点且不越界到面板外
        const hostEl = tipEl.offsetParent || tipEl.parentElement || document.body;
        const containerRect = hostEl.getBoundingClientRect();

        // 显示以测量尺寸
        tipEl.style.display = 'block';
        const ttRect = tipEl.getBoundingClientRect();
        const pad = 8;

        let relLeft, relTop;
        if (ev && (ev.clientX != null)) {
          const pt = ev.touches ? ev.touches[0] : ev;
          relLeft = (pt.clientX - containerRect.left) + 12;
          relTop = (pt.clientY - containerRect.top) + 12;
        } else {
          const rect = targetEl.getBoundingClientRect();
          relLeft = rect.left - containerRect.left;
          relTop = rect.bottom - containerRect.top + 6;
        }

        const maxLeft = Math.max(pad, containerRect.width - ttRect.width - pad);
        const maxTop = Math.max(pad, containerRect.height - ttRect.height - pad);
        relLeft = Math.min(Math.max(pad, relLeft), maxLeft);
        relTop = Math.min(Math.max(pad, relTop), maxTop);

        tipEl.style.left = relLeft + 'px';
        tipEl.style.top = relTop + 'px';
      } catch (e) {
        console.warn('[归墟] 属性分解浮窗失败:', e);
        tipEl.style.display = 'none';
      }
    },

    /**
     * 将“前端计算后的四维上限”写回到新结构：stat_data.四维上限。
     * 不再镜像写入任何旧的顶层散键（如 法力上限/神海上限/道心上限/空速上限）。
     * 仅当数值发生变化时才更新。
     */
    _writeBackPlayerCoreMax(maxAttrs) {
      try {
        if (!maxAttrs) return;
        const st = window.GuixuState?.getState?.();
        const sd = st?.currentMvuState?.stat_data;
        if (!sd || typeof sd !== 'object') return;

        const toInt = (v) => Math.max(0, Number.parseInt(String(v ?? 0), 10) || 0);
        const cnMax = {
          '法力': toInt(maxAttrs.fali),
          '神海': toInt(maxAttrs.shenhai),
          '道心': toInt(maxAttrs.daoxin),
          '空速': toInt(maxAttrs.kongsu),
        };

        let changed = false;

        // 对比“四维上限”对象是否需要更新
        const oldMaxObj = (sd && typeof sd['四维上限'] === 'object') ? sd['四维上限'] : null;
        if (oldMaxObj && typeof oldMaxObj === 'object') {
          Object.entries(cnMax).forEach(([k, v]) => {
            const old = Number.parseInt(String(oldMaxObj[k]), 10);
            if (!Number.isFinite(old) || old !== v) changed = true;
          });
        } else {
          changed = true;
        }

        // 同步回写：设置“四维上限”对象（新结构）
        sd['四维上限'] = Object.assign({}, (oldMaxObj && typeof oldMaxObj === 'object' ? oldMaxObj : {}), cnMax);


        if (!changed) return;

        // 更新内存中的计算上限缓存
        try { st.calculatedMaxAttributes = Object.assign({}, st.calculatedMaxAttributes, { ...maxAttrs }); } catch (_) {}

        // 合并/节流写回至 mvu（通过 MvuIO）
        try {
          if (window.GuixuMvuIO && typeof window.GuixuMvuIO.scheduleStatUpdate === 'function') {
            window.GuixuMvuIO.scheduleStatUpdate((stat) => {
              const prev = (stat['四维上限'] && typeof stat['四维上限'] === 'object') ? stat['四维上限'] : {};
              stat['四维上限'] = Object.assign({}, prev, cnMax);
            }, { reason: 'attributes:max' });
          }
        } catch (_) {}
      } catch (e) {
        console.warn('[归墟] 写回四维上限失败:', e);
      }
    },


    /**
     * UI入口：更新显示（现已改为渲染合并模块 + 进度条）
     */
    updateDisplay() {
      // 渲染合并模块
      this.renderUnifiedPanel();
    }
  };

  // 将服务挂载到 window 对象
  window.GuixuAttributeService = AttributeService;

})(window);
