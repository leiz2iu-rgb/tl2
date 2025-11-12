const SETTINGS_KEY = 'shopeeChatTranslatorSettings';
const DEFAULT_SETTINGS = {
  outgoingLanguage: 'en',
  incomingLanguage: 'ja',
  autoTranslateIncoming: true,
  speechRecognitionLocale: 'ja-JP'
};

function restoreOptions() {
  const form = document.getElementById('options-form');
  const status = document.getElementById('status');

  if (!chrome?.storage?.sync) {
    status.textContent = 'ストレージにアクセスできません。デフォルト設定が使用されます。';
    applySettingsToForm(DEFAULT_SETTINGS);
    return;
  }

  chrome.storage.sync.get([SETTINGS_KEY], result => {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(result?.[SETTINGS_KEY] ?? {})
    };
    applySettingsToForm(settings);
    status.textContent = '';
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const updatedSettings = {
      speechRecognitionLocale: formData.get('speechRecognitionLocale') || DEFAULT_SETTINGS.speechRecognitionLocale,
      outgoingLanguage: formData.get('outgoingLanguage') || DEFAULT_SETTINGS.outgoingLanguage,
      incomingLanguage: formData.get('incomingLanguage') || DEFAULT_SETTINGS.incomingLanguage,
      autoTranslateIncoming: formData.get('autoTranslateIncoming') === 'on'
    };

    if (!chrome?.storage?.sync) {
      status.textContent = 'ストレージにアクセスできませんでした。ブラウザの同期が必要です。';
      return;
    }

    chrome.storage.sync.set({
      [SETTINGS_KEY]: updatedSettings
    }, () => {
      status.textContent = '保存しました。';
      status.classList.add('is-visible');
      setTimeout(() => {
        status.textContent = '';
        status.classList.remove('is-visible');
      }, 2500);
    });
  });
}

function applySettingsToForm(settings) {
  document.getElementById('speechRecognitionLocale').value = settings.speechRecognitionLocale;
  document.getElementById('outgoingLanguage').value = settings.outgoingLanguage;
  document.getElementById('incomingLanguage').value = settings.incomingLanguage;
  document.getElementById('autoTranslateIncoming').checked = Boolean(settings.autoTranslateIncoming);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreOptions);
} else {
  restoreOptions();
}
