(function (window) {
  'use strict';

  // 依赖校验
  if (!window.GuixuBaseModal || !window.GuixuAPI || !window.GuixuHelpers) {
    console.error('[归墟][变量编辑器] 初始化失败：缺少依赖(GuixuBaseModal/GuixuAPI/GuixuHelpers)。');
    return;
  }

  // 简易 DOM 助手
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const escapeHTML = (s) => {
    try { return window.GuixuHelpers?.escapeHTML?.(String(s)) ?? String(s); } catch (_) { return String(s); }
  };
  // 规范化键名：去除前后空白
  const NK = (s) => String(s || '').trim();

  // 深拷贝
  function deepClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj ?? {}));
    } catch (_) {
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj)) return obj.map(deepClone);
        const out = {};
        for (const k in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = deepClone(obj[k]);
        }
        return out;
      }
      return obj;
    }
  }

  // 将可能的“字符串化/数组包装/JSON Schema”转为对象
  function tryParseJSON(s) {
    if (typeof s !== 'string') return s;
    const t = s.trim();
    if (!t) return s;
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return JSON.parse(t); } catch (_) { return s; }
    }
    return s;
  }
  function toObjectOrNull(v) {
    let x = v;
    x = tryParseJSON(x);
    if (Array.isArray(x) && x.length === 1 && typeof x[0] === 'object' && x[0] !== null) x = x[0];
    if (typeof x === 'string') {
      const p = tryParseJSON(x);
      if (p && typeof p === 'object') x = p;
    }
    if (x && typeof x === 'object') return x;
    return null;
  }

  // 路径解析（支持：a.b[0].c、['中文键']、["中文键"]、a['属性']、a["属性"]）
  function parsePathSegments(path) {
    const segs = [];
    if (typeof path !== 'string' || !path) return segs;
    const re = /\[(\d+)\]|\['([^']+)'\]|\["([^"]+)"\]|([^. \[\]]+)/g;
    let m;
    while ((m = re.exec(path)) !== null) {
      if (m[1] != null) segs.push(Number(m[1]));       // [123]
      else if (m[2] != null) segs.push(m[2]);          // ['key']
      else if (m[3] != null) segs.push(m[3]);          // ["key"]
      else if (m[4] != null) segs.push(m[4]);          // dot token
    }
    return segs;
  }
  function getByPath(root, path, def) {
    try {
      const segs = parsePathSegments(path);
      let cur = root;
      for (const s of segs) {
        if (cur == null) return def;
        cur = cur[s];
      }
      return cur === undefined ? def : cur;
    } catch (_) { return def; }
  }
  function setByPath(root, path, value) {
    const segs = parsePathSegments(path);
    if (segs.length === 0) return root;
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i];
      const next = segs[i + 1];
      if (cur[s] == null || (typeof cur[s] !== 'object')) {
        cur[s] = (typeof next === 'number') ? [] : {};
      }
      cur = cur[s];
    }
    cur[segs[segs.length - 1]] = value;
    return root;
  }

  // 可扩展字典检测：$meta.extensible 或 JSON Schema 的 properties
  function isExtensibleDict(obj) {
    const o = toObjectOrNull(obj);
    if (!o) return false;
    if (o.$meta && typeof o.$meta === 'object' && o.$meta.extensible === true) return true;
    if (o.properties && typeof o.properties === 'object') return true;
    return false;
  }

  // 归一化“可扩展字典”：返回 { dict, entries, hasProps }
  function normalizeExtensibleDict(obj) {
    const dict = toObjectOrNull(obj) || {};
    const hasProps = !!(dict && typeof dict === 'object' && dict.properties && typeof dict.properties === 'object');
    const source = hasProps ? dict.properties : dict;
    const entries = {};
    if (source && typeof source === 'object') {
      Object.keys(source).forEach(k => {
        if (k === '$meta') return;
        const v = source[k];
        // 字符串化条目尝试解析
        const parsed = tryParseJSON(v);
        entries[k] = parsed;
      });
    }
    return { dict, entries, hasProps };
  }

  // 智能解析输入
  function smartParseInput(raw, preferKind = null) {
    const s = String(raw ?? '').trim();
    if (s === '') return '';
    if (preferKind === 'boolean' || s === 'true' || s === 'false') {
      return (s.toLowerCase() === 'true');
    }
    if (preferKind === 'number' || /^-?\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n)) return n;
    }
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try { return JSON.parse(s); } catch (_) {}
    }
    return s;
  }

  // 控件类型推断
  function inferEditorType(value) {
    const t = typeof value;
    if (t === 'boolean') return 'checkbox';
    if (t === 'number') return 'number';
    if (t === 'string') return 'text';
    return 'json';
  }

  // 规范化键绑定集合（使用去空白后的键名）
  const PLAYER_KEYS_SET = new Set([
    '当前境界','境界映射','修为进度','修为瓶颈',
    '主修功法','辅修心法','武器','防具','饰品','法宝',
    '基础属性','属性上限','当前属性',
    '气运','灵石',
    '天赋列表','灵根列表',
    '当前状态',
    '功法列表','武器列表','防具列表','饰品列表','法宝列表','丹药列表','其他列表',
    '心理年龄','心理年龄上限','生理年龄','生理年龄上限'
  ].map(NK));
  const NPC_ROOT_KEY = '人物关系列表';
  const SYSTEM_KEYS_HINT = new Set([
    '当前第x世','当前时间纪年','归墟空间','本世归墟选择','归墟充能时间'
  ].map(NK));

  // 可添加属性键（固定列表）：用于“属性加成/百分比加成”编辑
  const ALLOWED_ATTR_KEYS = ['法力','神海','道心','空速'];
 
  // 关系限定值与 NPC 储物袋 type 限定值
  const REL_ALLOWED = new Set(['ENEMY','ALLY','NEUTRAL','FRIEND','LOVER']);
  const NPC_BAG_TYPE_ALLOWED = new Set(['功法','武器','防具','饰品','法宝','丹药','其他']);
 
  // 物品与天赋/灵根的 tier 固定枚举（用于渲染下拉与提交校验）
  const ITEM_TIER_ALLOWED = new Set(['练气','筑基','金丹','元婴','化神','合体','飞升','神桥']);
  const ABILITY_TIER_ALLOWED = new Set(['凡品','下品','中品','上品','极品','天品','仙品','神品']);
 
  // 根据所属列表路径推断物品类型（玩家物品列表）
  function _inferItemTypeFromGroupPath(groupPath) {
    try {
      const s = String(groupPath || '');
      if (s.includes("['功法列表']")) return '功法';
      if (s.includes("['武器列表']")) return '武器';
      if (s.includes("['防具列表']")) return '防具';
      if (s.includes("['饰品列表']")) return '饰品';
      if (s.includes("['法宝列表']")) return '法宝';
      if (s.includes("['丹药列表']")) return '丹药';
      if (s.includes("['其他列表']")) return '其他';
      return '';
    } catch (_) { return ''; }
  }
 
  function categorizeKey(key) {
    const nk = NK(key);
    if (nk === NK(NPC_ROOT_KEY)) return 'npc';
    if (PLAYER_KEYS_SET.has(nk)) return 'player';
    if (SYSTEM_KEYS_HINT.has(nk)) return 'system';
    return 'system';
  }

  // 新建条目的模板
  function templateFor(spec) {
    switch (spec) {
      case 'talent':
        return {
          id: '',
          name: '',
          tier: '凡品',
          description: '',
          special_effects: { $meta: { extensible: true } },
          attributes_bonus: {}
        };
      case 'linggen':
        return {
          id: '',
          name: '',
          tier: '凡品',
          description: '',
          special_effects: { $meta: { extensible: true } },
          attributes_bonus: {},
          '百分比加成': {}
        };
      case 'item':
        return {
          id: '',
          name: '',
          type: '',
          tier: '练气', // 默认与物品tier枚举一致
          description: '',
          special_effects: { $meta: { extensible: true } },
          attributes_bonus: {},
          '百分比加成': {},
          base_value: 0,
          quantity: 1
        };
      case 'status':
        return {
          id: '',
          name: '',
          description: '',
          type: 'NEUTRAL',
          duration: 0,
          special_effects: {}
        };
      case 'npc':
        return {
          $meta: { extensible: true },
          id: '',
          name: '',
          '身份背景': '',
          '性格': '',
          '外貌': '',
          '称呼': '',
          '基础属性': { '法力': 0, '神海': 0, '道心': 0, '空速': 0 },
          '属性上限': { '法力': 0, '神海': 0, '道心': 0, '空速': 0 },
          '当前属性': { '法力': 0, '神海': 0, '道心': 0, '空速': 0 },
          '气运': 0,
          'tier': '凡人',
          'level': '',
          '境界映射': 1,
          'favorability': 0,
          'relationship': 'NEUTRAL',
          'allow_view': false,
          'allow_trade': false,
          '深度互动模块': false,
          '当前状态': { $meta: { extensible: true } },
          '灵根列表': { $meta: { extensible: true } },
          '天赋列表': { $meta: { extensible: true } },
          '主修功法': null,
          '辅修心法': null,
          '武器': null,
          '防具': null,
          '饰品': null,
          '法宝': null,
          '灵石': 0,
          '储物袋': { $meta: { extensible: true } },
          'event_history': { $meta: { extensible: true } },
          '内在驱动': { '短期目标': '', '长期夙愿': '', '核心价值观': '', '禁忌与逆鳞': '' },
          '社交网络': {
            '人物关系网': { $meta: { extensible: true } },
            '所属势力': { '势力名称': '', '势力地位': '' }
          },
          '互动模式': { '口癖/口头禅': '', '谈话风格': '', '话题偏好': '', '情报价值': '' },
          '情爱史与性观念': {
            '经验状态': '',
            '首次经历': { '对象描述': '', '体验评价': '' },
            '性观念': '',
            '癖好与禁忌': { '喜好': { $meta: { extensible: true } }, '雷区': { $meta: { extensible: true } } }
          }
        };
      default:
        return {};
    }
  }

  // 组路径拼接（考虑 JSON Schema 的 properties 分支）
  function entryPath(basePath, hasProps, key) {
    return hasProps ? `${basePath}['properties']['${key}']` : `${basePath}['${key}']`;
  }
  function propsPath(basePath) {
    return `${basePath}['properties']`;
  }

  const VariableManagerComponent = {
    _originalStatSnap: null,
    _workingStat: null,
    _lastFilter: '',
    _activeTab: 'player', // 'system' | 'player' | 'npc'

    // 打开面板
    async show() {
      try {
        window.GuixuBaseModal.open('variable-manager-modal');
        window.GuixuBaseModal.setTitle('variable-manager-modal', '变量编辑器');

        // 读取当前楼层数据，必要时回退0楼
        const currentId = window.GuixuAPI.getCurrentMessageId();
        let messages = await window.GuixuAPI.getChatMessages(currentId);
        let mvuData = messages?.[0]?.data || null;
        let stat_data = mvuData?.stat_data;

        if (!stat_data || (typeof stat_data === 'object' && Object.keys(stat_data).length === 0)) {
          try {
            const msgs0 = await window.GuixuAPI.getChatMessages(0);
            const sd0 = msgs0?.[0]?.data?.stat_data;
            if (sd0 && Object.keys(sd0).length > 0) {
              messages = msgs0;
              mvuData = msgs0?.[0]?.data || null;
              stat_data = mvuData?.stat_data;
              console.info('[归墟][变量编辑器] 使用 0 楼 stat_data 作为编辑数据来源。');
            }
          } catch (_) {}
        }

        // 规范化（去占位、解字符串、兼容嵌套）
        try {
          if (window.GuixuMain && typeof window.GuixuMain._deepStripMeta === 'function') {
            stat_data = window.GuixuMain._deepStripMeta(stat_data || {});
          }
        } catch (_) {}
        // 解字符串外壳
        try { stat_data = toObjectOrNull(stat_data) || stat_data || {}; } catch (_) {}

        this._originalStatSnap = deepClone(stat_data || {});
        this._workingStat = deepClone(stat_data || {});
        this._renderShell();
        this._renderTabs();
 
        this._bindFooterActions();

        try { window.GuixuHelpers?.showTemporaryMessage?.('已载入变量，切换标签可查看系统/玩家/NPC。'); } catch (_) {}
      } catch (e) {
        console.error('[归墟][变量编辑器] 打开失败：', e);
        const body = $('#variable-manager-modal .modal-body');
        if (body) body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">载入变量失败。</p>';
      }
    },


    // 布局壳
    _renderShell() {
      const body = $('#variable-manager-modal .modal-body');
      if (!body) return;
      body.innerHTML = `
        <style>
          /* 标签页与分组：复用全局视觉，轻量覆盖 */
          #vm-root { display: flex; flex-direction: column; gap: 10px; }
          .vm-tabs {
            display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;
            border-bottom: 1px dashed rgba(201,170,113,0.25); scrollbar-width: thin;
          }
          .vm-tab {
            appearance: none; border: 1px solid rgba(201,170,113,0.35);
            background: rgba(201,170,113,0.08); color: #c9aa71; border-radius: 18px;
            display: inline-flex; align-items: center; justify-content: center;
            height: 32px; padding: 0 12px; font-size: 12px; white-space: nowrap;
            cursor: pointer; flex: 0 0 auto; transition: background .2s, border-color .2s, box-shadow .2s;
          }
          .vm-tab:hover { background: rgba(201,170,113,0.12); border-color: rgba(201,170,113,0.5); }
          .vm-tab.active {
            background: linear-gradient(180deg, rgba(201,170,113,0.25), rgba(201,170,113,0.12));
            border-color: rgba(201,170,113,0.6); box-shadow: 0 0 6px rgba(201,170,113,0.25) inset;
          }

          #vm-toolbar { display:flex; gap:8px; align-items:center; flex-wrap: wrap; }
          #vm-search { flex: 1 1 260px; min-width: 160px; }

          #vm-content { display: flex; flex-direction: column; gap: 10px; }

          /* 组与条目 */
          .vm-group { border: 1px solid rgba(201,170,113,0.25); border-radius: 10px; background: rgba(26,26,46,0.4); }
          .vm-group > .vm-group-header {
            display:flex; align-items:center; gap:8px; padding: 8px 10px;
            color:#c9aa71; font-weight:700; font-size:13px; border-bottom: 1px dashed rgba(201,170,113,0.25);
          }
          .vm-group .vm-actions { margin-left:auto; display:flex; gap:6px; }
          .vm-group .vm-body { padding: 8px 10px; display:flex; flex-direction:column; gap:8px; }

          details.vm-details { border: 1px dashed rgba(201,170,113,0.25); border-radius: 8px; }
          details.vm-details > summary {
            list-style: none; cursor: pointer; padding: 6px 8px; color:#c9aa71; display:flex; align-items:center; gap:8px;
          }
          /* 新增：标题区容器，修正键名与删除按钮左右位置与移动端居中 */
          details.vm-details > summary .vm-head { display:flex; align-items:center; gap:8px; flex: 1 1 auto; }
          /* 确保在 summary 中，键名不会被 attribute-value 的 margin-left:auto 推到右侧 */
          #variable-manager-modal details.vm-details > summary .attribute-value { margin-left: 0 !important; }
          /* 保证删除按钮永远贴右（桌面端） */
          #variable-manager-modal details.vm-details > summary .vm-actions { margin-left: auto; display:flex; gap:6px; }
          details.vm-details > summary::-webkit-details-marker { display: none; }
          details.vm-details .vm-details-body { padding: 6px 8px; display:flex; flex-direction:column; gap:6px; }

          /* KV编辑行（复用 attributes-list 风格） */
          .attributes-list { padding: 2px; }
          .attribute-item {
            display: flex; align-items: center; justify-content: space-between;
            gap: 8px; padding: 6px 4px; border-bottom: 1px solid rgba(201,170,113,0.10);
          }
          .attribute-item:last-child { border-bottom: none; }
          .attribute-name { color: #8b7355; white-space: nowrap; }
          .attribute-value { color: #e0dcd1; margin-left: auto; }

          .kv-input { width: 100%; }
          .kv-textarea { width: 100%; min-height: 40px; resize: vertical; }

          /* 行变更高亮 */
          .vm-row-changed {
            border: 1px solid rgba(218,165,32,0.7) !important;
            box-shadow: 0 0 10px rgba(218,165,32,0.15) inset;
            border-radius: 6px;
          }

          /* 移动端折叠与布局修正 */
          .guixu-root-container.mobile-view #variable-manager-modal .vm-group .vm-group-header { padding: 8px; }
          .guixu-root-container.mobile-view #variable-manager-modal .attribute-item { gap:6px; }
          /* 顶层条目标题在移动端居中显示，删除按钮换至下一行居中 */
          .guixu-root-container.mobile-view #variable-manager-modal details.vm-details > summary { flex-wrap: wrap; }
          .guixu-root-container.mobile-view #variable-manager-modal details.vm-details > summary .vm-head { order:1; flex: 1 0 100%; justify-content: center; text-align: center; }
          .guixu-root-container.mobile-view #variable-manager-modal details.vm-details > summary .vm-actions { order:2; flex: 1 0 100%; justify-content: center; margin-left: 0; }
        </style>

        <div id="vm-root">
          <div class="vm-tabs" id="vm-tabs">
            <button class="vm-tab" data-tab="system">系统</button>
            <button class="vm-tab active" data-tab="player">玩家</button>
            <button class="vm-tab" data-tab="npc">NPC</button>
          </div>
          <div id="vm-toolbar">
            <input id="vm-search" class="gx-input" type="search" placeholder="搜索（按名称/描述/键名等）" />
          </div>
          <div id="vm-content"></div>
        </div>
      `;

      // 绑定 tabs
      const tabs = $('#vm-tabs');
      tabs.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.vm-tab');
        if (!btn) return;
        const tab = btn.getAttribute('data-tab');
        if (!tab) return;
        this._activeTab = tab;
        tabs.querySelectorAll('.vm-tab').forEach(b => b.classList.toggle('active', b === btn));
        this._renderActiveTabContent();
      });

      // 搜索
      const search = $('#vm-search');
      if (search && !search.dataset.guixuBind) {
        search.addEventListener('input', () => {
          this._lastFilter = String(search.value || '').trim();
          this._applyFilterToContainer($('#vm-content'));
        });
        search.dataset.guixuBind = '1';
      }

      // 内容区事件委托：任何输入变更应用到工作副本
      const content = $('#vm-content');
      content.addEventListener('change', (ev) => this._onEditorCommit(ev));
      content.addEventListener('blur', (ev) => this._onEditorCommit(ev), true);
      content.addEventListener('keydown', (ev) => {
        const t = ev.target;
        if (!t) return;
        if (t.tagName === 'TEXTAREA') return;
        if (ev.key === 'Enter' && (t.matches('input[type=text],input[type=number]'))) {
          ev.preventDefault();
          this._onEditorCommit(ev);
        }
      });
      // 新增/删除按钮委托
      content.addEventListener('click', (ev) => {
        const addBtn = ev.target.closest('[data-vm-add]');
        const delBtn = ev.target.closest('[data-vm-del]');
        if (addBtn) {
          ev.preventDefault();
          const groupPath = addBtn.getAttribute('data-vm-add') || '';
          const spec = addBtn.getAttribute('data-vm-spec') || '';
          this._handleAddEntry(groupPath, spec);
        } else if (delBtn) {
          ev.preventDefault();
          const path = delBtn.getAttribute('data-vm-del') || '';
          this._handleDeleteEntry(path);
        }
      });
    },

    _renderTabs() {
      // 初始化显示当前活动标签
      const tabs = $('#vm-tabs');
      tabs.querySelectorAll('.vm-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === this._activeTab));
      this._renderActiveTabContent();
    },

    _renderActiveTabContent() {
      const host = $('#vm-content');
      if (!host) return;
      if (!this._workingStat) { host.innerHTML = ''; return; }

      switch (this._activeTab) {
        case 'system':
          host.innerHTML = this._renderSystemTab();
          break;
        case 'npc':
          host.innerHTML = this._renderNpcTab();
          break;
        case 'player':
        default:
          host.innerHTML = this._renderPlayerTab();
          break;
      }
      // 应用筛选
      this._applyFilterToContainer(host);
    },

    // 系统标签页：未在 PLAYER/NPC 分类的键 + 系统提示键
    _renderSystemTab() {
      const data = this._workingStat || {};
      const keys = Object.keys(data).filter(k => k !== '$meta');
      // 分类，避免玩家字段误入系统
      const sysKeys = keys.filter(k => categorizeKey(k) === 'system');

      const groups = [];

      // 1) 系统变量（简单KV：非扩展对象）
      const simpleKVs = sysKeys.filter(k => {
        const v = data[k];
        if (v && typeof v === 'object') {
          return !isExtensibleDict(v);
        }
        return true;
      });
      if (simpleKVs.length) {
        const body = this._renderKVList(
          simpleKVs.map(k => [k, data[k], `['${k}']`]).map(([k, v, path]) => this._renderKVRow(k, v, path))
        );
        groups.push(this._wrapGroup('系统变量', body));
      }

      // 2) 可扩展对象 => 单独组（支持 JSON Schema）
      const dictKeys = sysKeys.filter(k => isExtensibleDict(data[k]));
      dictKeys.forEach(k => {
        const { entries, hasProps } = normalizeExtensibleDict(data[k]);
        const basePath = `['${k}']`;
        const addBtn = `<div class="vm-actions" style="padding:8px;">
          <button class="interaction-btn" data-vm-add="${escapeHTML(basePath)}" data-vm-spec="string">新增条目</button>
        </div>`;
        const rows = Object.keys(entries).map(nameKey => this._renderKVRow(nameKey, entries[nameKey], entryPath(basePath, hasProps, nameKey))).join('');
        const body = addBtn + `<div class="attributes-list">${rows || '<div class="ability-empty" style="color:#9a8f7a;font-size:12px;">空</div>'}</div>`;
        groups.push(this._wrapGroup(k, body));
      });

      return groups.join('') || '<div class="ability-empty" style="color:#9a8f7a;font-size:12px;">暂无系统变量</div>';
    },

    // 玩家标签页
    _renderPlayerTab() {
      const st = this._workingStat || {};
      const out = [];

      // 核心数值（简单字段）
      const coreKeys = [
        '当前境界', '境界映射', '修为进度', '修为瓶颈', '气运', '灵石',
        '当前时间纪年', '当前第x世', '归墟空间', '本世归墟选择', '归墟充能时间',
        '心理年龄', '心理年龄上限', '生理年龄', '生理年龄上限'
      ].filter(k => k in st);
      if (coreKeys.length) {
        const body = this._renderKVList(
          coreKeys.map(k => [k, st[k], `['${k}']`]).map(([k, v, path]) => this._renderKVRow(k, v, path))
        );
        out.push(this._wrapGroup('基础与时间', body));
      }

      // 三组属性
      if (st['基础属性']) out.push(this._wrapGroup('基础属性', this._renderObjectAsKV('基础属性', "['基础属性']", st['基础属性'])));
      if (st['属性上限']) out.push(this._wrapGroup('属性上限', this._renderObjectAsKV('属性上限', "['属性上限']", st['属性上限'])));
      if (st['当前属性']) out.push(this._wrapGroup('当前属性', this._renderObjectAsKV('当前属性', "['当前属性']", st['当前属性'])));

      // 装备栏（六项） - 直接 JSON 编辑
      const equipKeys = ['主修功法', '辅修心法', '武器', '防具', '饰品', '法宝'].filter(k => k in st);
      if (equipKeys.length) {
        const html = equipKeys.map(k => this._renderJsonEntry(k, st[k], `['${k}']`, '物品对象（或 null）')).join('');
        out.push(this._wrapGroup('装备栏（对象直存）', `<div class="attributes-list">${html}</div>`));
      }

      // 可扩展列表：天赋/灵根（即使被去掉 $meta 也要渲染空组以便新增）
      if (toObjectOrNull(st['天赋列表'])) {
        out.push(this._renderExtensibleDictGroup('天赋列表', "['天赋列表']", st['天赋列表'], { spec: 'talent' }));
      }
      if (toObjectOrNull(st['灵根列表'])) {
        out.push(this._renderExtensibleDictGroup('灵根列表', "['灵根列表']", st['灵根列表'], { spec: 'linggen' }));
      }

      // 当前状态（可扩展字典）
      if (toObjectOrNull(st['当前状态'])) {
        out.push(this._renderStatusDictGroup('当前状态', "['当前状态']", st['当前状态']));
      }

      // 背包/物品类列表（可扩展字典）—— 显示功法/武器/防具/饰品/法宝/丹药/其他 共7组
      // 注意：即使 $meta 被剥离为空对象 {}，也要渲染空组，便于新增物品
      const packListKeys = ['功法列表', '武器列表', '防具列表', '饰品列表', '法宝列表', '丹药列表', '其他列表'];
      packListKeys.forEach(k => {
        const v = st[k];
        const o = toObjectOrNull(v);
        if (!o) return;
        out.push(this._renderItemDictGroup(k, `['${k}']`, v));
      });

      return out.join('') || '<div class="能力-empty" style="color:#9a8f7a;font-size:12px;">暂无玩家数据</div>';
    },

    // NPC 标签页
    _renderNpcTab() {
      const st = this._workingStat || {};
      const raw = st[NPC_ROOT_KEY];
      const rootObj = toObjectOrNull(raw);

      if (!rootObj) {
        return '<div class="ability-empty" style="color:#9a8f7a;font-size:12px;">没有 NPC 数据（人物关系列表）</div>';
      }

      // 支持 JSON Schema 的 properties 容器
      const { entries, hasProps } = normalizeExtensibleDict(rootObj);

      const basePath = `['${NPC_ROOT_KEY}']`;
      const headerActions = `
        <div class="vm-actions" style="padding:8px;">
          <button class="interaction-btn" data-vm-add="${escapeHTML(basePath)}" data-vm-spec="npc">新增NPC</button>
        </div>
      `;

      const names = Object.keys(entries);
      if (!names.length) {
        return this._wrapGroup('人物关系列表', headerActions + '<div class="ability-empty" style="color:#9a8f7a;font-size:12px;">空</div>');
      }

      const entriesHtml = names.map(nameKey => {
        const npc = toObjectOrNull(entries[nameKey]) || entries[nameKey] || {};
        const path = entryPath(basePath, hasProps, nameKey);
        const nm = window.GuixuHelpers.SafeGetValue(npc, 'name', nameKey);
        const tier = window.GuixuHelpers.SafeGetValue(npc, 'tier', '凡人');
        const relationship = window.GuixuHelpers.SafeGetValue(npc, 'relationship', 'NEUTRAL');
        const favor = Number(window.GuixuHelpers.SafeGetValue(npc, 'favorability', 0)) || 0;

        const head = `<span class="attribute-value" style="${window.GuixuHelpers.getTierStyle ? window.GuixuHelpers.getTierStyle(tier) : ''}">${escapeHTML(nm)}</span>
                      <span class="attribute-name">【${escapeHTML(relationship)}】 好感:${favor}</span>`;

        // 基础KV（补充“深度互动模块”）
        const basicKV = ['id','name','tier','level','relationship','favorability','allow_view','allow_trade','境界映射','气运','深度互动模块'].filter(k => k in npc);
        const basicHtml = this._renderKVList(
          basicKV.map(k => this._renderKVRow(k, npc[k], `${path}['${k}']`))
        );

        // 三组属性
        const attrsHtml = `
          ${npc['基础属性'] ? this._wrapSubDetails('基础属性', this._renderObjectAsKV('基础属性', `${path}['基础属性']`, npc['基础属性'])) : ''}
          ${npc['属性上限'] ? this._wrapSubDetails('属性上限', this._renderObjectAsKV('属性上限', `${path}['属性上限']`, npc['属性上限'])) : ''}
          ${npc['当前属性'] ? this._wrapSubDetails('当前属性', this._renderObjectAsKV('当前属性', `${path}['当前属性']`, npc['当前属性'])) : ''}
        `;

        // 装备栏
        const equipHtml = ['主修功法','辅修心法','武器','防具','饰品','法宝']
          .filter(k => k in npc)
          .map(k => this._renderJsonEntry(k, npc[k], `${path}['${k}']`, '物品对象（或 null）')).join('');
        const equipBlock = equipHtml ? this._wrapSubDetails('装备栏（对象直存）', `<div class="attributes-list">${equipHtml}</div>`) : '';

        // 状态/灵根/天赋/储物袋（支持 JSON Schema）
        const statusBlock = (toObjectOrNull(npc['当前状态']))
          ? this._wrapSubDetails('当前状态', this._renderStatusDictContent(`${path}['当前状态']`, npc['当前状态']))
          : '';

        const linggenBlock = (toObjectOrNull(npc['灵根列表']))
          ? this._wrapSubDetails('灵根列表', this._renderAbilityDictContent(`${path}['灵根列表']`, npc['灵根列表'], { spec: 'linggen' }))
          : '';
 
        const talentBlock = (toObjectOrNull(npc['天赋列表']))
          ? this._wrapSubDetails('天赋列表', this._renderAbilityDictContent(`${path}['天赋列表']`, npc['天赋列表'], { spec: 'talent' }))
          : '';

        const bagBlock = (toObjectOrNull(npc['储物袋']))
          ? this._wrapSubDetails('储物袋', this._renderItemDictContent(`${path}['储物袋']`, npc['储物袋']))
          : '';

        const innerBlock = npc['内在驱动']
          ? this._wrapSubDetails('内在驱动', this._renderObjectAsKV('内在驱动', `${path}['内在驱动']`, npc['内在驱动']))
          : '';

        const socialBlock = (() => {
          const soc = toObjectOrNull(npc['社交网络']) || npc['社交网络'];
          if (!soc || typeof soc !== 'object') return '';
          const net = soc['人物关系网'];
          const org = soc['所属势力'];
          const netHtml = (toObjectOrNull(net))
            ? this._wrapSubDetails('人物关系网', this._renderSocialNetDictContent(`${path}['社交网络']['人物关系网']`, net))
            : '';
          const orgHtml = org ? this._wrapSubDetails('所属势力', this._renderObjectAsKV('所属势力', `${path}['社交网络']['所属势力']`, org)) : '';
          return netHtml + orgHtml;
        })();

        const interactBlock = npc['互动模式']
          ? this._wrapSubDetails('互动模式', this._renderObjectAsKV('互动模式', `${path}['互动模式']`, npc['互动模式']))
          : '';

        const loveBlock = (() => {
          const love = toObjectOrNull(npc['情爱史与性观念']) || npc['情爱史与性观念'];
          if (!love || typeof love !== 'object') return '';
          const kv1 = this._renderKVList([
            this._renderKVRow('经验状态', love['经验状态'], `${path}['情爱史与性观念']['经验状态']`),
            this._renderKVRow('性观念', love['性观念'], `${path}['情爱史与性观念']['性观念']`)
          ]);
          const firstHtml = love['首次经历'] ? this._wrapSubDetails('首次经历', this._renderObjectAsKV('首次经历', `${path}['情爱史与性观念']['首次经历']`, love['首次经历'])) : '';
          const pref = toObjectOrNull(love['癖好与禁忌']) || love['癖好与禁忌'];
          const hobHtml = (pref && pref['喜好'] && isExtensibleDict(pref['喜好']))
            ? this._wrapSubDetails('癖好（喜好）', this._renderGenericStringDict(`${path}['情爱史与性观念']['癖好与禁忌']['喜好']`, pref['喜好']))
            : '';
          const tabooHtml = (pref && pref['雷区'] && isExtensibleDict(pref['雷区']))
            ? this._wrapSubDetails('禁忌（雷区）', this._renderGenericStringDict(`${path}['情爱史与性观念']['癖好与禁忌']['雷区']`, pref['雷区']))
            : '';
          return this._wrapSubDetails('情爱史与性观念', kv1 + firstHtml + hobHtml + tabooHtml);
        })();

        const historyBlock = (toObjectOrNull(npc['event_history']))
          ? this._wrapSubDetails('事件经历', this._renderGenericStringDict(`${path}['event_history']`, npc['event_history']))
          : '';

        return `
          <details class="vm-details vm-entry" data-label="${escapeHTML(nm)} ${escapeHTML(relationship)} ${escapeHTML(tier)}" data-vm-path="${path}">
            <!-- 顶层NPC条目标题：包装为 vm-head，便于桌面端左右布局与移动端居中 -->
            <summary><span class="vm-head">${head}</span>
              <span class="vm-actions">
                <button class="interaction-btn danger-btn" data-vm-del="${path}">删除</button>
              </span>
            </summary>
            <div class="vm-details-body">
              ${basicHtml}
              ${attrsHtml}
              ${equipBlock}
              ${statusBlock}
              ${linggenBlock}
              ${talentBlock}
              ${bagBlock}
              ${innerBlock}
              ${socialBlock}
              ${interactBlock}
              ${loveBlock}
              ${historyBlock}
            </div>
          </details>
        `;
      }).join('');

      return this._wrapGroup('人物关系列表', headerActions + entriesHtml);
    },

    // --- 渲染工具 ---

    _wrapGroup(title, innerHtml) {
      return `
        <section class="vm-group">
          <div class="vm-group-header"><span>${escapeHTML(title)}</span></div>
          <div class="vm-body">${innerHtml}</div>
        </section>
      `;
    },
    _wrapSubDetails(title, innerHtml) {
      return `
        <details class="vm-details">
          <summary>${escapeHTML(title)}</summary>
          <div class="vm-details-body">${innerHtml}</div>
        </details>
      `;
    },

    _renderKVList(rowsHtmlArray) {
      return `<div class="attributes-list">${rowsHtmlArray.join('')}</div>`;
    },
    _renderKVRow(label, value, path) {
      const editorType = inferEditorType(value);
      const ctrl = (() => {
        if (editorType === 'checkbox') {
          const checked = value ? 'checked' : '';
          return `<input class="gx-input" type="checkbox" data-vm-path="${escapeHTML(path)}" ${checked} />`;
        }
        if (editorType === 'number') {
          return `<input class="gx-input kv-input" type="number" data-vm-path="${escapeHTML(path)}" value="${escapeHTML(value)}" />`;
        }
        if (editorType === 'text') {
          return `<input class="gx-input kv-input" type="text" data-vm-path="${escapeHTML(path)}" value="${escapeHTML(value)}" />`;
        }
        // json
        const json = (() => { try { return value == null ? '' : JSON.stringify(value, null, 2); } catch (_) { return String(value); } })();
        return `<textarea class="gx-input kv-textarea" data-vm-path="${escapeHTML(path)}">${escapeHTML(json)}</textarea>`;
      })();
      return `
        <div class="attribute-item" data-label="${escapeHTML(label)} ${escapeHTML(String(value))}">
          <span class="attribute-name">${escapeHTML(label)}</span>
          <span class="attribute-value" style="flex:1; max-width: 70%;">
            ${ctrl}
          </span>
        </div>
      `;
    },

    /**
     * 渲染“枚举选择”的一行（使用下拉框）
     * 用途：限制 tier 等字段只能在给定枚举内选择，避免自由输入。
     */
    _renderEnumRow(label, value, path, options = []) {
      const opts = Array.isArray(options) ? options : [];
      const cur = String(value ?? '');
      // 若当前值不在枚举中，仍然保留一个选项以避免显示为空
      const list = opts.slice();
      if (cur && !list.includes(cur)) list.push(cur);
      const optionsHtml = list.map(v => {
        const s = String(v);
        const sel = (s === cur) ? 'selected' : '';
        return `<option value="${escapeHTML(s)}" ${sel}>${escapeHTML(s)}</option>`;
      }).join('');
      const ctrl = `<select class="gx-input kv-input" data-vm-path="${escapeHTML(path)}">${optionsHtml}</select>`;
      return `
        <div class="attribute-item" data-label="${escapeHTML(label)} ${escapeHTML(cur)}">
          <span class="attribute-name">${escapeHTML(label)}</span>
          <span class="attribute-value" style="flex:1; max-width: 70%;">${ctrl}</span>
        </div>
      `;
    },

    _renderObjectAsKV(title, basePath, obj) {
      const o = toObjectOrNull(obj) || obj;
      if (!o || typeof o !== 'object' || Array.isArray(o)) {
        return this._renderKVList([ this._renderKVRow(title, o, basePath) ]);
      }
      const keys = Object.keys(o).filter(k => k !== '$meta');
      const rows = keys.map(k => this._renderKVRow(k, o[k], `${basePath}['${k}']`));
      return this._renderKVList(rows);
    },

    // 带删除按钮的 KV 行（用于属性加成/百分比加成/词条/喜好/雷区/事件经历等）
    _renderKVRowWithDelete(label, value, path) {
      const editorType = inferEditorType(value);
      const ctrl = (() => {
        if (editorType === 'checkbox') {
          const checked = value ? 'checked' : '';
          return `<input class="gx-input" type="checkbox" data-vm-path="${escapeHTML(path)}" ${checked} />`;
        }
        if (editorType === 'number') {
          return `<input class="gx-input kv-input" type="number" data-vm-path="${escapeHTML(path)}" value="${escapeHTML(value)}" />`;
        }
        if (editorType === 'text') {
          return `<input class="gx-input kv-input" type="text" data-vm-path="${escapeHTML(path)}" value="${escapeHTML(value)}" />`;
        }
        // json
        const json = (() => { try { return value == null ? '' : JSON.stringify(value, null, 2); } catch (_) { return String(value); } })();
        return `<textarea class="gx-input kv-textarea" data-vm-path="${escapeHTML(path)}">${escapeHTML(json)}</textarea>`;
      })();
      const delBtn = `<button class="interaction-btn danger-btn" data-vm-del="${escapeHTML(path)}" style="margin-left:6px;">删除</button>`;
      return `
        <div class="attribute-item" data-label="${escapeHTML(label)} ${escapeHTML(String(value))}">
          <span class="attribute-name">${escapeHTML(label)}</span>
          <span class="attribute-value" style="flex:1; max-width: 70%;">
            ${ctrl}
            ${delBtn}
          </span>
        </div>
      `;
    },

    // 渲染对象为 KV 列表（每行带删除按钮）
    _renderObjectAsKVWithDelete(title, basePath, obj) {
      const o = toObjectOrNull(obj) || obj;
      if (!o || typeof o !== 'object' || Array.isArray(o)) {
        return this._renderKVList([ this._renderKVRowWithDelete(title, o, basePath) ]);
      }
      const keys = Object.keys(o).filter(k => k !== '$meta');
      const rows = keys.map(k => this._renderKVRowWithDelete(k, o[k], `${basePath}['${k}']`));
      return this._renderKVList(rows);
    },

    _renderJsonEntry(label, value, path, desc = '') {
      const json = (() => { try { return value == null ? '' : JSON.stringify(value, null, 2); } catch (_) { return String(value); } })();
      return `
        <div class="attribute-item" data-label="${escapeHTML(label)} ${escapeHTML(String(value && (value.name || value.名称 || '')))}">
          <span class="attribute-name">${escapeHTML(label)}</span>
          <span class="attribute-value" style="flex:1; max-width: 70%;">
            <textarea class="gx-input kv-textarea" data-vm-path="${escapeHTML(path)}" placeholder="${escapeHTML(desc)}">${escapeHTML(json)}</textarea>
          </span>
        </div>
      `;
    },

    // 可扩展字典(通用字符串字典)
    _renderGenericStringDict(basePath, dictObj) {
      const { entries, hasProps } = normalizeExtensibleDict(dictObj);
      const keys = Object.keys(entries);
      const rows = keys.map(k => this._renderKVRowWithDelete(k, entries[k], entryPath(basePath, hasProps, k))).join('');
      const addBtn = `<div class="vm-actions"><button class="interaction-btn" data-vm-add="${escapeHTML(basePath)}" data-vm-spec="string">新增条目</button></div>`;
      return addBtn + `<div class="attributes-list">${rows || '<div class="ability-empty" style="color:#9a8f7a;font-size:12px;">空</div>'}</div>`;
    },

    // 属性加成/百分比加成编辑器：固定键可选添加
    _renderAttrDictContent(basePath, dictObj, { kind = 'flat' } = {}) {
      const label = (kind === 'percent') ? '百分比加成' : '属性加成';
      const o = toObjectOrNull(dictObj) || {};
      const rows = this._renderObjectAsKVWithDelete(label, basePath, o);
      const spec = (kind === 'percent') ? 'attr-percent' : 'attr-flat';
      const addBtn = `<div class="vm-actions"><button class="interaction-btn" data-vm-add="${escapeHTML(basePath)}" data-vm-spec="${spec}">添加${label}</button></div>`;
      return addBtn + rows;
    },

    // 词条编辑器：自由键名添加（字符串值/对象值均可）
    _renderSpecialEffectsDictContent(basePath, dictObj) {
      const o = toObjectOrNull(dictObj) || {};
      const rows = this._renderObjectAsKVWithDelete('词条', basePath, o);
      const addBtn = `<div class="vm-actions"><button class="interaction-btn" data-vm-add="${escapeHTML(basePath)}" data-vm-spec="string">新增词条</button></div>`;
      return addBtn + rows;
    },

    // 状态字典
    _renderStatusDictGroup(title, basePath, dictObj) {
      const inner = this._renderStatusDictContent(basePath, dictObj);
      return this._wrapGroup(title, inner);
    },
    _renderStatusDictContent(basePath, dictObj) {
      const { entries, hasProps } = normalizeExtensibleDict(dictObj);
      const keys = Object.keys(entries);
      const entriesHtml = keys.map(k => {
        const path = entryPath(basePath, hasProps, k);
        const it = toObjectOrNull(entries[k]) || entries[k] || {};
        const nm = window.GuixuHelpers.SafeGetValue(it, 'name', k);
        const type = String(window.GuixuHelpers.SafeGetValue(it, 'type', 'NEUTRAL')).toUpperCase();
        const dur = Number(window.GuixuHelpers.SafeGetValue(it, 'duration', 0)) || 0;
        const head = `<span class="attribute-value">${escapeHTML(nm)}</span><span class="attribute-name">【${escapeHTML(type)}】 持续:${dur}h</span>`;
        const kvMain = ['id','name','description','type','duration'].filter(f => f in it);
        const mainHtml = this._renderKVList(kvMain.map(f => this._renderKVRow(f, it[f], `${path}['${f}']`)));

        const se = it['special_effects'];
        const seHtml = (se && typeof se === 'object')
          ? this._wrapSubDetails('词条', this._renderSpecialEffectsDictContent(`${path}['special_effects']`, se))
          : '';

        return `
          <details class="vm-details vm-entry" data-label="${escapeHTML(nm)} ${escapeHTML(type)}" data-vm-path="${path}">
            <summary><span class="vm-head">${head}</span>
              <span class="vm-actions">
                <button class="interaction-btn danger-btn" data-vm-del="${path}">删除</button>
              </span>
            </summary>
            <div class="vm-details-body">${mainHtml}${seHtml}</div>
          </details>
        `;
      }).join('');
      const addBtn = `<div class="vm-actions" style="padding:8px;">
        <button class="interaction-btn" data-vm-add="${escapeHTML(basePath)}" data-vm-spec="status">新增状态</button>
      </div>`;
      return addBtn + (entriesHtml || '<div class="能力-empty" style="color:#9a8f7a;font-size:12px;">空</div>');
    },

    // 天赋/灵根字典
    _renderExtensibleDictGroup(title, basePath, dictObj, { spec = 'generic' } = {}) {
      const inner = this._renderAbilityDictContent(basePath, dictObj, { spec });
      return this._wrapGroup(title, inner);
    },
    _renderAbilityDictContent(basePath, dictObj, { spec = 'generic' } = {}) {
      const { entries, hasProps } = normalizeExtensibleDict(dictObj);
      const keys = Object.keys(entries);
      const entriesHtml = keys.map(k => {
        const path = entryPath(basePath, hasProps, k);
        const it = toObjectOrNull(entries[k]) || entries[k] || {};
        const name = window.GuixuHelpers.SafeGetValue(it, 'name', window.GuixuHelpers.SafeGetValue(it, '名称', k));
        const tier = window.GuixuHelpers.SafeGetValue(it, 'tier', window.GuixuHelpers.SafeGetValue(it, '品阶', '凡品'));
        const desc = window.GuixuHelpers.SafeGetValue(it, 'description', window.GuixuHelpers.SafeGetValue(it, '描述', ''));
        const head = `<span class="attribute-value" style="${window.GuixuHelpers.getTierStyle ? window.GuixuHelpers.getTierStyle(tier) : ''}">${escapeHTML(name)}</span><span class="attribute-name">【${escapeHTML(tier)}】</span>`;

        /* 天赋/灵根：将 tier 渲染为下拉，限制为固有值 */
        const mainRows = [];
        if ('id' in it) mainRows.push(this._renderKVRow('id', it['id'], `${path}['id']`));
        if ('name' in it) mainRows.push(this._renderKVRow('name', it['name'], `${path}['name']`));
        if ('tier' in it) mainRows.push(this._renderEnumRow('tier', it['tier'], `${path}['tier']`, Array.from(ABILITY_TIER_ALLOWED)));
        if ('description' in it) mainRows.push(this._renderKVRow('description', it['description'], `${path}['description']`));
        const mainHtml = this._renderKVList(mainRows);

        const ab = it['attributes_bonus'];
        const abHtml = (ab && typeof ab === 'object')
          ? this._wrapSubDetails('属性加成', this._renderAttrDictContent(`${path}['attributes_bonus']`, ab, { kind: 'flat' }))
          : '';

        const pb = it['百分比加成'];
        const pbHtml = (spec === 'linggen' && pb && typeof pb === 'object')
          ? this._wrapSubDetails('百分比加成', this._renderAttrDictContent(`${path}['百分比加成']`, pb, { kind: 'percent' }))
          : '';

        const se = it['special_effects'];
        const seHtml = (se && typeof se === 'object')
          ? this._wrapSubDetails('词条', this._renderSpecialEffectsDictContent(`${path}['special_effects']`, se))
          : '';

        return `
          <details class="vm-details vm-entry" data-label="${escapeHTML(name)} ${escapeHTML(tier)} ${escapeHTML(desc)}" data-vm-path="${path}">
            <summary><span class="vm-head">${head}</span>
              <span class="vm-actions">
                <button class="interaction-btn danger-btn" data-vm-del="${path}">删除</button>
              </span>
            </summary>
            <div class="vm-details-body">
              ${mainHtml}
              ${abHtml}
              ${pbHtml}
              ${seHtml}
            </div>
          </details>
        `;
      }).join('');

      const addBtn = `<div class="vm-actions" style="padding:8px;">
        <button class="interaction-btn" data-vm-add="${escapeHTML(basePath)}" data-vm-spec="${escapeHTML(spec)}">新增条目</button>
      </div>`;
      return addBtn + (entriesHtml || '<div class="能力-empty" style="color:#9a8f7a;font-size:12px;">空</div>');
    },

    // 物品类字典（背包/功法等）
    _renderItemDictGroup(title, basePath, dictObj) {
      const inner = this._renderItemDictContent(basePath, dictObj);
      return this._wrapGroup(title, inner);
    },
    _renderItemDictContent(basePath, dictObj) {
      const { entries, hasProps } = normalizeExtensibleDict(dictObj);
      const keys = Object.keys(entries);
      const entriesHtml = keys.map(k => {
        const path = entryPath(basePath, hasProps, k);
        const it = toObjectOrNull(entries[k]) || entries[k] || {};
        const name = window.GuixuHelpers.SafeGetValue(it, 'name', k);
        const tier = window.GuixuHelpers.SafeGetValue(it, 'tier', '练气');
        const type = window.GuixuHelpers.SafeGetValue(it, 'type', '');
        const qty = window.GuixuHelpers.SafeGetValue(it, 'quantity', null);
        const head = `<span class="attribute-value" style="${window.GuixuHelpers.getTierStyle ? window.GuixuHelpers.getTierStyle(tier) : ''}">${escapeHTML(name)}</span><span class="attribute-name">【${escapeHTML(tier)}】${type ? ' - ' + escapeHTML(type) : ''}${qty!=null ? (' ×' + qty) : ''}</span>`;

        /* 物品类：将 tier 渲染为下拉，限制为固有值；NPC储物袋的 type 也改为下拉（固定枚举） */
        const baseRows = [];
        if ('id' in it) baseRows.push(this._renderKVRow('id', it['id'], `${path}['id']`));
        if ('name' in it) baseRows.push(this._renderKVRow('name', it['name'], `${path}['name']`));
        const isNpcBag = basePath.includes("['储物袋']");
        if ('type' in it) {
          if (isNpcBag) {
            /* NPC 储物袋：type 使用下拉，限定固定枚举 */
            baseRows.push(this._renderEnumRow('type', it['type'], `${path}['type']`, Array.from(NPC_BAG_TYPE_ALLOWED)));
          } else {
            baseRows.push(this._renderKVRow('type', it['type'], `${path}['type']`));
          }
        }
        if ('tier' in it) baseRows.push(this._renderEnumRow('tier', it['tier'], `${path}['tier']`, Array.from(ITEM_TIER_ALLOWED)));
        if ('description' in it) baseRows.push(this._renderKVRow('description', it['description'], `${path}['description']`));
        if ('base_value' in it) baseRows.push(this._renderKVRow('base_value', it['base_value'], `${path}['base_value']`));
        if ('quantity' in it) baseRows.push(this._renderKVRow('quantity', it['quantity'], `${path}['quantity']`));
        const baseHtml = this._renderKVList(baseRows);

        const ab = it['attributes_bonus'];
        const abHtml = (ab && typeof ab === 'object')
          ? this._wrapSubDetails('属性加成', this._renderAttrDictContent(`${path}['attributes_bonus']`, ab, { kind: 'flat' }))
          : '';

        const pb = it['百分比加成'];
        const pbHtml = (pb && typeof pb === 'object')
          ? this._wrapSubDetails('百分比加成', this._renderAttrDictContent(`${path}['百分比加成']`, pb, { kind: 'percent' }))
          : '';

        const se = it['special_effects'];
        const seHtml = (se && typeof se === 'object')
          ? this._wrapSubDetails('词条', this._renderSpecialEffectsDictContent(`${path}['special_effects']`, se))
          : '';

        return `
          <details class="vm-details vm-entry" data-label="${escapeHTML(name)} ${escapeHTML(tier)} ${escapeHTML(type)}" data-vm-path="${path}">
            <summary><span class="vm-head">${head}</span>
              <span class="vm-actions">
                <button class="interaction-btn danger-btn" data-vm-del="${path}">删除</button>
              </span>
            </summary>
            <div class="vm-details-body">
              ${baseHtml}
              ${abHtml}
              ${pbHtml}
              ${seHtml}
            </div>
          </details>
        `;
      }).join('');

      const addBtn = `<div class="vm-actions" style="padding:8px;">
        <button class="interaction-btn" data-vm-add="${escapeHTML(basePath)}" data-vm-spec="item">新增物品</button>
      </div>`;
      return addBtn + (entriesHtml || '<div class="能力-empty" style="color:#9a8f7a;font-size:12px;">空</div>');
    },

    // 社交网络：人物关系网（字符串/对象字典）
    _renderSocialNetDictContent(basePath, dictObj) {
      const { entries, hasProps } = normalizeExtensibleDict(dictObj);
      const keys = Object.keys(entries);
      const entriesHtml = keys.map(k => {
        const path = entryPath(basePath, hasProps, k);
        const it = toObjectOrNull(entries[k]) || entries[k] || {};
        const nm = window.GuixuHelpers.SafeGetValue(it, 'name', k);
        const rel = window.GuixuHelpers.SafeGetValue(it, 'relationship', 'NEUTRAL');
        const head = `<span class="attribute-value">${escapeHTML(nm)}</span><span class="attribute-name">【${escapeHTML(rel)}】</span>`;
        const fields = ['id','name','relationship','主观印象'].filter(f => f in it);
        const kvHtml = this._renderKVList(fields.map(f => this._renderKVRow(f, it[f], `${path}['${f}']`)));
        return `
          <details class="vm-details vm-entry" data-label="${escapeHTML(nm)} ${escapeHTML(rel)}" data-vm-path="${path}">
            <summary><span class="vm-head">${head}</span>
              <span class="vm-actions">
                <button class="interaction-btn danger-btn" data-vm-del="${path}">删除</button>
              </span>
            </summary>
            <div class="vm-details-body">${kvHtml}</div>
          </details>
        `;
      }).join('');
      const addBtn = `<div class="vm-actions" style="padding:8px;">
        <button class="interaction-btn" data-vm-add="${escapeHTML(basePath)}" data-vm-spec="social">新增人物</button>
      </div>`;
      return addBtn + (entriesHtml || '<div class="能力-empty" style="color:#9a8f7a;font-size:12px;">空</div>');
    },

    // --- 交互与提交 ---

    _onEditorCommit(ev) {
      const t = ev.target;
      if (!t || !t.getAttribute) return;
      const path = t.getAttribute('data-vm-path');
      if (!path) return;

      try {
        const prefer = (() => {
          const oldVal = getByPath(this._workingStat, path, undefined);
          return typeof oldVal;
        })();
        let newVal;
        if (t.type === 'checkbox') {
          newVal = !!t.checked;
        } else if (t.tagName === 'TEXTAREA') {
          const raw = String(t.value || '').trim();
          // 尝试JSON；失败则智能解析
          try {
            newVal = raw ? JSON.parse(raw) : '';
          } catch (_) {
            newVal = smartParseInput(raw, null);
          }
        } else if (t.type === 'number') {
          newVal = smartParseInput(t.value, 'number');
        } else {
          newVal = smartParseInput(t.value, prefer);
        }

        // 关系字段限定值
        if (/\['relationship'\]\s*$/.test(path)) {
          const v = String(newVal || '').toUpperCase().trim();
          if (REL_ALLOWED.has(v)) {
            newVal = v;
          } else {
            alert('relationship 仅允许 ENEMY, ALLY, NEUTRAL, FRIEND, LOVER');
            // 还原控件显示为旧值
            try { const oldVal = getByPath(this._workingStat, path, ''); if (t && 'value' in t) t.value = String(oldVal ?? ''); } catch(_) {}
            return;
          }
        }
        // NPC 储物袋 type 限定值
        if (path.includes("['储物袋']") && /\['type'\]\s*$/.test(path)) {
          const v2 = String(newVal || '').trim();
          if (!NPC_BAG_TYPE_ALLOWED.has(v2)) {
            alert('NPC 储物袋物品 type 仅允许：功法、武器、防具、饰品、法宝、丹药、其他');
            try { const oldVal = getByPath(this._workingStat, path, ''); if (t && 'value' in t) t.value = String(oldVal ?? ''); } catch(_) {}
            return;
          }
        }
        // tier 限定值：玩家物品列表与 NPC 储物袋使用修炼阶段枚举；天赋/灵根使用品阶枚举
        if (/\['tier'\]\s*$/.test(path)) {
          const v3 = String(newVal || '').trim();
          if (path.includes("['天赋列表']") || path.includes("['灵根列表']")) {
            if (!ABILITY_TIER_ALLOWED.has(v3)) {
              alert('tier 仅允许：凡品、下品、中品、上品、极品、天品、仙品、神品');
              try { const oldVal = getByPath(this._workingStat, path, ''); if (t && 'value' in t) t.value = String(oldVal ?? ''); } catch(_) {}
              return;
            }
          } else if (
            path.includes("['功法列表']") || path.includes("['武器列表']") || path.includes("['防具列表']") ||
            path.includes("['饰品列表']") || path.includes("['法宝列表']") || path.includes("['丹药列表']") ||
            path.includes("['其他列表']") || path.includes("['储物袋']")
          ) {
            if (!ITEM_TIER_ALLOWED.has(v3)) {
              alert('tier 仅允许：练气、筑基、金丹、元婴、化神、合体、飞升、神桥');
              try { const oldVal = getByPath(this._workingStat, path, ''); if (t && 'value' in t) t.value = String(oldVal ?? ''); } catch(_) {}
              return;
            }
          }
        }

        setByPath(this._workingStat, path, newVal);

        // 行高亮
        const row = t.closest('.attribute-item') || t.closest('.vm-details') || t.closest('.vm-group');
        if (row) row.classList.add('vm-row-changed');
      } catch (e) {
        console.warn('[归墟][变量编辑器] 应用变更失败:', e);
      }
    },

    async _handleAddEntry(groupPath, spec) {
      const openBefore = this._captureOpenEntryPaths();
      try {
        // 特例：属性加成/百分比加成 —— 固定键选择添加
        if (spec === 'attr-flat' || spec === 'attr-percent') {
          const propsObj = getByPath(this._workingStat, propsPath(groupPath), undefined);
          const targetBase = (propsObj && typeof propsObj === 'object') ? propsPath(groupPath) : groupPath;

          // 确保目标字典存在
          const dict = getByPath(this._workingStat, targetBase, null) || {};
          setByPath(this._workingStat, targetBase, dict);

          const existingKeys = Object.keys(dict || {});
          const candidates = ALLOWED_ATTR_KEYS.filter(k => !existingKeys.includes(k));
          if (!candidates.length) {
            alert('可添加的属性键已全部存在');
            return;
          }
          const label = (spec === 'attr-percent') ? '百分比加成' : '属性加成';
          const choice = prompt(`请选择要添加的${label}键（从以下列表中选择并原样输入）：\n${candidates.join('、')}`);
          if (!choice) return;
          const pick = NK(choice);
          if (!candidates.includes(pick)) {
            alert('无效键或该键已存在');
            return;
          }
          const initVal = (spec === 'attr-percent') ? '0%' : 0;
          setByPath(this._workingStat, `${targetBase}['${pick}']`, initVal);
          // 重绘并恢复展开状态
          this._renderActiveTabContent();
          this._restoreOpenEntryPaths(openBefore);
          try { window.GuixuHelpers?.showTemporaryMessage?.('已新增属性键'); } catch (_) {}
          return;
        }

        // 通用：自由键名新增
        const key = prompt('请输入新条目的键名（如：名称/唯一键）');
        if (!key) return;

        // 目标：若存在 properties 节点则加入到 properties，否则直接加入字典
        const propsObj = getByPath(this._workingStat, propsPath(groupPath), undefined);
        const targetBase = (propsObj && typeof propsObj === 'object') ? propsPath(groupPath) : groupPath;

        const existing = getByPath(this._workingStat, `${targetBase}['${key}']`, undefined);
        if (existing !== undefined) {
          alert('已存在相同键名的条目');
          return;
        }

        let value;
        if (spec === 'talent') value = templateFor('talent');
        else if (spec === 'linggen') value = templateFor('linggen');
        else if (spec === 'item') {
          // 根据所在分组构造“物品”模板（定制丹药/其他）
          const autoType = _inferItemTypeFromGroupPath(groupPath);
          if (autoType === '丹药') {
            /* 丹药：保留除“属性加成/百分比加成”外的常规字段 + 词条 */
            value = {
              id: '',
              name: '',
              type: '丹药',
              tier: '练气',
              description: '',
              special_effects: { $meta: { extensible: true } },
              base_value: 0,
              quantity: 1
            };
          } else if (autoType === '其他') {
            /* 其他：不包含 属性加成/百分比加成/词条 三类字段 */
            value = { id: '', name: '', type: '其他', tier: '练气', description: '', base_value: 0, quantity: 1 };
          } else {
            // 其余类别：使用通用模板
            value = templateFor('item');
            // 若能推断 type，则补齐
            if (autoType) { try { value.type = autoType; } catch (_) {} }
          }
        } else if (spec === 'status') value = templateFor('status');
        else if (spec === 'npc') value = templateFor('npc');
        else if (spec === 'social') value = { id: '', name: key, relationship: 'NEUTRAL', '主观印象': '' };
        else value = '';

        // 确保目标字典存在
        const dict = getByPath(this._workingStat, targetBase, null) || {};
        setByPath(this._workingStat, targetBase, dict);
        setByPath(this._workingStat, `${targetBase}['${key}']`, value);

        // 重绘当前页（保持标签不变）并恢复展开
        this._renderActiveTabContent();
        this._restoreOpenEntryPaths(openBefore);
        try { window.GuixuHelpers?.showTemporaryMessage?.('已新增条目'); } catch (_) {}
      } catch (e) {
        console.warn('[归墟][变量编辑器] 新增条目失败:', e);
      }
    },

    async _handleDeleteEntry(path) {
      const openBefore = this._captureOpenEntryPaths();
      try {
        const confirmed = confirm('确定要删除该条目吗？此操作不可撤销。');
        if (!confirmed) return;
        // 删除路径上的最后一个键
        const segs = parsePathSegments(path);
        if (!segs.length) return;
        const parentSegs = segs.slice(0, -1);
        const last = segs[segs.length - 1];
        const parentPath = parentSegs.map(s => (typeof s === 'number' ? `[${s}]` : `['${s}']`)).join('');
        const parent = getByPath(this._workingStat, parentPath ? parentPath : '', this._workingStat);
        if (parent == null) return;
        if (Array.isArray(parent)) {
          const idx = Number(last);
          if (Number.isInteger(idx) && idx >= 0 && idx < parent.length) parent.splice(idx, 1);
        } else {
          delete parent[last];
        }
        this._renderActiveTabContent();
        this._restoreOpenEntryPaths(openBefore);
        try { window.GuixuHelpers?.showTemporaryMessage?.('已删除条目'); } catch (_) {}
      } catch (e) {
        console.warn('[归墟][变量编辑器] 删除条目失败:', e);
      }
    },
// 记录/恢复主条目折叠状态（vm-entry）
_captureOpenEntryPaths() {
  try {
    const host = $('#vm-content');
    return Array.from(host?.querySelectorAll('.vm-entry') || [])
      .filter(d => d && d.hasAttribute('open'))
      .map(d => d.getAttribute('data-vm-path') || d.getAttribute('data-label') || '');
  } catch (_) { return []; }
},
_restoreOpenEntryPaths(paths) {
  try {
    const set = new Set(Array.isArray(paths) ? paths : []);
    const host = $('#vm-content');
    Array.from(host?.querySelectorAll('.vm-entry') || []).forEach(d => {
      const key = d.getAttribute('data-vm-path') || d.getAttribute('data-label') || '';
      if (set.has(key)) d.setAttribute('open', '');
    });
  } catch (_) {}
},

    _applyFilterToContainer(container) {
      const kw = (this._lastFilter || '').trim().toLowerCase();
      if (!kw) {
        // 全部显示
        $$('.vm-group, .vm-details, .attribute-item', container).forEach(el => { el.style.display = ''; });
        return;
      }
      // 简单包含过滤：对 entry / 组内行做隐藏
      $$('.vm-entry, .attribute-item, .vm-group', container).forEach(el => {
        try {
          const label = (el.getAttribute('data-label') || el.textContent || '').toLowerCase();
          el.style.display = label.includes(kw) ? '' : 'none';
        } catch (_) {}
      });
    },

    // 底部按钮：重置/应用/保存
    _bindFooterActions() {
      const btnReset = $('#vm-btn-reset');
      const btnApply = $('#vm-btn-apply');
      const btnSave  = $('#vm-btn-save');

      if (btnReset && !btnReset.dataset.guixuBind) {
        btnReset.addEventListener('click', async () => {
          try {
            this._workingStat = deepClone(this._originalStatSnap || {});
            this._renderActiveTabContent();
            try { window.GuixuHelpers?.showTemporaryMessage?.('已重置为打开面板时的快照'); } catch (_) {}
          } catch (e) {
            console.warn('[归墟][变量编辑器] 重置失败:', e);
          }
        });
        btnReset.dataset.guixuBind = '1';
      }

      if (btnApply && !btnApply.dataset.guixuBind) {
        btnApply.addEventListener('click', async () => {
          try {
            if (window.GuixuMain?.renderUI) {
              const toRender = window.GuixuMain._deepStripMeta ? window.GuixuMain._deepStripMeta(this._workingStat) : this._workingStat;
              window.GuixuMain.renderUI(toRender || {});
            }
            try { window.GuixuHelpers?.showTemporaryMessage?.('已应用到界面（未保存）'); } catch (_) {}
          } catch (e) {
            console.warn('[归墟][变量编辑器] 应用失败:', e);
            try { window.GuixuHelpers?.showTemporaryMessage?.('应用失败'); } catch (_) {}
          }
        });
        btnApply.dataset.guixuBind = '1';
      }

      if (btnSave && !btnSave.dataset.guixuBind) {
        btnSave.addEventListener('click', async () => {
          try {
            const currentId = window.GuixuAPI.getCurrentMessageId();
            const messages = await window.GuixuAPI.getChatMessages(currentId);
            if (!messages || !messages[0]) throw new Error('无法读取当前聊天数据');

            const currentMvuState = messages[0].data || {};
            currentMvuState.stat_data = deepClone(this._workingStat || {});

            const updates = [{ message_id: currentId, data: currentMvuState }];
            if (currentId !== 0) updates.push({ message_id: 0, data: currentMvuState });

            await window.GuixuAPI.setChatMessages(updates, { refresh: 'none' });

            try { window.GuixuState?.update?.('currentMvuState', currentMvuState); } catch (_) {}
            try { window.dispatchEvent(new CustomEvent('guixu:mvu-flushed', { detail: { remaining: 0 } })); } catch (_) {}
            try { document.dispatchEvent(new CustomEvent('guixu:mvuChanged', { detail: currentMvuState })); } catch (_) {}

            this._originalStatSnap = deepClone(this._workingStat || {});
            try { await window.GuixuMain?.updateDynamicData?.(); } catch (_) {}
            try { window.GuixuHelpers?.showTemporaryMessage?.('变量已保存并应用'); } catch (_) {}
          } catch (e) {
            console.error('[归墟][变量编辑器] 保存失败:', e);
            try { window.GuixuHelpers?.showTemporaryMessage?.(`保存失败: ${e.message}`); } catch (_) {}
          }
        });
        btnSave.dataset.guixuBind = '1';
      }
    },
  };

  window.VariableManagerComponent = VariableManagerComponent;
})(window);