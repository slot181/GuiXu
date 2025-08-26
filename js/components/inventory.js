(function (window) {
  'use strict';

  if (!window.GuixuDOM || !window.GuixuBaseModal || !window.GuixuAPI || !window.GuixuHelpers || !window.GuixuState) {
    console.error('[归墟] InventoryComponent 初始化失败：缺少依赖(GuixuDOM/GuixuBaseModal/GuixuAPI/GuixuHelpers/GuixuState)。');
    return;
  }

  const InventoryComponent = {
    async show() {
      const { $ } = window.GuixuDOM;
      window.GuixuBaseModal.open('inventory-modal');

      const body = $('#inventory-modal .modal-body');
      if (!body) return;

      body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">正在清点行囊...</p>';

      try {
        const currentId = window.GuixuAPI.getCurrentMessageId();
        let messages = await window.GuixuAPI.getChatMessages(currentId);
        let stat_data = messages?.[0]?.data?.stat_data;

        // 楼层回退：当前楼层无 stat_data 时，回退读取 0 楼用于只读展示（对齐 guimi.html）
        if (!stat_data || (typeof stat_data === 'object' && Object.keys(stat_data).length === 0)) {
          try {
            const msgs0 = await window.GuixuAPI.getChatMessages(0);
            const sd0 = msgs0?.[0]?.data?.stat_data;
            if (sd0 && Object.keys(sd0).length > 0) {
              messages = msgs0;
              stat_data = sd0;
              console.info('[归墟] 背包：使用 0 楼 mvu 数据只读展示。');
            }
          } catch (_) {}
        }

        if (window.GuixuMain && typeof window.GuixuMain._deepStripMeta === 'function') {
          stat_data = window.GuixuMain._deepStripMeta(stat_data);
        }
        // 渲染前进行一次安全规范化，修复背包各列表可能出现的“嵌套重复/混合类型重复”
        try {
          if (window.GuixuActionService && typeof window.GuixuActionService.normalizeMvuState === 'function' && stat_data) {
            const normalized = window.GuixuActionService.normalizeMvuState({ stat_data });
            if (normalized && normalized.stat_data) {
              stat_data = normalized.stat_data;
            }
          }
        } catch (_) {}

        if (!stat_data) {
          body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">无法获取背包数据。</p>';
          return;
        }

        body.innerHTML = this.render(stat_data || {});
        this.bindEvents(body);
        this.bindSearch(body);
        this.bindTabs(body);
        this.bindCurrencyUnit(body);
      } catch (error) {
        console.error('[归墟] 加载背包时出错:', error);
        body.innerHTML = `<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">加载背包时出错: ${error.message}</p>`;
      }
    },

    render(stat_data) {
      // 渲染前全域过滤，移除任意层出现的 $__META_EXTENSIBLE__$
      if (window.GuixuMain && typeof window.GuixuMain._deepStripMeta === 'function') {
        stat_data = window.GuixuMain._deepStripMeta(stat_data);
      }
      // 再次进行安全规范化（防御式），确保直接调用 render 时也能去重拍平
      try {
        if (window.GuixuActionService && typeof window.GuixuActionService.normalizeMvuState === 'function' && stat_data) {
          const normalized = window.GuixuActionService.normalizeMvuState({ stat_data });
          if (normalized && normalized.stat_data) {
            stat_data = normalized.stat_data;
          }
        }
      } catch (_) {}
      const h = window.GuixuHelpers;
      const state = window.GuixuState.getState();
      const stonesVal = Number(h.SafeGetValue(stat_data, '灵石', 0)) || 0;
      const Curr = window.GuixuHelpers.Currency;
      const unit = Curr.getPreferredUnit();
      const stonesDisplay = `${Curr.formatFromBase(stonesVal, unit, { decimals: 2, compact: true })} ${unit}`;

      if (!stat_data || Object.keys(stat_data).length === 0) {
        return '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">背包数据为空。</p>';
      }

      const categories = [
        { title: '功法', key: '功法列表', equipable: true },
        { title: '武器', key: '武器列表', equipable: true },
        { title: '防具', key: '防具列表', equipable: true },
        { title: '饰品', key: '饰品列表', equipable: true },
        { title: '法宝', key: '法宝列表', equipable: true },
        { title: '丹药', key: '丹药列表', equipable: false },
        { title: '杂物', key: '其他列表', equipable: false },
      ];

      // 预计算各分类数量与总数（参考人物关系面板标签计数，并与渲染逻辑一致）
      const pendingActions = (state?.pendingActions || []);
      const getDisplayableCount = (rawArr, catTitle) => {
        if (!Array.isArray(rawArr)) return 0;
        let count = 0;
        rawArr.forEach(raw => {
          if (!raw || raw === '$__META_EXTENSIBLE__$') return;
          let item;
          try { item = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { item = null; }
          if (!item || typeof item !== 'object') return;

          const name = h.SafeGetValue(item, 'name', '未知物品');
          const hasQuantity = Object.prototype.hasOwnProperty.call(item, 'quantity');
          const quantity = parseInt(h.SafeGetValue(item, 'quantity', 1), 10);

          const pendingUses = pendingActions
            .filter(a => a.action === 'use' && a.itemName === name)
            .reduce((t, a) => t + (a.quantity || 0), 0);
          const pendingDiscards = pendingActions
            .filter(a => a.action === 'discard' && a.itemName === name)
            .reduce((t, a) => t + (a.quantity || 0), 0);

          const displayQuantity = quantity - pendingUses - pendingDiscards;
          if (hasQuantity && displayQuantity <= 0) return;
          if (!hasQuantity && pendingDiscards > 0) return;

          count += 1;
        });
        return count;
      };
      const counts = {};
      let totalCount = 0;
      categories.forEach(cat => {
        const rawItems = (window.GuixuHelpers?.readList ? window.GuixuHelpers.readList(stat_data, cat.key) : (stat_data?.[cat.key]?.[0] || []));
        const c = getDisplayableCount(rawItems, cat.title);
        counts[cat.title] = c;
        totalCount += c;
      });
      const tabsHtml = [
        `<button class="inv-tab active" data-type="全部"><span class="inv-tab-label">全部</span><span class="inv-tab-count">${totalCount}</span></button>`,
        ...categories.map(c => `<button class="inv-tab" data-type="${c.title}"><span class="inv-tab-label">${c.title}</span><span class="inv-tab-count">${counts[c.title] || 0}</span></button>`)
      ].join('');

      let html = `
        <style>
          /* 标签页布局（移动端/桌面端统一，横向滚动） */
          .inv-tabs {
            display: flex;
            gap: 8px;
            flex-wrap: nowrap;
            overflow-x: auto;
            padding: 4px 0 6px;
            border-bottom: 1px dashed rgba(201,170,113,0.25);
            scrollbar-width: thin;
            margin-bottom: 8px;
          }
          .inv-tab {
            appearance: none;
            border: 1px solid rgba(201,170,113,0.35);
            background: rgba(201,170,113,0.08);
            color: #c9aa71;
            border-radius: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 32px;
            padding: 0 12px;
            font-size: 12px;
            white-space: nowrap;
            cursor: pointer;
            flex: 0 0 auto;
            transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          }
          .inv-tab:hover {
            background: rgba(201,170,113,0.12);
            border-color: rgba(201,170,113,0.5);
          }
          .inv-tab.active {
            background: linear-gradient(180deg, rgba(201,170,113,0.25), rgba(201,170,113,0.12));
            box-shadow: 0 0 6px rgba(201,170,113,0.25) inset;
            border-color: rgba(201,170,113,0.6);
          }
          .inv-tab .inv-tab-label { flex: 1; }
          .inv-tab .inv-tab-count {
            margin-left: 8px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 20px;
            min-width: 22px;
            padding: 0 6px;
            border-radius: 10px;
            border: 1px solid rgba(201,170,113,0.35);
            background: rgba(201,170,113,0.08);
            color: #e8e3d6;
            font-size: 11px;
            line-height: 20px;
          }
          .item-head-right {
            display: inline-flex;
            align-items: center;
            gap: 10px;
          }
          .item-value {
            color: #c9aa71;
            font-weight: 600;
          }
          @media (hover: none) {
            .inv-tab:hover { background: rgba(201,170,113,0.08); }
          }
        </style>

        <div class="inv-tabs" id="inv-tabs">
          ${tabsHtml}
        </div>

        <div class="inventory-search">
          <input type="text" id="inventory-search-input" class="gx-input" placeholder="搜索物品名称或描述…" />
        </div>

        <div class="panel-section">
          <div class="attributes-list" style="padding: 6px 10px;">
            <div class="attribute-item" style="gap:8px; align-items:center;">
              <span class="attribute-name">灵石</span>
              <span class="attribute-value" id="inventory-stones" data-base="${stonesVal}">${stonesDisplay}</span>
              <select id="inventory-currency-unit" class="gx-select" style="height: 26px; padding: 0 8px; background: rgba(26,26,46,0.5); border: 1px solid rgba(201,170,113,0.35); border-radius: 4px; color:#e0dcd1; font-size:12px;">
                <option value="下品灵石" ${unit === '下品灵石' ? 'selected' : ''}>下品灵石</option>
                <option value="中品灵石" ${unit === '中品灵石' ? 'selected' : ''}>中品灵石</option>
                <option value="上品灵石" ${unit === '上品灵石' ? 'selected' : ''}>上品灵石</option>
              </select>
            </div>
          </div>
        </div>
      `;

      categories.forEach(cat => {
        const rawItems = (window.GuixuHelpers?.readList ? window.GuixuHelpers.readList(stat_data, cat.key) : (stat_data?.[cat.key]?.[0] || []));

        html += `<details class="inventory-category" data-cat='${cat.title}' open>`;
        html += `<summary class="inventory-category-title">${cat.title}</summary>`;

        if (Array.isArray(rawItems) && rawItems.length > 0 && rawItems[0] !== '$__META_EXTENSIBLE__$') {
          html += '<div class="inventory-item-list">';

          // 解析并按品阶排序物品
          const parsedItems = [];
          rawItems.forEach(rawItem => {
            try {
              if (!rawItem) {
                console.warn(`在分类 "${cat.title}" 中发现一个空的物品条目，已跳过。`);
                return;
              }
              const item = typeof rawItem === 'string' ? JSON.parse(rawItem) : rawItem;
              if (item && typeof item === 'object') {
                parsedItems.push(item);
              }
            } catch (e) {
              console.error('解析背包物品失败:', rawItem, e);
            }
          });

          const sortedItems = h.sortByTier(parsedItems, (item) => h.SafeGetValue(item, 'tier', '凡品'));

          sortedItems.forEach(item => {
            try {
              const itemJson = JSON.stringify(item).replace(/'/g, "'");

              const name = h.SafeGetValue(item, 'name', '未知物品');
              const id = h.SafeGetValue(item, 'id', null);
              const tier = h.SafeGetValue(item, 'tier', '无');
              const hasQuantity = Object.prototype.hasOwnProperty.call(item, 'quantity');
              const quantity = parseInt(h.SafeGetValue(item, 'quantity', 1), 10);
              const description = h.SafeGetValue(item, 'description', h.SafeGetValue(item, 'effect', '无描述'));

              // 待处理队列扣减数量
              const pendingActions = (state?.pendingActions || []);
              const pendingUses = pendingActions
                .filter(action => action.action === 'use' && action.itemName === name)
                .reduce((total, action) => total + (action.quantity || 0), 0);
              const pendingDiscards = pendingActions
                .filter(action => action.action === 'discard' && action.itemName === name)
                .reduce((total, action) => total + (action.quantity || 0), 0);
              const displayQuantity = quantity - pendingUses - pendingDiscards;

              // 数量用尽/丢弃后隐藏
              if (hasQuantity && displayQuantity <= 0) return;
              if (!hasQuantity && pendingDiscards > 0) return;

              const tierStyle = h.getTierStyle(tier);
              const tierDisplay = tier !== '无' ? `<span style="${tierStyle} margin-right: 15px;">品阶: ${tier}</span>` : '';
              const quantityDisplay = hasQuantity ? `<span class="item-quantity" title="数量: ${displayQuantity}">数量: ${this.formatNumberCompact(displayQuantity)}</span>` : '';
              const baseValue = Number(h.SafeGetValue(item, 'base_value', 0)) || 0;
              const valueDisplay = (() => {
                const unitNow = Curr.getPreferredUnit();
                const shown = Curr.formatFromBase(baseValue, unitNow, { decimals: 2, compact: true });
                return `<span class="item-value" data-base="${baseValue}" title="价值(基础: ${baseValue} 下品灵石)">${shown} ${unitNow}</span>`;
              })();

              // 是否已装备
              const equippedItems = state?.equippedItems || {};
              const isEquipped = id ? Object.values(equippedItems).some(eq => eq && eq.id === id) : false;
              let actionButton = '';

              if (cat.title === '功法') {
                const isEquippedAsMain = id && equippedItems?.zhuxiuGongfa && equippedItems.zhuxiuGongfa.id === id;
                const isEquippedAsAux = id && equippedItems?.fuxiuXinfa && equippedItems.fuxiuXinfa.id === id;

                if (isEquippedAsMain) {
                  actionButton = `
                    <button class="item-unequip-btn" data-slot-id="equip-zhuxiuGongfa" style="margin-left: 5px;">卸下</button>
                    <button class="item-equip-btn" data-equip-type="fuxiu" style="margin-left: 5px; opacity: 0.5; cursor: not-allowed;" disabled>辅修</button>
                  `;
                } else if (isEquippedAsAux) {
                  actionButton = `
                    <button class="item-equip-btn" data-equip-type="zhuxiu" style="margin-left: 5px; opacity: 0.5; cursor: not-allowed;" disabled>主修</button>
                    <button class="item-unequip-btn" data-slot-id="equip-fuxiuXinfa" style="margin-left: 5px;">卸下</button>
                  `;
                } else {
                  actionButton = `
                    <button class="item-equip-btn" data-equip-type="zhuxiu" style="margin-left: 5px;">主修</button>
                    <button class="item-equip-btn" data-equip-type="fuxiu" style="margin-left: 5px;">辅修</button>
                  `;
                }
              } else if (cat.equipable) {
                if (isEquipped) {
                  const slotKey = Object.keys(equippedItems || {}).find(
                    key => equippedItems[key] && equippedItems[key].id === id
                  );
                  actionButton = `<button class="item-unequip-btn" data-slot-id="equip-${slotKey}">卸下</button>`;
                } else {
                  actionButton = `<button class="item-equip-btn">装备</button>`;
                }
              } else if (cat.title === '丹药' || cat.title === '杂物') {
                if (displayQuantity <= 0) {
                  actionButton = `<button class="item-use-btn" disabled>已用完</button>`;
                } else {
                  actionButton = `<button class="item-use-btn">使用</button>`;
                }
              }

              // 所有物品都可丢弃或删除
              actionButton += `<button class="item-discard-btn" style="margin-left: 5px;">丢弃</button>`;
              actionButton += `<button class="item-delete-btn" style="margin-left: 5px;">删除</button>`;

              // 细节说明使用通用渲染工具，避免重复实现
              const itemDetailsHtml = (window.GuixuRenderers && typeof window.GuixuRenderers.renderItemDetailsForInventory === 'function')
                ? window.GuixuRenderers.renderItemDetailsForInventory(item)
                : '';

              html += `
                <div class="inventory-item" data-item-details='${itemJson}' data-category='${cat.title}'>
                  <!-- 第一行：名称 + 品阶 + 右侧数量 -->
                  <div class="item-row item-row--headline">
                    <div class="item-head-left">
                      <span class="item-name" style="${tierStyle}">${name}</span>
                      ${tier !== '无' ? `<span class="item-tier" style="${tierStyle}">【${tier}】</span>` : ''}
                    </div>
                    <div class="item-head-right">
                      ${valueDisplay} ${quantityDisplay}
                    </div>
                  </div>

                  <!-- 第二行：描述 -->
                  <div class="item-row item-row--desc">
                    <div class="item-description">${description}</div>
                  </div>

                  <!-- 第三行：可折叠的详细信息（如特殊词条等） -->
                  ${
                    itemDetailsHtml
                      ? `<details class="item-row item-row--details">
                          <summary class="item-row--details-summary">详细信息</summary>
                          <div class="item-details">${itemDetailsHtml}</div>
                        </details>`
                      : ''
                  }

                  <!-- 第四行：操作按钮（装备/辅修/丢弃/删除等） -->
                  <div class="item-row item-row--actions">
                    ${actionButton}
                  </div>
                </div>
              `;
            } catch (e) {
              console.error('解析背包物品失败:', item, e);
              html += `<div class="inventory-item"><p class="item-description">物品数据格式错误</p></div>`;
            }
          });

          html += '</div>';
        } else {
          html += '<div class="inventory-item-list"><p class="empty-category-text">空空如也</p></div>';
        }

        html += `</details>`;
      });

      return html;
    },

    bindEvents(container) {
      const { $ } = window.GuixuDOM;

      // 防重复绑定：多次 render 后只绑定一次，避免点击一次触发两次事件（导致弹窗出现两次）
      if (container._inventoryClickBound) return;
      container._inventoryClickBound = true;

      container.addEventListener('click', async (e) => {
        const target = e.target;
        const itemElement = target.closest('.inventory-item');
        if (!itemElement) return;

        let item;
        try {
          item = JSON.parse(itemElement.dataset.itemDetails.replace(/'/g, "'") || '{}');
        } catch {
          item = {};
        }
        const category = itemElement.dataset.category;

        if (target.classList.contains('item-equip-btn')) {
          const equipType = target.dataset.equipType; // zhuxiu/fuxiu 或空
          await this.equipItem(item, category, equipType);
        } else if (target.classList.contains('item-unequip-btn')) {
          const slotId = target.dataset.slotId;
          await this.unequipItem(slotId);
        } else if (target.classList.contains('item-use-btn')) {
          await this.useItem(item);
        } else if (target.classList.contains('item-discard-btn')) {
          await this.discardItem(item, category);
        } else if (target.classList.contains('item-delete-btn')) {
          await this.deleteItem(item, category);
        }
      });
    },

    // 搜索绑定与过滤（背包）
    bindSearch(container) {
      try {
        const input = container.querySelector('#inventory-search-input');
        const clear = container.querySelector('#inventory-search-clear');
        const apply = () => {
          const q = (input?.value || '').trim().toLowerCase();
          this.applyInventoryFilter(container, q);
        };
        if (input && !input._boundInventorySearch) {
          input._boundInventorySearch = true;
          input.addEventListener('input', () => apply());
        }
        if (clear && !clear._boundInventoryClear) {
          clear._boundInventoryClear = true;
          clear.addEventListener('click', () => {
            if (input) input.value = '';
            this.applyInventoryFilter(container, '');
          });
        }
      } catch (e) {
        console.warn('[归墟] bindSearch 失败:', e);
      }
    },
    applyInventoryFilter(container, query) {
      try {
        const items = Array.from(container.querySelectorAll('.inventory-item'));
        const matches = (el) => {
          if (!query) return true;
          const name = el.querySelector('.item-name')?.textContent || '';
          const desc = el.querySelector('.item-description')?.textContent || '';
          const tier = el.querySelector('.item-tier')?.textContent || '';
          const text = `${name} ${desc} ${tier}`.toLowerCase();
          return text.includes(query);
        };
        items.forEach(el => {
          el.style.display = matches(el) ? '' : 'none';
        });
        // 若分类下所有物品都隐藏，则提示“无匹配物品”
        const cats = Array.from(container.querySelectorAll('.inventory-category'));
        cats.forEach(cat => {
          const visibleCount = cat.querySelectorAll('.inventory-item-list .inventory-item:not([style*="display: none"])').length;
          const list = cat.querySelector('.inventory-item-list');
          if (!list) return;
          const existed = list.querySelector('.empty-category-text');
          if (visibleCount === 0) {
            if (!existed) {
              const p = document.createElement('p');
              p.className = 'empty-category-text';
              p.textContent = '无匹配物品';
              list.appendChild(p);
            }
          } else {
            if (existed) existed.remove();
          }
        });
      } catch (e) {
        console.warn('[归墟] applyInventoryFilter 失败:', e);
      }
    },

    // 标签页切换（背包）- 与人物关系面板一致的标签交互；移动端与桌面端通用
    bindTabs(container) {
      try {
        const tabsEl = container.querySelector('#inv-tabs');
        if (!tabsEl || tabsEl._boundInventoryTabs) return;
        tabsEl._boundInventoryTabs = true;
        tabsEl.addEventListener('click', (ev) => {
          const btn = ev.target.closest('.inv-tab');
          if (!btn) return;
          tabsEl.querySelectorAll('.inv-tab').forEach(b => b.classList.toggle('active', b === btn));
          const type = btn.getAttribute('data-type') || '全部';
          const cats = container.querySelectorAll('.inventory-category');
          cats.forEach(cat => {
            const t = cat.getAttribute('data-cat') || '';
            cat.style.display = (type === '全部' || type === t) ? '' : 'none';
          });
        });
      } catch (e) {
        console.warn('[归墟] bindTabs 失败:', e);
      }
    },
 
    // 货币单位绑定（移动端/桌面端通用）
    bindCurrencyUnit(container) {
      try {
        if (!container) return;
        const Curr = window.GuixuHelpers.Currency;

        // 全局只绑定一次“单位变化”监听，统一刷新所有背包实例
        const ensureGlobal = () => {
          if (document._guixuCurrencyUnitGlobalBound) return;
          document._guixuCurrencyUnitGlobalBound = true;

          const updateAll = () => {
            const unit = Curr.getPreferredUnit();
            // 同步所有面板中的下拉选择
            document.querySelectorAll('#inventory-currency-unit').forEach(sel => { sel.value = unit; });
            // 同步所有面板中的灵石余额
            document.querySelectorAll('#inventory-stones').forEach(span => {
              const base = Number(span.getAttribute('data-base') || '0') || 0;
              span.textContent = `${Curr.formatFromBase(base, unit, { decimals: 2, compact: true })} ${unit}`;
            });
            // 同步所有物品价值展示
            document.querySelectorAll('.inventory-item .item-value[data-base]').forEach(el => {
              const base = Number(el.getAttribute('data-base') || '0') || 0;
              el.textContent = `${Curr.formatFromBase(base, unit, { decimals: 2, compact: true })} ${unit}`;
            });
          };

          document.addEventListener('guixu:currencyUnitChanged', updateAll, { passive: true });
        };
        ensureGlobal();

        // 绑定当前面板的下拉选择（元素级防重复）
        const sel = container.querySelector('#inventory-currency-unit');
        if (sel && !sel._boundChange) {
          sel._boundChange = true;
          sel.addEventListener('change', () => {
            Curr.setPreferredUnit(sel.value); // 触发全局事件 -> 所有面板同步刷新
          });
        }

        // 打开/重渲染时，立即按当前单位刷新本面板展示
        const unit = Curr.getPreferredUnit();
        if (sel) sel.value = unit;
        const span = container.querySelector('#inventory-stones');
        if (span) {
          const base = Number(span.getAttribute('data-base') || '0') || 0;
          span.textContent = `${Curr.formatFromBase(base, unit, { decimals: 2, compact: true })} ${unit}`;
        }
        container.querySelectorAll('.inventory-item .item-value[data-base]').forEach(el => {
          const base = Number(el.getAttribute('data-base') || '0') || 0;
          el.textContent = `${Curr.formatFromBase(base, unit, { decimals: 2, compact: true })} ${unit}`;
        });
      } catch (e) {
        console.warn('[归墟] bindCurrencyUnit 失败:', e);
      }
    },
 
    // 数值紧凑格式（大数避免挤压UI）：使用 万 / 亿 缩写，最多2位小数
    formatNumberCompact(n) {
      try {
        const num = Number(n);
        if (!Number.isFinite(num)) return String(n);
        const abs = Math.abs(num);
        const trim = (s) => s.replace(/\.0+$/, '').replace(/(\.\d{1,2})\d+$/, '$1');
        if (abs >= 1e8) return trim((num / 1e8).toFixed(2)) + '亿';
        if (abs >= 1e4) return trim((num / 1e4).toFixed(2)) + '万';
        return String(num);
      } catch (_) {
        return String(n);
      }
    },

    // 逻辑：装备
    async equipItem(item, category, equipType = null) {
      const $ = (sel, ctx = document) => ctx.querySelector(sel);
      const h = window.GuixuHelpers;
      const state = window.GuixuState.getState();
      const equipped = { ...(state.equippedItems || {}) };

      const itemId = h.SafeGetValue(item, 'id');
      if (!itemId || itemId === 'N/A') {
        h.showTemporaryMessage('物品无ID，无法装备。');
        return;
      }

      // 分类映射
      const categoryMap = { 武器: 'wuqi', 防具: 'fangju', 饰品: 'shipin', 法宝: 'fabao1', 功法: equipType === 'zhuxiu' ? 'zhuxiuGongfa' : equipType === 'fuxiu' ? 'fuxiuXinfa' : null };
      const slotKey = categoryMap[category];
      if (!slotKey) {
        h.showTemporaryMessage('错误的装备分类或类型。');
        return;
      }

      // 同一物品若在其他槽位，先卸下
      const currentSlot = Object.keys(equipped).find(k => equipped[k]?.id === itemId);
      if (currentSlot && currentSlot !== slotKey) {
        await this.unequipItem(`equip-${currentSlot}`, false);
      }

      // 如果目标槽位已有装备，先卸下
      if (equipped[slotKey]) {
        await this.unequipItem(`equip-${slotKey}`, false);
      }

      // 更新状态
      equipped[slotKey] = item;
      window.GuixuState.update('equippedItems', equipped);

      // 更新槽位DOM
      const slotEl = $(`#equip-${slotKey}`);
      if (slotEl) {
        const tier = h.SafeGetValue(item, 'tier', '凡品');
        const tierStyle = h.getTierStyle(tier);
        slotEl.textContent = h.SafeGetValue(item, 'name');
        slotEl.setAttribute('style', tierStyle);
        slotEl.classList.add('equipped');
        slotEl.dataset.itemDetails = JSON.stringify(item).replace(/'/g, "'");
      }

      // 实时写入装备到变量
      await this.persistEquipmentToVariables(slotKey, item);

      // 加入指令队列
      const pending = [...(state.pendingActions || [])];
      const itemName = h.SafeGetValue(item, 'name');
      const defaultTextMap = {
        wuqi: '武器',
        fangju: '防具',
        shipin: '饰品',
        fabao1: '法宝',
        zhuxiuGongfa: '主修功法',
        fuxiuXinfa: '辅修心法',
      };
      // 去重
      const filtered = pending.filter(a => !(a.action === 'equip' && a.itemName === itemName));
      filtered.push({ action: 'equip', itemName, category: defaultTextMap[slotKey] || category });
      window.GuixuState.update('pendingActions', filtered);

      window.GuixuHelpers.showTemporaryMessage(`已装备 ${window.GuixuHelpers.SafeGetValue(item, 'name')}`);

      // 重新渲染
      await this.show();
      // 刷新属性展示（若需要）
      if (window.GuixuAttributeService?.updateDisplay) window.GuixuAttributeService.updateDisplay();
    },

    // 逻辑：卸下
    async unequipItem(slotId, refresh = true) {
      const $ = (sel, ctx = document) => ctx.querySelector(sel);
      const h = window.GuixuHelpers;
      const state = window.GuixuState.getState();
      const equipped = { ...(state.equippedItems || {}) };
      const slotKey = (slotId || '').replace('equip-', '');

      const slotEl = $(`#equip-${slotKey}`);
      if (!slotEl) return;

      let itemName = '一件装备';
      try {
        const item = JSON.parse((slotEl.dataset.itemDetails || '').replace(/'/g, "'") || '{}');
        itemName = h.SafeGetValue(item, 'name', itemName);
      } catch {}

      // 清状态
      equipped[slotKey] = null;
      window.GuixuState.update('equippedItems', equipped);

      // 清UI
      const defaultTextMap = {
        wuqi: '武器',
        fangju: '防具',
        shipin: '饰品',
        fabao1: '法宝',
        zhuxiuGongfa: '主修功法',
        fuxiuXinfa: '辅修心法',
      };
      slotEl.textContent = defaultTextMap[slotKey] || '空';
      slotEl.classList.remove('equipped');
      slotEl.removeAttribute('style');
      delete slotEl.dataset.itemDetails;

      // 实时写回变量（清空该槽位）
      await this.persistEquipmentToVariables(slotKey, null);

      // 加队列
      const pending = [...(state.pendingActions || [])].filter(a => !(a.action === 'unequip' && a.itemName === itemName));
      pending.push({ action: 'unequip', itemName, category: defaultTextMap[slotKey] });
      window.GuixuState.update('pendingActions', pending);

      window.GuixuHelpers.showTemporaryMessage(`已卸下 ${itemName}`);

      if (refresh) await this.show();
      if (window.GuixuAttributeService?.updateDisplay) window.GuixuAttributeService.updateDisplay();
    },

    // 逻辑：使用（数量类）— 使用统一风格的数量输入弹窗，避免自动使用
    async useItem(item) {
      const h = window.GuixuHelpers;
      const state = window.GuixuState.getState();
      const pending = [...(state.pendingActions || [])];

      const itemName = h.SafeGetValue(item, 'name');
      const originalQuantity = parseInt(h.SafeGetValue(item, 'quantity', 0), 10);

      // 计算已在队列中的使用/丢弃数量，得到可用数量
      const pendingUses = pending.filter(a => a.action === 'use' && a.itemName === itemName).reduce((t, a) => t + (a.quantity || 0), 0);
      const pendingDiscards = pending.filter(a => a.action === 'discard' && a.itemName === itemName).reduce((t, a) => t + (a.quantity || 0), 0);
      const available = originalQuantity - pendingUses - pendingDiscards;

      if (available <= 0) {
        h.showTemporaryMessage(`${itemName} 已用完或已在指令队列中。`);
        return;
      }

      let qty = null;

      // 优先使用与UI一致的数量弹窗；若环境异常则回退到浏览器prompt
      const askNumber = async (min, max, defVal, msg) => {
        if (window.GuixuMain && typeof window.GuixuMain.showNumberPrompt === 'function') {
          return await window.GuixuMain.showNumberPrompt({
            title: '使用消耗品',
            message: msg,
            min, max, defaultValue: defVal
          });
        } else {
          const input = prompt(`${msg}（${min}-${max}）`, String(defVal));
          const n = parseInt(String(input || ''), 10);
          return Number.isFinite(n) ? n : null;
        }
      };

      if (available > 1) {
        qty = await askNumber(1, available, 1, `可用数量：${available}。请输入要使用的数量`);
      } else {
        // 仅有1个时也走确认弹窗，避免“未确认就使用”的体验
        qty = await askNumber(1, 1, 1, `仅有 1 个【${itemName}】。是否确认使用？`);
      }

      // 用户取消或输入非法时不进行任何修改
      if (!Number.isFinite(qty) || qty === null) {
        h.showTemporaryMessage('已取消');
        return;
      }
      if (qty <= 0 || qty > available) {
        h.showTemporaryMessage('无效的数量');
        return;
      }

      // 合并到现有 pending 项或新建（仅在确认后）
      const exist = pending.find(a => a.action === 'use' && a.itemName === itemName);
      if (exist) exist.quantity = (exist.quantity || 0) + qty;
      else pending.push({ action: 'use', itemName, quantity: qty });

      window.GuixuState.update('pendingActions', pending);
      h.showTemporaryMessage(`已将 [使用 ${qty} 个 ${itemName}] 加入指令队列`);

      // 仅在确认后刷新UI
      await this.show();
    },

    // 逻辑：丢弃（数量类/装备类）
    async discardItem(item, category) {
      const hasQuantity = Object.prototype.hasOwnProperty.call(item, 'quantity');
      if (hasQuantity && (category === '丹药' || category === '杂物')) {
        // 简化：采用浏览器 prompt
        const h = window.GuixuHelpers;
        const name = h.SafeGetValue(item, 'name');
        const state = window.GuixuState.getState();
        const pending = (state?.pendingActions || []);
        const currentQuantity = parseInt(h.SafeGetValue(item, 'quantity', 0), 10);
        const pendingUses = pending.filter(a => a.action === 'use' && a.itemName === name).reduce((t, a) => t + (a.quantity || 0), 0);
        const pendingDiscards = pending.filter(a => a.action === 'discard' && a.itemName === name).reduce((t, a) => t + (a.quantity || 0), 0);
        const available = currentQuantity - pendingUses - pendingDiscards;
        if (available <= 0) {
          h.showTemporaryMessage(`${name} 没有可丢弃的数量。`);
          return;
        }

        const input = prompt(`请输入要丢弃的数量（1-${available}）：`, '1');
        const qty = parseInt(input || '0', 10);
        if (!qty || qty <= 0 || qty > available) {
          h.showTemporaryMessage('无效的数量');
          return;
        }
        await this.confirmDiscardItem(item, category, qty);
      } else {
        await this.confirmDiscardItem(item, category, 1);
      }
    },

    async confirmDiscardItem(item, category, quantity = 1) {
      const h = window.GuixuHelpers;
      const name = h.SafeGetValue(item, 'name');

      const state = window.GuixuState.getState();
      const pending = [...(state.pendingActions || [])];
      pending.push({ action: 'discard', itemName: name, category, quantity });

      window.GuixuState.update('pendingActions', pending);

      if (quantity > 1) h.showTemporaryMessage(`已将 [丢弃 ${quantity} 个 ${name}] 加入指令队列`);
      else h.showTemporaryMessage(`已将 [丢弃 ${name}] 加入指令队列`);

      await this.show();
    },

    // 逻辑：删除（直接修改数据）
    async deleteItem(item, category) {
      const h = window.GuixuHelpers;
      const itemName = h.SafeGetValue(item, 'name', '未知物品');
      const itemId = h.SafeGetValue(item, 'id');

      const confirmed = await new Promise(resolve => 
        window.GuixuMain.showCustomConfirm(
          `确定要删除【${itemName}】吗？此操作不可逆，将直接从角色数据中移除，且不会通知AI。`,
          () => resolve(true),
          () => resolve(false)
        )
      );

      if (!confirmed) {
        h.showTemporaryMessage('操作已取消');
        return;
      }

      try {
        // 1. 获取当前最新的 stat_data
        const messages = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
        if (!messages || !messages[0] || !messages[0].data || !messages[0].data.stat_data) {
          throw new Error('无法获取角色数据。');
        }
        const currentMvuState = messages[0].data;
        const stat_data = currentMvuState.stat_data;

        // 2. 找到对应的列表并删除项目
        const categoryMap = {
          '功法': '功法列表', '武器': '武器列表', '防具': '防具列表',
          '饰品': '饰品列表', '法宝': '法宝列表', '丹药': '丹药列表', '杂物': '其他列表'
        };
        const listKey = categoryMap[category];
        if (!listKey || !stat_data[listKey]) {
          throw new Error(`找不到对应的物品列表: ${listKey}`);
        }

        let deleted = false;
        if (Array.isArray(stat_data[listKey][0])) {
          const list = stat_data[listKey][0];
          const itemIndex = list.findIndex(i => {
            const parsed = typeof i === 'string' ? JSON.parse(i) : i;
            // 优先使用ID匹配，如果ID不存在或不匹配，则使用名称进行模糊匹配
            if (itemId && itemId !== 'N/A') {
              return parsed.id === itemId;
            }
            return parsed.name === itemName;
          });

          if (itemIndex !== -1) {
            // 从数组中移除
            list.splice(itemIndex, 1);
            deleted = true;
          }
        } else if (typeof stat_data[listKey] === 'object') {
          // 新对象字典结构：按 id 或 name 定位 key 并删除
          const obj = stat_data[listKey];
          const keys = Object.keys(obj).filter(k => k !== '$meta');
          for (const k of keys) {
            try {
              const v = obj[k];
              const parsed = typeof v === 'string' ? JSON.parse(v) : v;
              if (!parsed || typeof parsed !== 'object') continue;
              if ((itemId && itemId !== 'N/A' && parsed.id === itemId) || parsed.name === itemName) {
                delete obj[k];
                deleted = true;
                break;
              }
            } catch (_) {}
          }
        }

        if (!deleted) {
          throw new Error(`在列表中未找到物品: ${itemName}`);
        }

        // 3. 将修改后的数据写回
        await window.GuixuAPI.setChatMessages([{
          message_id: 0,
          data: currentMvuState,
        }], { refresh: 'none' });

        // 若该物品正被装备，立即清空对应槽位（变量 + 状态 + UI）
        try {
          const state = window.GuixuState.getState();
          const equipped = { ...(state.equippedItems || {}) };
          const slots = ['wuqi', 'fangju', 'shipin', 'fabao1', 'zhuxiuGongfa', 'fuxiuXinfa'];
          for (const slotKey of slots) {
            const eq = equipped[slotKey];
            if (eq && ((itemId && eq.id === itemId) || eq.name === itemName)) {
              equipped[slotKey] = null;
              // 写回变量
              await this.persistEquipmentToVariables(slotKey, null);
              // 更新槽位UI（兜底，避免等待全量刷新）
              const $ = (sel, ctx = document) => ctx.querySelector(sel);
              const slotEl = $(`#equip-${slotKey}`);
              if (slotEl) {
                const defaultTextMap = {
                  wuqi: '武器',
                  fangju: '防具',
                  shipin: '饰品',
                  fabao1: '法宝',
                  zhuxiuGongfa: '主修功法',
                  fuxiuXinfa: '辅修心法',
                };
                slotEl.textContent = defaultTextMap[slotKey] || '空';
                slotEl.classList.remove('equipped');
                slotEl.removeAttribute('style');
                delete slotEl.dataset.itemDetails;
              }
            }
          }
          window.GuixuState.update('equippedItems', equipped);
        } catch (clearErr) {
          console.warn('[归墟] 删除物品后清理装备槽位失败:', clearErr);
        }

        h.showTemporaryMessage(`【${itemName}】已删除。`);

        // 4. 刷新UI
        await this.show();
        // 同步主界面
        if (window.GuixuMain?.updateDynamicData) {
          window.GuixuMain.updateDynamicData();
        }

      } catch (error) {
        console.error('删除物品时出错:', error);
        h.showTemporaryMessage(`删除失败: ${error.message}`);
      }
    },

    // 将装备变动实时写入到酒馆变量（当前楼层与第0楼）- 对象MVU写法
    async persistEquipmentToVariables(slotKey, itemOrNull) {
      try {
        const currentId = window.GuixuAPI.getCurrentMessageId();
        const messages = await window.GuixuAPI.getChatMessages(currentId);
        if (!messages || !messages[0]) return;
        const currentMvuState = messages[0].data || {};
        currentMvuState.stat_data = currentMvuState.stat_data || {};
        const mvuKey = this.getMvuKeyForSlotKey(slotKey, currentMvuState.stat_data);
        if (!mvuKey) return;

        // 对象化写入：槽位为对象或 null（不再数组包装）
        if (itemOrNull && typeof itemOrNull === 'object') {
          currentMvuState.stat_data[mvuKey] = itemOrNull;
        } else {
          currentMvuState.stat_data[mvuKey] = null;
        }

        // 写回当前楼层与第0楼（保持双写）
        const updates = [{ message_id: currentId, data: currentMvuState }];
        if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });
        await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });

        // 同步前端缓存
        window.GuixuState.update('currentMvuState', currentMvuState);
      } catch (e) {
        console.warn('[归墟] persistEquipmentToVariables 失败:', e);
      }
    },

    getMvuKeyForSlotKey(slotKey, stat_data) {
      const map = {
        wuqi: '武器',
        zhuxiuGongfa: '主修功法',
        fuxiuXinfa: '辅修心法',
        fangju: '防具',
        shipin: '饰品',
        fabao1: '法宝',
      };
      // 兼容旧存档：若新键“法宝”不存在而旧键“法宝栏1”存在，则回退
      try {
        const sd = stat_data || (window.GuixuState?.getState()?.currentMvuState?.stat_data) || {};
        if (slotKey === 'fabao1') {
          const hasFabao = Object.prototype.hasOwnProperty.call(sd, '法宝');
          const hasLegacy = Object.prototype.hasOwnProperty.call(sd, '法宝栏1');
          if (!hasFabao && hasLegacy) return '法宝栏1';
        }
      } catch (_) {}
      return map[slotKey] || null;
    },
  };

  window.InventoryComponent = InventoryComponent;
})(window);
