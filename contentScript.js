(function () {
  const SETTINGS_KEY = 'shopeeChatTranslatorSettings';
  const DEFAULT_SETTINGS = {
    outgoingLanguage: 'en',
    incomingLanguage: 'ja',
    autoTranslateIncoming: true,
    speechRecognitionLocale: 'ja-JP'
  };

  let settings = { ...DEFAULT_SETTINGS };
  let recognition;
  let isRecognizing = false;
  let micButton;
  let mutationObserver;

  async function loadSettings() {
    return new Promise(resolve => {
      if (!chrome?.storage?.sync) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }

      chrome.storage.sync.get([SETTINGS_KEY], result => {
        resolve({
          ...DEFAULT_SETTINGS,
          ...(result?.[SETTINGS_KEY] ?? {})
        });
      });
    });
  }

  function getSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return null;
    }

    if (recognition) {
      return recognition;
    }

    recognition = new SpeechRecognition();
    recognition.lang = settings.speechRecognitionLocale;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.addEventListener('result', onSpeechResult);
    recognition.addEventListener('error', onSpeechError);
    recognition.addEventListener('end', () => {
      isRecognizing = false;
      updateMicButtonState();
    });

    return recognition;
  }

  function onSpeechError(event) {
    console.error('[Shopee Translator] Speech recognition error:', event.error);
    displayToast(`音声認識でエラーが発生しました: ${event.error}`);
  }

  async function onSpeechResult(event) {
    const transcript = Array.from(event.results)
      .map(result => result[0]?.transcript)
      .join(' ')
      .trim();

    if (!transcript) {
      displayToast('音声が認識されませんでした。');
      return;
    }

    try {
      const { translatedText } = await Translator.translate(transcript, settings.outgoingLanguage);
      insertTextIntoChatInput(translatedText || transcript);
      displayToast('翻訳したメッセージを挿入しました。');
    } catch (error) {
      console.error('[Shopee Translator] Translation error:', error);
      displayToast('翻訳に失敗しました。接続を確認してください。');
    }
  }

  function updateMicButtonState() {
    if (!micButton) {
      return;
    }

    if (!getSpeechRecognition()) {
      micButton.disabled = true;
      micButton.title = 'このブラウザでは音声認識が利用できません。';
      return;
    }

    micButton.disabled = false;
    micButton.classList.toggle('translator-button--active', isRecognizing);
  }

  function insertTextIntoChatInput(text) {
    const input = findChatInput();
    if (!input) {
      displayToast('チャット入力欄が見つかりません。');
      return;
    }

    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.isContentEditable) {
      input.textContent = text;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('keyup', { bubbles: true }));
    }

    input.focus({ preventScroll: false });
  }

  function findChatInput() {
    const selectors = [
      'textarea',
      'div[contenteditable="true"]',
      'input[type="text"]'
    ];

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      const candidate = elements.find(el => isVisible(el) && el.closest('[class*="chat"], [class*="message"], [data-testid*="chat"], [class*="input"]'));
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function ensureMicButton() {
    if (micButton?.isConnected) {
      return;
    }

    const input = findChatInput();
    if (!input) {
      return;
    }

    const container = document.createElement('button');
    container.type = 'button';
    container.className = 'translator-button';
    container.title = '日本語を話して相手の言語へ翻訳します';
    container.innerHTML = `\n      <span class="translator-button__icon">🎤</span>\n      <span class="translator-button__label">翻訳</span>\n    `;

    container.addEventListener('click', () => {
      const speech = getSpeechRecognition();
      if (!speech) {
        displayToast('ブラウザが音声認識に対応していません。');
        return;
      }

      if (isRecognizing) {
        speech.stop();
        isRecognizing = false;
        updateMicButtonState();
        return;
      }

      try {
        speech.lang = settings.speechRecognitionLocale;
        speech.start();
        isRecognizing = true;
        updateMicButtonState();
      } catch (error) {
        console.error('[Shopee Translator] Failed to start speech recognition:', error);
        displayToast('音声認識を開始できませんでした。');
      }
    });

    micButton = container;

    if (typeof input.insertAdjacentElement === 'function') {
      input.insertAdjacentElement('afterend', container);
    } else {
      const host = input.parentElement || input;
      host.appendChild(container);
    }
    updateMicButtonState();
  }

  function containsJapanese(text) {
    if (!text) return false;
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9faf]/.test(text);
  }

  async function translateMessageNode(node) {
    if (!settings.autoTranslateIncoming) {
      return;
    }

    const text = node.textContent?.trim();
    if (!text || containsJapanese(text)) {
      return;
    }

    if (node.dataset?.translatorApplied === 'true') {
      return;
    }

    try {
      node.dataset.translatorApplied = 'pending';
      const { translatedText, detectedSourceLanguage } = await Translator.translate(text, settings.incomingLanguage);
      if (!translatedText || translatedText === text) {
        node.dataset.translatorApplied = 'skipped';
        return;
      }

      const translationElement = document.createElement('div');
      translationElement.className = 'translator-message__translation';
      translationElement.textContent = translatedText;

      const metaElement = document.createElement('div');
      metaElement.className = 'translator-message__meta';
      metaElement.textContent = detectedSourceLanguage
        ? `翻訳 (${detectedSourceLanguage} → ${settings.incomingLanguage})`
        : `翻訳 (${settings.incomingLanguage})`;

      const wrapper = document.createElement('div');
      wrapper.className = 'translator-message';
      wrapper.appendChild(translationElement);
      wrapper.appendChild(metaElement);

      node.appendChild(wrapper);
      node.dataset.translatorApplied = 'true';
    } catch (error) {
      console.error('[Shopee Translator] Failed to translate message:', error);
      node.dataset.translatorApplied = 'error';
    }
  }

  function getMessageNodes(root = document) {
    const selectors = [
      '[data-testid*="message"] [data-testid*="text"]',
      '.chat-message__text',
      '.message-item__text',
      '.chat-message-bubble__text',
      '.shopee-chat-message__text',
      '.message-item .text',
      '.chat-bubble__message',
      '.message__text'
    ];

    const rootNode = root instanceof HTMLElement || root instanceof DocumentFragment ? root : document;

    const nodes = new Set();
    selectors.forEach(selector => {
      rootNode.querySelectorAll(selector).forEach(el => {
        if (el && el.textContent?.trim()) {
          nodes.add(el);
        }
      });
    });

    if (nodes.size === 0) {
      const fallback = Array.from(rootNode.querySelectorAll('div, span, p')).filter(el => {
        if (!el.textContent || el.textContent.length > 200 || el.children.length > 3) {
          return false;
        }
        const classes = el.className || '';
        return /message|chat|bubble|conversation/i.test(classes) && !el.closest('.translator-message');
      });
      fallback.forEach(el => nodes.add(el));
    }

    return Array.from(nodes);
  }

  async function translateVisibleMessages() {
    const nodes = getMessageNodes();
    for (const node of nodes) {
      await translateMessageNode(node);
    }
  }

  function watchForNewMessages() {
    if (mutationObserver) {
      return;
    }

    mutationObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) {
            return;
          }

          if (node.matches?.('.translator-message')) {
            return;
          }

          const candidates = getMessageNodes(node);
          candidates.forEach(candidate => {
            translateMessageNode(candidate);
          });
        });
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function displayToast(message) {
    const existing = document.querySelector('.translator-toast');
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'translator-toast';
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('translator-toast--visible');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('translator-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== 'sync') {
      return;
    }

    const updated = changes[SETTINGS_KEY]?.newValue;
    if (updated) {
      settings = {
        ...DEFAULT_SETTINGS,
        ...updated
      };
      updateMicButtonState();
      translateVisibleMessages();
    }
  }

  async function init() {
    settings = await loadSettings();
    ensureMicButton();
    translateVisibleMessages();
    watchForNewMessages();

    document.addEventListener('click', ensureMicButton, { once: true });
    document.addEventListener('focusin', ensureMicButton);

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
