(function (window) {
  'use strict';

  if (!window.GuixuDOM || !window.GuixuBaseModal || !window.GuixuState) {
    console.error('[归墟] ExtractedContentComponent 初始化失败：缺少依赖(GuixuDOM/GuixuBaseModal/GuixuState)。');
    return;
  }

  const ExtractedContentComponent = {
    show() {
      const { $ } = window.GuixuDOM;
      const state = window.GuixuState.getState();

      window.GuixuBaseModal.open('extracted-content-modal');

      // 直接填充已缓存的提取内容
      const sentPromptEl = $('#sent-prompt-display');
      const journeyEl = $('#extracted-journey');
      const pastLivesEl = $('#extracted-past-lives');
      const variablesEl = $('#extracted-variable-changes');
      const novelModeEl = $('#extracted-novel-mode');
      const novelModeBtn = $('#btn-write-novel-mode');
      const characterCardEl = $('#extracted-character-card');
      const characterCardBtn = $('#btn-write-character-card');

      if (sentPromptEl) {
        sentPromptEl.textContent = state.lastSentPrompt || '尚未发送任何内容';
      }
      if (journeyEl) {
        journeyEl.textContent = state.lastExtractedJourney || '未提取到内容';
      }
      if (pastLivesEl) {
        pastLivesEl.textContent = state.lastExtractedPastLives || '未提取到内容';
      }
      if (variablesEl) {
        variablesEl.textContent = state.lastExtractedVariables || '本次无变量改变';
      }
      if (novelModeEl && novelModeBtn) {
        novelModeEl.textContent = state.lastExtractedNovelText || '当前AI回复中未提取到正文内容。';
        novelModeBtn.disabled = !state.lastExtractedNovelText;

        const label = document.querySelector('label[for="novel-mode-enabled-checkbox"]');
        if (label) {
          const statusText = state.isNovelModeEnabled ? '开启' : '关闭';
          label.title = `点击切换自动写入状态，当前为：${statusText}`;
        }
      }
      // 已弃用：通过正文标签的角色提取路径。此区域改为指引用户使用人物关系面板的“提取”按钮。
      if (characterCardEl) {
        characterCardEl.textContent = '此功能已迁移：请在“人物关系”面板中对特定角色使用“提取”按钮（支持标注与自动化）。';
      }
      if (characterCardBtn) {
        characterCardBtn.disabled = true;
        characterCardBtn.style.display = 'none';
        characterCardBtn._gxBound = true; // 防止旧逻辑绑定
      }
    }
  };

  window.ExtractedContentComponent = ExtractedContentComponent;
})(window);
