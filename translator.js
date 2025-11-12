const Translator = (() => {
  const API_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
  const REQUEST_PARAMS = 'client=gtx&dt=t&sl=auto';

  async function translate(text, targetLanguage) {
    if (!text || !text.trim()) {
      return {
        translatedText: text,
        detectedSourceLanguage: null
      };
    }

    const query = `${REQUEST_PARAMS}&tl=${encodeURIComponent(targetLanguage)}&q=${encodeURIComponent(text)}`;
    const url = `${API_ENDPOINT}?${query}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Translation request failed with status ${response.status}`);
    }

    const data = await response.json();

    const translationChunks = data?.[0] ?? [];
    const translatedText = translationChunks.map(chunk => chunk[0]).join('');
    const detectedSourceLanguage = data?.[2] ?? null;

    return {
      translatedText,
      detectedSourceLanguage
    };
  }

  async function detect(text) {
    const { detectedSourceLanguage } = await translate(text, 'en');
    return detectedSourceLanguage;
  }

  return {
    translate,
    detect
  };
})();

if (typeof window !== 'undefined') {
  window.Translator = Translator;
}
