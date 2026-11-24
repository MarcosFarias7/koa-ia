/*
 * llm.js — "cérebro avançado" opcional do Koa.
 *
 * O aprendizado continua 100% no brain.js (local). Este módulo só deixa a
 * FALA mais natural: manda para a API do Claude a memória do Koa, as últimas
 * mensagens e a resposta-base do cérebro local, e recebe a resposta reescrita.
 * Sem chave, sem internet ou com qualquer erro, o app usa a resposta local.
 *
 * Usa fetch direto (o app não tem etapa de build para empacotar o SDK).
 * A chave fica só neste aparelho (localStorage) e só é enviada para api.anthropic.com.
 */
(function (root) {
  'use strict';

  const SETTINGS_KEY = 'koa.llm.v1';
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const TIMEOUT_MS = 30000;

  const MODELS = [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (mais esperto)', fallback: true },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (equilibrado)', fallback: true },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (mais rápido e barato)', fallback: false },
  ];

  const PERSONA = [
    'Você é o Koa, um coala filhote, fofo e curioso, que conversa em português do Brasil pelo celular.',
    'O Koa nasceu sem saber nada e só sabe o que a pessoa ensinou a ele; essas coisas aparecem em "Memória do Koa".',
    'Regras:',
    '- Responda curto: 1 a 3 frases, tom carinhoso e brincalhão, no máximo 2 emojis.',
    '- Use SOMENTE a Memória do Koa como conhecimento sobre o mundo e sobre a pessoa. Não invente fatos nem use conhecimento geral: se não estiver na memória, o Koa não sabe e pede para a pessoa ensinar.',
    '- Você recebe a "resposta-base" do cérebro local do Koa. Reescreva-a de forma natural mantendo o mesmo sentido: se ela diz que aprendeu algo, confirme o que foi aprendido; se ela faz uma pergunta, faça a mesma pergunta; se ela diz que não sabe, não responda.',
    '- Não diga que é uma IA, um modelo ou o Claude. Você é o Koa.',
    '- Responda só com a fala do Koa, sem aspas, sem rótulos e sem markdown.',
  ].join('\n');

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        enabled: !!s.enabled,
        apiKey: typeof s.apiKey === 'string' ? s.apiKey : '',
        model: MODELS.some((m) => m.id === s.model) ? s.model : MODELS[0].id,
      };
    } catch (e) {
      return { enabled: false, apiKey: '', model: MODELS[0].id };
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      return true;
    } catch (e) {
      return false;
    }
  }

  function isActive(s = loadSettings()) {
    return s.enabled && !!s.apiKey;
  }

  /** histórico do app -> mensagens alternadas user/assistant, começando por user */
  function buildMessages(history, userText, draft) {
    const msgs = [];
    for (const m of history.slice(-12)) {
      const role = m.who === 'me' ? 'user' : m.who === 'koa' ? 'assistant' : null;
      if (!role || !m.text) continue;
      const last = msgs[msgs.length - 1];
      if (last && last.role === role) last.content += '\n' + m.text;
      else msgs.push({ role, content: m.text });
    }
    // a mensagem atual já pode estar no histórico; garante que ela é a última
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user' || !msgs[msgs.length - 1].content.endsWith(userText)) {
      msgs.push({ role: 'user', content: userText });
    }
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    // instrução do operador no meio da conversa: segue a mensagem da pessoa
    msgs.push({ role: 'system', content: `Resposta-base do cérebro local do Koa (reescreva de forma natural, mesmo sentido):\n${draft}` });
    return msgs;
  }

  function memoryBlock(brain) {
    const facts = brain.facts.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 300);
    const lines = facts.map((f) => '- ' + brain.describe(f));
    const lv = brain.levelInfo();
    return `Memória do Koa (${brain.count} coisas aprendidas, nível "${lv.name}"):\n` + (lines.length ? lines.join('\n') : '(vazia: o Koa ainda não sabe nada)');
  }

  class LLMError extends Error {
    constructor(kind, message) {
      super(message);
      this.kind = kind; // auth | rate | refusal | network | timeout | server | bad_request
    }
  }

  /** chama a API; devolve o texto da resposta ou lança LLMError */
  async function call(settings, system, messages) {
    const model = MODELS.find((m) => m.id === settings.model) || MODELS[0];
    const body = {
      model: model.id,
      max_tokens: 2000,
      system,
      messages,
      output_config: { effort: 'low' }, // conversa curta: baixo esforço é suficiente
    };
    const headers = {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (model.fallback) {
      // se um filtro de segurança recusar, o servidor tenta outro modelo sozinho
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      body.fallbacks = 'default';
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    } catch (e) {
      throw new LLMError(e && e.name === 'AbortError' ? 'timeout' : 'network', 'Sem conexão com a API.');
    } finally {
      clearTimeout(timer);
    }

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* corpo vazio */
    }
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) throw new LLMError('auth', msg);
      if (res.status === 429) throw new LLMError('rate', msg);
      if (res.status >= 500 || res.status === 529) throw new LLMError('server', msg);
      throw new LLMError('bad_request', msg);
    }
    if (!data || data.stop_reason === 'refusal') throw new LLMError('refusal', 'Resposta recusada.');
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) throw new LLMError('server', 'Resposta vazia.');
    return text.slice(0, 1200);
  }

  /**
   * Deixa a resposta do Koa mais natural.
   * @returns {Promise<{text:string, usedLLM:boolean, error?:LLMError}>}
   */
  async function polish({ brain, history, userText, draft }) {
    const settings = loadSettings();
    if (!isActive(settings) || !draft) return { text: draft, usedLLM: false };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { text: draft, usedLLM: false };
    try {
      const system = PERSONA + '\n\n' + memoryBlock(brain);
      const text = await call(settings, system, buildMessages(history, userText, draft));
      return { text, usedLLM: true };
    } catch (e) {
      return { text: draft, usedLLM: false, error: e instanceof LLMError ? e : new LLMError('network', String(e)) };
    }
  }

  /** teste rápido da chave na tela de configurações */
  async function test(settings) {
    return call(settings, PERSONA + '\n\nMemória do Koa: (vazia)', [
      { role: 'user', content: 'oi' },
      { role: 'system', content: 'Resposta-base do cérebro local do Koa:\nOi! Me ensina alguma coisa nova?' },
    ]);
  }

  root.KoaLLM = { MODELS, loadSettings, saveSettings, isActive, polish, test, buildMessages, LLMError };
})(typeof globalThis !== 'undefined' ? globalThis : this);
