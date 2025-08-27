(function (window) {
  'use strict';

  if (!window.GuixuHelpers || !window.GuixuState || !window.GuixuAPI || !window.GuixuBaseModal) {
    console.warn('[归墟][StatusesComponent] 依赖未满足（Helpers/State/API/BaseModal）');
  }

  const $ = (sel, ctx = document) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from((ctx || document).querySelectorAll(sel));

  const StatusesComponent = {
    _cache: {
      all: [],
      filtered: [],
      keyword: '',
    },

    async show() {
      try {
        window.GuixuBaseModal.open('statuses-modal');
        const body = $('#statuses-modal .modal-body');
        if (!body) return;

        body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">正在读取状态...</p>';

        const statuses = await this._loadStatuses();
        this._cache.all = statuses;
        this._cache.keyword = '';
        this._cache.filtered = statuses;

        this._renderList(statuses);

        // 绑定搜索
        const searchInput = $('#statuses-search-input');
        if (searchInput && !searchInput._guixu_bound) {
          searchInput._guixu_bound = true;
          searchInput.addEventListener('input', () => {
            const kw = (searchInput.value || '').trim().toLowerCase();
            this._cache.keyword = kw;
            const filtered = this._filterByKeyword(kw, this._cache.all);
            this._cache.filtered = filtered;
            this._renderList(filtered);
          });
        }
      } catch (e) {
        console.error('[归墟][StatusesComponent] show 出错:', e);
        const body = $('#statuses-modal .modal-body');
        if (body) {
          body.innerHTML = `<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">加载状态失败：${e.message}</p>`;
        }
      }
    },

    // 从当前状态或 API 读取“当前状态”列表（对象字典形态，不再使用 .0/数组包装）
    async _loadStatuses() {
      try {
        const state = window.GuixuState?.getState?.();
        let statData = state?.currentMvuState?.stat_data;

        if (!statData) {
          const messages = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
          statData = messages?.[0]?.data?.stat_data;
        }
  
        

        const raw = (window.GuixuHelpers && typeof window.GuixuHelpers.readList === 'function')
          ? window.GuixuHelpers.readList(statData, '当前状态')
          : [];

        // 过滤元标记
        const cleaned = raw.filter(x => x && x !== '$__META_EXTENSIBLE__$' && x !== '...');

        // 规范化（绑定 this，避免 this 丢失导致“未知状态”）
        return cleaned.map(item => this._normalizeOne(item));
      } catch (e) {
        console.warn('[归墟][StatusesComponent] _loadStatuses 警告:', e);
        return [];
      }
    },

    _normalizeOne(item) {
      // 字符串状态：仅名称
      if (typeof item === 'string') {
        const text = item.trim();
        // 尝试将字符串解析为 JSON（新Schema可能以字符串形式注入）
        if ((text.startsWith('{') && text.endsWith('}'))) {
          try {
            const obj = JSON.parse(text);
            if (obj && typeof obj === 'object') {
              return this._normalizeOne(obj);
            }
          } catch (_) {
            // 忽略解析错误，按纯文本名称处理
          }
        }
        return {
          name: text,
          description: '',
          source: '',
          duration: '',
          stacks: '',
          effects: null,
          meta: null,
          raw: item,
          type: 'text',
          statusType: 'NEUTRAL',
        };
      }
      // 对象状态：尝试提取常见字段
      try {
        // 本地安全取值，避免依赖外部 SafeGetValue 引发异常
        const pick = (obj, keys, def = '') => {
          for (const k of keys) {
            if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
              const v = obj[k];
              if (v !== null && v !== undefined && v !== '') return v;
            }
          }
          return def;
        };

        const name = pick(item, ['name', '名称', 'title'], '未知状态');
        const description = pick(item, ['description', '描述', 'desc'], '');
        const source = pick(item, ['source', '来源'], '');
        const duration = pick(item, ['duration', '持续时间'], '');
        const stacks = pick(item, ['stacks', '层数', 'stack', '层'], '');
        let effects = pick(item, ['effects', 'effect', '效果', 'buffs'], null);
        // 修复：[object Object] 被提前转成字符串的情况，尽量从原始对象恢复
        const rawEffectsCandidate = item && (item.effects ?? item['effect'] ?? item['效果'] ?? item['buffs']);
        if (typeof effects === 'string' && effects.trim && effects.trim() === '[object Object]') {
          if (rawEffectsCandidate && typeof rawEffectsCandidate === 'object') {
            effects = rawEffectsCandidate;
          }
        }
        const meta = pick(item, ['meta', 'extra', '附加', '其他'], null);
        // 新 Schema: 状态类型（标准化为 BUFF/DEBUFF/NEUTRAL/AURA/TERRAIN）
        let statusType = String(pick(item, ['type', '状态类型'], 'NEUTRAL') || 'NEUTRAL').toUpperCase();
        const knownTypes = new Set(['BUFF', 'DEBUFF', 'NEUTRAL', 'AURA', 'TERRAIN']);
        if (!knownTypes.has(statusType)) statusType = 'NEUTRAL';

        return {
          id: pick(item, ['id'], ''),
          name: String(name),
          description: typeof description === 'string' ? description : JSON.stringify(description),
          source: typeof source === 'string' ? source : (source ? JSON.stringify(source) : ''),
          duration: (Number.isFinite(Number(duration)) ? Number(duration) : (duration ? String(duration) : '')),
          stacks: typeof stacks === 'string' ? stacks : (Number.isFinite(stacks) ? String(stacks) : (stacks ? JSON.stringify(stacks) : '')),
          attributes_bonus: (typeof item.attributes_bonus === 'string' ? this._parsePossibleJson(item.attributes_bonus) : (item && typeof item.attributes_bonus === 'object' && item.attributes_bonus)) || null,
          effects: this._parseEffects(effects),
          meta: meta,
          statusType: statusType,
          raw: item,
          type: 'object',
        };
      } catch (e) {
        return {
          name: '未知状态',
          description: '',
          source: '',
          duration: '',
          stacks: '',
          effects: null,
          meta: null,
          raw: item,
          type: 'unknown',
          statusType: 'NEUTRAL',
        };
      }
    },

    _filterByKeyword(keyword, list) {
      if (!keyword) return list;
      const kw = keyword.toLowerCase();
      return list.filter(s => {
        const pool = [
          s.name || '',
          s.description || '',
          s.source || '',
          s.duration || '',
          s.stacks || '',
          typeof s.raw === 'string' ? s.raw : JSON.stringify(s.raw || {}),
        ].join(' ').toLowerCase();
        return pool.includes(kw);
      });
    },

    _renderList(list) {
      const body = $('#statuses-modal .modal-body');
      if (!body) return;

      if (!Array.isArray(list) || list.length === 0) {
        body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">当前无状态效果。</p>';
        return;
      }

      let html = '<div class="statuses-grid">';

      list.forEach((s, idx) => {
        const durationDisplay = (s.duration || s.duration === 0) ? `${this._esc(s.duration)} 小时` : '';
        // 修复2：移除ID显示
        const headerLine = [
          `<span style="color:#c9aa71; font-weight:bold;">${this._esc(s.name)}</span>`,
          s.stacks ? `<span style="color:#a09c91; font-size:11px;">x${this._esc(s.stacks)}</span>` : '',
          durationDisplay ? `<span style="color:#a09c91; font-size:11px;">${durationDisplay}</span>` : '',
        ].filter(Boolean).join(' · ');

        const detailsBlocks = [];

        if (s.description) {
          detailsBlocks.push(`<p style="margin:6px 0; color:#e0dcd1; font-size:12px;">${this._esc(s.description)}</p>`);
        }

        if (s.source) {
          detailsBlocks.push(`<p style="margin:6px 0; color:#8b7355; font-size:11px;">来源：${this._esc(s.source)}</p>`);
        }
        if (s.attributes_bonus && typeof s.attributes_bonus === 'object') {
          const attrs = Object.entries(s.attributes_bonus).map(([k, v]) => {
            let displayHtml;
            const scalar = this._maybeScalarEffect(v);
            if (scalar !== null) {
              displayHtml = `<strong style="color:#c9aa71;">${this._esc(this._formatEffectValue(scalar))}</strong>`;
            } else if (typeof v === 'object' && v !== null) {
              displayHtml = `<pre style="white-space: pre-wrap; word-wrap: break-word; color: #e0dcd1; font-size: 11px; padding: 4px; background: rgba(0,0,0,0.2); border-radius: 3px; margin-top: 4px;">${this._prettyJson(v)}</pre>`;
            } else {
              displayHtml = `<strong style="color:#c9aa71;">${this._esc(String(v))}</strong>`;
            }
            return `<li>${this._esc(k)}：${displayHtml}</li>`;
          }).join('');
          detailsBlocks.push(`<div style="margin:6px 0;">
            <div style="color:#8b7355; font-size:11px;">属性加成：</div>
            <ul style="margin:4px 0 0 16px; color:#e0dcd1; font-size:12px; list-style:disc;">
              ${attrs || '<li>无</li>'}
            </ul>
          </div>`);
        }

        // 修复3：重写 effects 渲染逻辑
        if (s.effects) {
          const effectsObj = this._parseEffects(s.effects);

          if (Array.isArray(effectsObj)) {
            const effs = effectsObj.map(entry => {
              let k, v;

              if (Array.isArray(entry) && entry.length >= 2) {
                [k, v] = entry;
              } else if (entry && typeof entry === 'object') {
                k = entry.key ?? entry.k ?? entry.name ?? entry.label ?? entry.title ?? entry.desc ?? entry.description ?? '';
                v = entry.value ?? entry.v ?? entry.val ?? entry.amount ?? entry.percent ?? entry.rate ?? entry.score ?? entry.magnitude;
                if (typeof v === 'undefined') v = entry;
              } else {
                k = '';
                v = entry;
              }

              const label = (typeof k === 'string')
                ? k
                : (k && typeof k === 'object')
                  ? (k.name || k.title || this._safeStringify(k))
                  : String(k ?? '');

              const val = (typeof v === 'string') ? this._parsePossibleJson(v) : v;

              let displayHtml;
              const scalar = this._maybeScalarEffect(val);
              if (scalar !== null) {
                displayHtml = `<strong style="color:#c9aa71;">${this._esc(this._formatEffectValue(scalar))}</strong>`;
              } else if (typeof val === 'object' && val !== null) {
                displayHtml = `<pre style="white-space: pre-wrap; word-wrap: break-word; color: #e0dcd1; font-size: 11px; padding: 4px; background: rgba(0,0,0,0.2); border-radius: 3px; margin-top: 4px;">${this._prettyJson(val)}</pre>`;
              } else {
                displayHtml = `<strong style="color:#c9aa71;">${this._esc(this._formatEffectValue(val))}</strong>`;
              }

              const labelPrefix = label ? `${this._esc(label)}：` : '';
              return `<li>${labelPrefix}${displayHtml}</li>`;
            }).join('');

            detailsBlocks.push(`<div style="margin:6px 0;">
              <div style="color:#8b7355; font-size:11px;">词条效果：</div>
              <ul style="margin:4px 0 0 16px; color:#e0dcd1; font-size:12px; list-style:disc;">
                ${effs || '<li>无</li>'}
              </ul>
            </div>`);
          } else if (typeof effectsObj === 'object' && effectsObj !== null) {
            const effs = Object.entries(effectsObj).map(([k, v]) => {
              // 若值本身是 JSON 字符串，先尝试解析
              const val = (typeof v === 'string') ? this._parsePossibleJson(v) : v;

              let displayHtml;
              const scalar = this._maybeScalarEffect(val);
              if (scalar !== null) {
                displayHtml = `<strong style="color:#c9aa71;">${this._esc(this._formatEffectValue(scalar))}</strong>`;
              } else if (typeof val === 'object' && val !== null) {
                displayHtml = `<pre style="white-space: pre-wrap; word-wrap: break-word; color: #e0dcd1; font-size: 11px; padding: 4px; background: rgba(0,0,0,0.2); border-radius: 3px; margin-top: 4px;">${this._prettyJson(val)}</pre>`;
              } else {
                displayHtml = `<strong style="color:#c9aa71;">${this._esc(this._formatEffectValue(val))}</strong>`;
              }
              return `<li>${this._esc(k)}：${displayHtml}</li>`;
            }).join('');
            detailsBlocks.push(`<div style="margin:6px 0;">
              <div style="color:#8b7355; font-size:11px;">词条效果：</div>
              <ul style="margin:4px 0 0 16px; color:#e0dcd1; font-size:12px; list-style:disc;">
                ${effs || '<li>无</li>'}
              </ul>
            </div>`);
          } else {
            const pretty = this._esc(typeof s.effects === 'string' ? s.effects : JSON.stringify(s.effects));
            detailsBlocks.push(`<div style="margin:6px 0;">
              <div style="color:#8b7355; font-size:11px;">词条效果：</div>
              <pre style="white-space: pre-wrap; word-wrap: break-word; color: #e0dcd1; font-size: 11px; padding: 8px; background: rgba(0, 0, 0, 0.2); border-radius: 4px;">${pretty}</pre>
            </div>`);
          }
        }

        if (s.meta) {
          const pretty = typeof s.meta === 'string' ? this._esc(s.meta) : this._prettyJson(s.meta);
          detailsBlocks.push(`<div style="margin:6px 0;">
            <div style="color:#8b7355; font-size:11px;">附加信息：</div>
            <pre style="white-space: pre-wrap; word-wrap: break-word; color: #e0dcd1; font-size: 11px; padding: 8px; background: rgba(0, 0, 0, 0.2); border-radius: 4px;">${pretty}</pre>
          </div>`);
        }

        if (!s.description && !s.source && !s.duration && !s.stacks && !s.effects && !s.meta && s.raw) {
          const rawPretty = typeof s.raw === 'string' ? this._esc(s.raw) : this._prettyJson(s.raw);
          detailsBlocks.push(`<pre style="white-space: pre-wrap; word-wrap: break-word; color: #e0dcd1; font-size: 11px; padding: 8px; background: rgba(0, 0, 0, 0.2); border-radius: 4px;">${rawPretty}</pre>`);
        }

        html += `
          <div class="status-card-wrapper">
            <details class="status-card" data-index="${idx}" data-status-type="${(s.statusType || 'NEUTRAL').toString().toUpperCase()}" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(201,170,113,0.3); border-radius: 5px; padding: 10px;">
              <summary style="cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center;">
                <span>${headerLine}</span>
                <span style="color:#8b7355; font-size:11px;">详情</span>
              </summary>
              <div class="status-details" style="margin-top:8px; border-top: 1px solid rgba(201,170,113,0.2); padding-top: 8px;">
                ${detailsBlocks.join('')}
              </div>
            </details>
          </div>
        `;
      });

      html += '</div>';
      body.innerHTML = html;
    },

    _esc(text) {
      const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' };
      return String(text).replace(/[&<>"']/g, (ch) => map[ch] || ch);
    },

    _formatEffectValue(v) {
      if (v === null || v === undefined) return '0%';
      if (typeof v === 'number') return `${v}%`;
      if (typeof v === 'string') return v;
      const scalar = this._maybeScalarEffect(v);
      if (scalar !== null) return String(scalar);
      return this._safeStringify(v);
    },

    _maybeScalarEffect(v) {
      try {
        if (v === null || v === undefined) return '0%';
        if (typeof v === 'number' || typeof v === 'string') return v;

        // 形如 [10, '%']
        if (Array.isArray(v)) {
          const [val, unit] = v;
          if (typeof val === 'number' || typeof val === 'string') {
            if (typeof unit === 'string') return `${val}${unit}`;
            return val;
          }
        }

        // Map -> 普通对象
        if (Object.prototype.toString.call(v) === '[object Map]') {
          try { v = Object.fromEntries(v); } catch (_) {}
        }

        if (v && typeof v === 'object') {
          // 递归向内剥离 value/amount 等，最多 3 层，同时保留 unit/isPercent
          let cur = v;
          let unit = '';
          let isPercent = false;

          for (let i = 0; i < 3 && cur && typeof cur === 'object'; i++) {
            if (typeof cur.unit === 'string') unit = cur.unit;
            if (cur.isPercent === true) isPercent = true;

            if (typeof cur.percent !== 'undefined') {
              return `${cur.percent}%`;
            }
            if (typeof cur.amount !== 'undefined') {
              const inner = cur.amount;
              if (typeof inner === 'number' || typeof inner === 'string') {
                return `${inner}${typeof cur.unit === 'string' ? cur.unit : ''}`;
              }
              cur = inner;
              continue;
            }
            if (typeof cur.value !== 'undefined') {
              const inner = cur.value;
              if (typeof inner === 'number' || typeof inner === 'string') {
                const suffix = typeof cur.unit === 'string'
                  ? cur.unit
                  : (cur.isPercent ? '%' : (unit || (isPercent ? '%' : '')));
                return `${inner}${suffix || ''}`;
              }
              cur = inner;
              continue;
            }
            if (typeof cur.val !== 'undefined') {
              const inner = cur.val;
              if (typeof inner === 'number' || typeof inner === 'string') {
                return `${inner}${typeof cur.unit === 'string' ? cur.unit : ''}`;
              }
              cur = inner;
              continue;
            }
            if (typeof cur.rate !== 'undefined') {
              const r = cur.rate;
              if (typeof r === 'number') return `${r}%`;
              if (typeof r === 'string') return r;
            }
            if (typeof cur.magnitude !== 'undefined') {
              const m = cur.magnitude;
              if (typeof m === 'number' || typeof m === 'string') {
                return `${m}${typeof cur.unit === 'string' ? cur.unit : ''}`;
              }
            }
            break;
          }
        }
      } catch (_) {}
      return null;
    },

    _parsePossibleJson(str) {
      try {
        if (typeof str !== 'string') return str;
        const t = str.trim();
        if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
          return JSON.parse(t);
        }
      } catch (_) {}
      return str;
    },

    _parseEffects(eff) {
      try {
        if (eff == null) return null;
        // Map -> Object
        if (Object.prototype.toString.call(eff) === '[object Map]') {
          try {
            const arr = Array.from(eff.entries());
            const allStringKeys = arr.every(([k]) => typeof k === 'string');
            if (allStringKeys) {
              eff = Object.fromEntries(arr);
            } else {
              // 保留为数组结构，避免对象键被强制转成 "[object Object]"
              eff = arr.map(([k, v]) => ({ key: k, value: v }));
            }
          } catch (_) {}
        }
        if (typeof eff === 'string') {
          const parsed = this._parsePossibleJson(eff);
          if (parsed && typeof parsed === 'object') return parsed;
          // 支持 "A:10%; B:5%" 或多行 "A:10%\nB:5%"
          const obj = {};
          const parts = eff.split(/[\n;,]+/).map(s => s.trim()).filter(Boolean);
          let pairs = 0;
          for (const p of parts) {
            const m = p.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
            if (m) { obj[m[1].trim()] = m[2].trim(); pairs++; }
          }
          if (pairs > 0) return obj;
          return eff;
        }
      } catch (_) {}
      return eff;
    },

    _safeStringify(obj) {
      try {
        const seen = new WeakSet();
        return JSON.stringify(obj, (k, v) => {
          if (typeof v === 'object' && v !== null) {
            const tag = Object.prototype.toString.call(v);
            if (tag === '[object Map]') return Object.fromEntries(v);
            if (tag === '[object Set]') return Array.from(v);
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
          }
          return v;
        }, 2);
      } catch (_) {
        try { return String(obj); } catch (__){ return '[Object]'; }
      }
    },

    _prettyJson(obj) {
      return this._esc(this._safeStringify(obj));
    },
  };

  window.StatusesComponent = StatusesComponent;
})(window);
