// 类脑/旅程梦星作品，禁止二传，禁止商业化，均无偿免费开源分享
(function (window) {
  'use strict';

  const GuixuDOM = {
    /**
     * 创建一个HTML元素。
     * @param {string} tagName - 元素的标签名。
     * @param {object} [attributes={}] - 元素的属性。
     * @param {Array<Node|string>} [children=[]] - 子节点。
     * @returns {HTMLElement} 创建的元素。
     */
    h(tagName, attributes = {}, children = []) {
      const element = document.createElement(tagName);
      for (const key in attributes) {
        const value = attributes[key];
        if (key.startsWith('on') && typeof value === 'function') {
          element.addEventListener(key.substring(2).toLowerCase(), value);
        } else if (key === 'style') {
          if (typeof value === 'object' && value !== null) {
            Object.assign(element.style, value);
          } else if (typeof value === 'string') {
            element.setAttribute('style', value);
          }
        } else if (key === 'className' || key === 'class') {
          element.className = value;
        } else if (key === 'textContent') {
          element.textContent = value;
        } else if (key === 'innerHTML' || key === 'html') {
          element.innerHTML = value;
        } else if (key === 'disabled' || key === 'checked' || key === 'selected') {
          element[key] = !!value;
        } else if (typeof value === 'boolean') {
          if (value) {
            element.setAttribute(key, '');
          }
        } else {
          element.setAttribute(key, value);
        }
      }
      children.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
          element.appendChild(child);
        }
      });
      return element;
    },

    /**
     * 查询单个DOM元素。
     * @param {string} selector - CSS选择器。
     * @param {Document|Element} [context=document] - 查询上下文。
     * @returns {Element|null} 找到的第一个元素或null。
     */
    $(selector, context = document) {
      return context.querySelector(selector);
    },

    /**
     * 查询多个DOM元素。
     * @param {string} selector - CSS选择器。
     * @param {Document|Element} [context=document] - 查询上下文。
     * @returns {NodeListOf<Element>} 找到的元素列表。
     */
    $$(selector, context = document) {
      return context.querySelectorAll(selector);
    },
  };

  // 将 GuixuDOM 挂载到 window 对象
  window.GuixuDOM = GuixuDOM;
})(window);
