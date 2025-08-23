// 类脑/旅程梦星作品，禁止二传，禁止商业化，均无偿免费开源分享
(function (window) {
  'use strict';

  if (!window.GuixuDOM || !window.GuixuBaseModal || !window.GuixuAPI || !window.GuixuHelpers) {
    console.error('[归墟] GuixuSystemComponent 初始化失败：缺少依赖(GuixuDOM/GuixuBaseModal/GuixuAPI/GuixuHelpers)。');
    return;
  }

  const GuixuSystemComponent = {
    async show() {
      const { $ } = window.GuixuDOM;
      window.GuixuBaseModal.open('guixu-system-modal');

      const body = $('#guixu-system-modal .modal-body');
      if (!body) return;
      body.innerHTML =
        '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">正在连接归墟...</p>';

      try {
        const messages = await window.GuixuAPI.getChatMessages(window.GuixuAPI.getCurrentMessageId());
        const stat_data = messages?.[0]?.data?.stat_data;
        if (!stat_data) {
          body.innerHTML =
            '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">无法连接归墟。</p>';
          return;
        }

        const currentLife = window.GuixuHelpers.SafeGetValue(stat_data, '当前第x世', '1');
        const guixuSpace = window.GuixuHelpers.SafeGetValue(stat_data, '归墟空间', '空无一物');
        const currentChoice = window.GuixuHelpers.SafeGetValue(stat_data, '本世归墟选择', '无');
        const chargeTime = window.GuixuHelpers.SafeGetValue(stat_data, '归墟充能时间', '0');
        const shengli = window.GuixuHelpers.SafeGetValue(stat_data, '生理年龄', 'N/A');
        const shengliMax = window.GuixuHelpers.SafeGetValue(stat_data, '生理年龄上限', 'N/A');
        const xinli = window.GuixuHelpers.SafeGetValue(stat_data, '心理年龄', 'N/A');
        const xinliMax = window.GuixuHelpers.SafeGetValue(stat_data, '心理年龄上限', 'N/A');

        body.innerHTML = `
          <div class="panel-section">
            <div class="attributes-list">
              <div class="attribute-item"><span class="attribute-name">当前世数</span><span class="attribute-value">第 ${currentLife} 世</span></div>
              <div class="attribute-item"><span class="attribute-name">生理年龄</span><span class="attribute-value">${shengli} / ${shengliMax}</span></div>
              <div class="attribute-item"><span class="attribute-name">心理年龄</span><span class="attribute-value">${xinli} / ${xinliMax}</span></div>
              <div class="attribute-item"><span class="attribute-name">归墟空间</span><span class="attribute-value">${guixuSpace}</span></div>
              <div class="attribute-item"><span class="attribute-name">本世抉择</span><span class="attribute-value">${currentChoice}</span></div>
              <div class="attribute-item" style="margin-top: 15px;"><span class="attribute-name">归墟充能</span><span class="attribute-value">${chargeTime}%</span></div>
              <div class="details-progress-bar">
                <div class="details-progress-fill" style="width: ${chargeTime}%; background: linear-gradient(90deg, #dc143c, #ff6b6b, #ffd700);"></div>
              </div>
            </div>
          </div>
          <div style="padding: 20px 10px; text-align: center;">
            <button id="btn-trigger-guixu" class="interaction-btn primary-btn" style="width: 80%; padding: 12px; font-size: 16px;">归 墟</button>
          </div>
        `;

        $('#btn-trigger-guixu')?.addEventListener('click', async () => {
          const c = parseInt(chargeTime, 10) || 0;
          if (c >= 100) {
            const doAction = async () => {
              const command = '{{user}}选择归墟，世界将回到最初的锚点';
              try {
                if (window.GuixuActionService && typeof window.GuixuActionService.handleAction === 'function') {
                  await window.GuixuActionService.handleAction(command);
                  window.GuixuHelpers.showTemporaryMessage('轮回已开启...');
                } else {
                  window.GuixuHelpers.showTemporaryMessage('无法执行归墟指令：ActionService 不可用');
                }
              } catch (e) {
                console.error('[归墟] 执行归墟指令失败:', e);
                window.GuixuHelpers.showTemporaryMessage('执行归墟指令失败！');
              }
            };
            if (window.GuixuMain && typeof window.GuixuMain.showCustomConfirm === 'function') {
              window.GuixuMain.showCustomConfirm('你确定要开启下一次轮回吗？所有未储存的记忆都将消散。', doAction);
            } else {
              if (confirm('你确定要开启下一次轮回吗？所有未储存的记忆都将消散。')) await doAction();
            }
          } else {
            window.GuixuHelpers.showTemporaryMessage('归墟充能进度不足');
          }
        });
      } catch (error) {
        console.error('[归墟] 加载归墟系统时出错:', error);
        body.innerHTML =
          '<p class="modal-placeholder" style="text-align:center; color:#8b7355; font-size:12px;">加载数据时出错。</p>';
      }
    }
  };

  window.GuixuSystemComponent = GuixuSystemComponent;
})(window);
