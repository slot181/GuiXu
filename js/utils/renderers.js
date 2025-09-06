// 通用渲染工具：从 guixu.js 中抽离，供各组件复用
(function (window) {
  'use strict';

  if (!window.GuixuHelpers) {
    console.error('[归墟] GuixuRenderers 初始化失败：缺少依赖(GuixuHelpers)。');
    return;
  }

  // 统一处理“词条效果”的解析与展示（支持 对象/数组/字符串/Map）
  function parsePossibleJson(str) {
    try {
      if (typeof str !== 'string') return str;
      const t = str.trim();
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        return JSON.parse(t);
      }
    } catch (_) {}
    return str;
  }
  function mapToObjectIfAllStringKeys(m) {
    try {
      if (Object.prototype.toString.call(m) !== '[object Map]') return m;
      const arr = Array.from(m.entries());
      const allString = arr.every(([k]) => typeof k === 'string');
      return allString ? Object.fromEntries(arr) : arr.map(([k, v]) => ({ key: k, value: v }));
    } catch (_) { return m; }
  }
  function formatEffectValue(v) {
    try {
      if (v == null) return '';
      if (typeof v === 'number') return String(v);
      if (typeof v === 'string') return v;

      if (Array.isArray(v)) {
        // [value, unit] 或 [key, value]
        if (v.length === 2) {
          const [a, b] = v;
          if (typeof a === 'string' && (typeof b === 'number' || typeof b === 'string')) {
            return String(b);
          }
          if ((typeof a === 'number' || typeof a === 'string') && typeof b === 'string') {
            return `${a}${b}`;
          }
        }
        // 其它数组：串起来
        return v.map(formatEffectValue).filter(Boolean).join(' / ');
      }

      // Map -> Object / Array
      if (Object.prototype.toString.call(v) === '[object Map]') {
        v = mapToObjectIfAllStringKeys(v);
      }

      if (typeof v === 'object') {
        // 常见字段抽取（与 statuses 的解析保持思路一致，简化判断）
        if (typeof v.percent !== 'undefined') {
          const p = v.percent;
          return typeof p === 'number' ? `${p}%` : String(p);
        }
        if (typeof v.amount !== 'undefined') {
          const a = v.amount;
          const unit = typeof v.unit === 'string' ? v.unit : '';
          return `${a}${unit}`;
        }
        if (typeof v.value !== 'undefined') {
          const a = v.value;
          const unit = typeof v.unit === 'string' ? v.unit : (v.isPercent ? '%' : '');
          return `${a}${unit || ''}`;
        }
        if (typeof v.val !== 'undefined') {
          const a = v.val;
          const unit = typeof v.unit === 'string' ? v.unit : '';
          return `${a}${unit}`;
        }
        if (typeof v.rate !== 'undefined') {
          const r = v.rate;
          return typeof r === 'number' ? `${r}%` : String(r);
        }
        if (typeof v.magnitude !== 'undefined') {
          const m = v.magnitude;
          const unit = typeof v.unit === 'string' ? v.unit : '';
          return `${m}${unit}`;
        }
        // 兜底：单行 JSON
        try { return JSON.stringify(v); } catch (_) { return String(v); }
      }
    } catch (_) {}
    return String(v);
  }
  function normalizeEffects(eff) {
    if (eff == null) return [];
    // Map -> Object / Array
    if (Object.prototype.toString.call(eff) === '[object Map]') {
      eff = mapToObjectIfAllStringKeys(eff);
    }
    // 字符串：优先尝试 JSON，其次按“key:value”/多行解析
    if (typeof eff === 'string') {
      const parsed = parsePossibleJson(eff);
      if (parsed && typeof parsed === 'object') return normalizeEffects(parsed);
      const parts = eff.split(/[\n;,]+/).map(s => s.trim()).filter(Boolean);
      const out = [];
      for (const p of parts) {
        const m = p.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
        if (m) out.push({ key: m[1].trim(), value: m[2].trim() });
        else out.push({ key: '', value: p });
      }
      return out.filter(x => x.value);
    }
    // 数组：混合字符串/对象/二元数组
    if (Array.isArray(eff)) {
      return eff
        .filter(x => !!x)
        .map(entry => {
          if (typeof entry === 'string') {
            const p = parsePossibleJson(entry);
            if (p && typeof p === 'object') return { key: '', value: p };
            const m = entry.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
            if (m) return { key: m[1].trim(), value: m[2].trim() };
            return { key: '', value: entry };
          }
          if (Array.isArray(entry)) {
            if (entry.length >= 2) return { key: String(entry[0] ?? ''), value: entry[1] };
            return { key: '', value: entry.map(formatEffectValue).join(' / ') };
          }
          if (Object.prototype.toString.call(entry) === '[object Map]') {
            const obj = mapToObjectIfAllStringKeys(entry);
            if (Array.isArray(obj)) {
              return obj.map(e => ({ key: String(e.key ?? ''), value: e.value })).flat();
            }
            if (obj && typeof obj === 'object') {
              return Object.entries(obj)
                .filter(([k]) => k !== '$meta')
                .map(([k, v]) => ({ key: String(k), value: v }));
            }
          }
          if (entry && typeof entry === 'object') {
            const k = entry.key ?? entry.k ?? entry.name ?? entry.label ?? entry.title ?? entry.desc ?? entry.description ?? '';
            const v = typeof entry.value !== 'undefined'
              ? entry.value
              : (entry.v ?? entry.val ?? entry.amount ?? entry.percent ?? entry.rate ?? entry.magnitude ?? entry);
            return { key: String(k || ''), value: v };
          }
          return { key: '', value: entry };
        })
        .flat()
        .map(it => {
          // 清理可能被字符串化的对象
          const v = typeof it.value === 'string' ? parsePossibleJson(it.value) : it.value;
          return { key: it.key, value: v };
        })
        .filter(x => x.value != null);
    }
    // 对象：以键为“词条名”，值为“效果描述”
    if (typeof eff === 'object') {
      return Object.entries(eff)
        .filter(([k]) => k !== '$meta')
        .map(([k, v]) => {
          const val = typeof v === 'string' ? parsePossibleJson(v) : v;
          return { key: String(k), value: val };
        });
    }
    return [{ key: '', value: eff }];
  }

  const GuixuRenderers = {
    // 背包条目细节块（固定加成/百分比加成/特殊词条）
    renderItemDetailsForInventory(item) {
      let attributesHtml = '';
      const attributes = item?.attributes_bonus || item?.['属性加成'];
      if (attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0) {
        attributesHtml += '<div class="tooltip-section-title u-mt-8">固定加成</div>';
        for (const [key, value] of Object.entries(attributes)) {
          attributesHtml += `<p><strong>${key}:</strong> ${value > 0 ? '+' : ''}${value}</p>`;
        }
      }

      const percentBonuses = item?.['百分比加成'] || item?.percent_bonus || item?.['百分比'];
      if (percentBonuses && typeof percentBonuses === 'object' && Object.keys(percentBonuses).length > 0) {
        attributesHtml += '<div class="tooltip-section-title u-mt-8">百分比加成</div>';
        for (const [key, value] of Object.entries(percentBonuses)) {
          attributesHtml += `<p><strong>${key}:</strong> +${value}</p>`;
        }
      }

      // 词条效果（支持对象/数组/字符串/Map）
      let effectsHtml = '';
      let effects = item?.special_effects || item?.['词条效果'] || item?.['词条'] || item?.effects;
      if (typeof effects === 'string' && effects.trim() !== '') {
        // 可能是 JSON / 文本行
        const parsed = parsePossibleJson(effects);
        effects = parsed;
      }
      const entries = normalizeEffects(effects);
      if (entries.length > 0) {
        effectsHtml += `<div class="tooltip-section-title u-mt-8">特殊词条</div>`;
        effectsHtml += entries
          .map(({ key, value }) => {
            const label = key ? `${window.GuixuHelpers.SafeGetValue({ k: key }, 'k')}: ` : '';
            const valText = formatEffectValue(value);
            return `<p>${label}<strong>${valText}</strong></p>`;
          })
          .join('');
      }

      return `${attributesHtml}${effectsHtml}`;
    },

    // 装备槽悬浮提示
    renderTooltipContent(item) {
      const level = window.GuixuHelpers.SafeGetValue(item, 'level', '');
      const tierDisplay = level
        ? `${window.GuixuHelpers.SafeGetValue(item, 'tier', '凡品')} ${level}`
        : window.GuixuHelpers.SafeGetValue(item, 'tier', '凡品');

      let attributesHtml = '';
      const attributes = item?.attributes_bonus || item?.['属性加成'];
      if (attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0) {
        attributesHtml += `<div class="tooltip-section-title">固定加成</div>`;
        for (const [key, value] of Object.entries(attributes)) {
          attributesHtml += `<p><strong>${key}:</strong> ${value > 0 ? '+' : ''}${value}</p>`;
        }
      }

      const percentBonuses = item?.['百分比加成'] || item?.percent_bonus || item?.['百分比'];
      if (percentBonuses && typeof percentBonuses === 'object' && Object.keys(percentBonuses).length > 0) {
        attributesHtml += `<div class="tooltip-section-title u-mt-8">百分比加成</div>`;
        for (const [key, value] of Object.entries(percentBonuses)) {
          attributesHtml += `<p><strong>${key}:</strong> +${value}</p>`;
        }
      }

      // 词条效果（支持对象/数组/字符串/Map）
      let effectsHtml = '';
      let effects = item?.special_effects || item?.['词条效果'] || item?.['词条'] || item?.effects;
      if (typeof effects === 'string' && effects.trim() !== '') {
        const parsed = parsePossibleJson(effects);
        effects = parsed;
      }
      const entries = normalizeEffects(effects);
      if (entries.length > 0) {
        effectsHtml += `<div class="tooltip-section-title">特殊词条</div>`;
        effectsHtml += entries
          .map(({ key, value }) => {
            const label = key ? `${window.GuixuHelpers.SafeGetValue({ k: key }, 'k')}: ` : '';
            const valText = formatEffectValue(value);
            return `<p>${label}<strong>${valText}</strong></p>`;
          })
          .join('');
      }

      return `
        <div class="tooltip-title tier-text" data-tier="${window.GuixuHelpers.SafeGetValue(item, 'tier')}">${window.GuixuHelpers.SafeGetValue(item, 'name')}</div>
        <p><strong>品阶:</strong> ${tierDisplay}</p>
        <p><i>${window.GuixuHelpers.SafeGetValue(item, 'description', '无描述')}</i></p>
        ${attributesHtml ? `<div class="tooltip-section tooltip-attributes">${attributesHtml}</div>` : ''}
        ${effectsHtml ? `<div class="tooltip-section">${effectsHtml}</div>` : ''}
      `;
    }
  };

  window.GuixuRenderers = GuixuRenderers;
})(window);
