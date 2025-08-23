// 类脑/旅程梦星作品，禁止二传，禁止商业化，均无偿免费开源分享
(function (window) {
  'use strict';

  if (!window.GuixuDOM || !window.GuixuBaseModal || !window.GuixuState || !window.GuixuHelpers) {
    console.error('[归墟] CommandCenterComponent 初始化失败：缺少依赖(GuixuDOM/GuixuBaseModal/GuixuState/GuixuHelpers)。');
    return;
  }

  const CommandCenterComponent = {
    show() {
      const { $ } = window.GuixuDOM;
      const state = window.GuixuState.getState();

      window.GuixuBaseModal.open('command-center-modal');

      const body = $('#command-center-modal .modal-body');
      if (!body) return;

      const pending = Array.isArray(state.pendingActions) ? state.pendingActions : [];
      if (pending.length === 0) {
        body.innerHTML = '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">暂无待执行的指令。</p>';
        return;
      }

      let html = '<ul class="command-center-actions">';
      pending.forEach(cmd => {
        let actionText = '';
        switch (cmd.action) {
          case 'equip':
            actionText = `[装备] ${cmd.itemName} 到 ${cmd.category}`;
            break;
          case 'unequip':
            actionText = `[卸下] ${cmd.itemName} 从 ${cmd.category}`;
            break;
          case 'use':
            actionText = `[使用] ${cmd.itemName} x ${cmd.quantity}`;
            break;
          case 'discard':
            if (cmd.quantity && cmd.quantity > 1) {
              actionText = `[丢弃] ${cmd.itemName} x ${cmd.quantity}`;
            } else {
              actionText = `[丢弃] ${cmd.itemName}`;
            }
            break;
          case 'trade_buy': {
            const npcName = cmd.npcName || '未知之人';
            const itemName = cmd.itemName || '未知物品';
            const tier = cmd.tier || '练气';
            const qty = Number(cmd.quantity || 1);
            const unit = Number(cmd.unitPrice || 0);
            const price = Number(cmd.totalPrice || 0);
            actionText = `[交易-购买] 与 ${npcName} 购买 【${tier}】${itemName} x ${qty}（单价：${unit} 灵石），总价 ${price} 灵石`;
            break;
          }
          case 'trade_sell': {
            const npcName = cmd.npcName || '未知之人';
            const itemName = cmd.itemName || '未知物品';
            const tier = cmd.tier || '练气';
            const qty = Number(cmd.quantity || 1);
            const unit = Number(cmd.unitPrice || 0);
            const price = Number(cmd.totalPrice || 0);
            actionText = `[交易-出售] 与 ${npcName} 出售 【${tier}】${itemName} x ${qty}（单价：${unit} 灵石），总价 ${price} 灵石`;
            break;
          }
          case 'trade_abuse': {
            const npcName = cmd.npcName || '未知之人';
            const attempts = Number(cmd.attempts || 0);
            const deducted = Number(cmd.deductedFavor || 0);
            actionText = `【交易-违规】多次尝试低买/高卖，已触怒 ${npcName}，好感度 -${deducted}（累计 ${attempts} 次），本轮禁止交易`;
            break;
          }
          default:
            actionText = '[未知指令]';
        }
        html += `<li class="command-center-action-item">${actionText}</li>`;
      });
      html += '</ul>';
      body.innerHTML = html;
    }
  };

  window.CommandCenterComponent = CommandCenterComponent;
})(window);
