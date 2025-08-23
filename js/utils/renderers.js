// 类脑/旅程梦星作品，禁止二传，禁止商业化，均无偿免费开源分享
// 通用渲染工具：从 guixu.js 中抽离，供各组件复用
(function (window) {
  'use strict';

  if (!window.GuixuHelpers) {
    console.error('[归墟] GuixuRenderers 初始化失败：缺少依赖(GuixuHelpers)。');
    return;
  }

  const GuixuRenderers = {
    // 背包条目细节块（固定加成/百分比加成/特殊词条）
    renderItemDetailsForInventory(item) {
      let attributesHtml = '';
      const attributes = item?.attributes_bonus || item?.['属性加成'];
      if (attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0) {
        attributesHtml += '<div class="tooltip-section-title" style="margin-top: 5px;">固定加成</div>';
        for (const [key, value] of Object.entries(attributes)) {
          attributesHtml += `<p><strong>${key}:</strong> ${value > 0 ? '+' : ''}${value}</p>`;
        }
      }

      const percentBonuses = item?.['百分比加成'] || item?.percent_bonus || item?.['百分比'];
      if (percentBonuses && typeof percentBonuses === 'object' && Object.keys(percentBonuses).length > 0) {
        attributesHtml += '<div class="tooltip-section-title" style="margin-top: 5px;">百分比加成</div>';
        for (const [key, value] of Object.entries(percentBonuses)) {
          attributesHtml += `<p><strong>${key}:</strong> +${value}</p>`;
        }
      }

      let effectsHtml = '';
      let effects = item?.special_effects || item?.['特殊词条'] || item?.effects;

      // 兼容：special_effects 可能是字符串（\n 分隔）或数组
      if (typeof effects === 'string' && effects.trim() !== '') {
        effects = effects.split('\n').map(e => e.trim()).filter(e => e);
      }

      if (Array.isArray(effects) && effects.length > 0) {
        effectsHtml += `<div class="tooltip-section-title" style="margin-top: 5px;">特殊词条</div>`;
        effectsHtml += effects
          .filter(eff => eff !== '$__META_EXTENSIBLE__$')
          .map(eff => `<p>${eff}</p>`)
          .join('');
      }

      return `${attributesHtml}${effectsHtml}`;
    },

    // 装备槽悬浮提示
    renderTooltipContent(item) {
      const tierStyle = window.GuixuHelpers.getTierStyle(window.GuixuHelpers.SafeGetValue(item, 'tier'));
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
        attributesHtml += `<div class="tooltip-section-title" style="margin-top: 5px;">百分比加成</div>`;
        for (const [key, value] of Object.entries(percentBonuses)) {
          attributesHtml += `<p><strong>${key}:</strong> +${value}</p>`;
        }
      }

      let effectsHtml = '';
      let effects = item?.special_effects || item?.['特殊词条'] || item?.effects;
      if (typeof effects === 'string' && effects.trim() !== '') {
        effects = effects.split('\n').map(e => e.trim()).filter(e => e);
      }
      if (Array.isArray(effects) && effects.length > 0) {
        effectsHtml += `<div class="tooltip-section-title">特殊词条</div>`;
        effectsHtml += effects
          .filter(eff => eff !== '$__META_EXTENSIBLE__$')
          .map(eff => `<p>${eff}</p>`)
          .join('');
      }

      return `
        <div class="tooltip-title" style="${tierStyle}">${window.GuixuHelpers.SafeGetValue(item, 'name')}</div>
        <p><strong>品阶:</strong> ${tierDisplay}</p>
        <p><i>${window.GuixuHelpers.SafeGetValue(item, 'description', '无描述')}</i></p>
        ${attributesHtml ? `<div class="tooltip-section tooltip-attributes">${attributesHtml}</div>` : ''}
        ${effectsHtml ? `<div class="tooltip-section">${effectsHtml}</div>` : ''}
      `;
    }
  };

  window.GuixuRenderers = GuixuRenderers;
})(window);
