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
      const baseAttrs = {
        fali: parseInt(H.SafeGetValue(stat_data, '基础法力', 0), 10) || 0,
        shenhai: parseInt(H.SafeGetValue(stat_data, '基础神海', 0), 10) || 0,
        daoxin: parseInt(H.SafeGetValue(stat_data, '基础道心', 0), 10) || 0,
        kongsu: parseInt(H.SafeGetValue(stat_data, '基础空速', 0), 10) || 0,
        qiyun: parseInt(H.SafeGetValue(stat_data, '基础气运', 0), 10) || 0,
      };

      // 全来源加成（含明细）
      const { totalFlatBonuses, totalPercentBonuses } = this.calculateAllBonuses(stat_data, state.equippedItems);

      // 上限 = (基础 + Σ固定) * (1 + Σ百分比)
      const calculatedMaxAttrs = {
        fali: Math.floor((baseAttrs.fali + totalFlatBonuses.fali) * (1 + totalPercentBonuses.fali)),
        shenhai: Math.floor((baseAttrs.shenhai + totalFlatBonuses.shenhai) * (1 + totalPercentBonuses.shenhai)),
        daoxin: Math.floor((baseAttrs.daoxin + totalFlatBonuses.daoxin) * (1 + totalPercentBonuses.daoxin)),
        kongsu: Math.floor((baseAttrs.kongsu + totalFlatBonuses.kongsu) * (1 + totalPercentBonuses.kongsu)),
        qiyun: Math.floor((baseAttrs.qiyun + totalFlatBonuses.qiyun) * (1 + totalPercentBonuses.qiyun)),
      };

      // 保底写入（与旧代码兼容）
      try { state.update && state.update('calculatedMaxAttributes', calculatedMaxAttrs); } catch (_) {}

      // 当前值（不超过上限）
      const currentAttrs = {
        fali: Math.min(parseInt(H.SafeGetValue(stat_data, '当前法力', 0), 10) || 0, calculatedMaxAttrs.fali),
        shenhai: Math.min(parseInt(H.SafeGetValue(stat_data, '当前神海', 0), 10) || 0, calculatedMaxAttrs.shenhai),
        daoxin: Math.min(parseInt(H.SafeGetValue(stat_data, '当前道心', 0), 10) || 0, calculatedMaxAttrs.daoxin),
        kongsu: Math.min(parseInt(H.SafeGetValue(stat_data, '当前空速', 0), 10) || 0, calculatedMaxAttrs.kongsu),
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

      // 装备
      try {
        if (equippedItems && typeof equippedItems === 'object') {
          Object.values(equippedItems).forEach(addItem);
        }
      } catch (_) {}

      // 天赋（兼容对象列表）
      try {
        const tianfuList = H.readList(stat_data, '天赋列表');
        Array.isArray(tianfuList) && tianfuList.forEach(tf => {
          if (!tf || tf === '$__META_EXTENSIBLE__$') return;
          const obj = typeof tf === 'string' ? (function(){ try { return JSON.parse(tf); } catch { return null; } })() : tf;
          if (obj) addItem(obj);
        });
      } catch (_) {}

      // 灵根（兼容对象列表）
      try {
        const linggenList = H.readList(stat_data, '灵根列表');
        Array.isArray(linggenList) && linggenList.forEach(lg => {
          if (!lg || lg === '$__META_EXTENSIBLE__$') return;
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

      const base = {
        fali: parseInt(H.SafeGetValue(stat_data, '基础法力', 0), 10) || 0,
        shenhai: parseInt(H.SafeGetValue(stat_data, '基础神海', 0), 10) || 0,
        daoxin: parseInt(H.SafeGetValue(stat_data, '基础道心', 0), 10) || 0,
        kongsu: parseInt(H.SafeGetValue(stat_data, '基础空速', 0), 10) || 0,
        qiyun: parseInt(H.SafeGetValue(stat_data, '基础气运', 0), 10) || 0,
      };

      const sources = [];

      // 收集器
      const pushItem = (type, item) => {
        const name = H.SafeGetValue(item, 'name', H.SafeGetValue(item, '名称', '未知')) || '未知';
        const { flat, percent } = extractBonusesFromItem(item);
        sources.push({ type, name, flat, percent });
      };

      // 装备
      try {
        const eq = st.equippedItems || {};
        Object.values(eq).forEach(it => { if (it) pushItem('物品', it); });
      } catch (_) {}

      // 天赋（兼容对象列表）
      try {
        const tianfuList = H.readList(stat_data, '天赋列表');
        Array.isArray(tianfuList) && tianfuList.forEach(tf => {
          if (!tf || tf === '$__META_EXTENSIBLE__$') return;
          const obj = typeof tf === 'string' ? (function(){ try { return JSON.parse(tf); } catch { return null; } })() : tf;
          if (obj) pushItem('天赋', obj);
        });
      } catch (_) {}

      // 灵根（兼容对象列表）
      try {
        const linggenList = H.readList(stat_data, '灵根列表');
        Array.isArray(linggenList) && linggenList.forEach(lg => {
          if (!lg || lg === '$__META_EXTENSIBLE__$') return;
          const obj = typeof lg === 'string' ? (function(){ try { return JSON.parse(lg); } catch { return null; } })() : lg;
          if (obj) pushItem('灵根', obj);
        });
      } catch (_) {}

      return { base, sources };
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
      const hideTip = () => { tip.style.display = 'none'; };
      document.addEventListener('click', (ev) => {
        const inside = tip.contains(ev.target);
        const row = ev.target.closest?.('.attr-row');
        if (!inside && !row) hideTip();
      });

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
