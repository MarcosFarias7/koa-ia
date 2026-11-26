/*
 * app.js — interface do Koa (conversa, balão, nível, memória, PWA).
 * A lógica de aprendizado mora no brain.js; o desenho no koala.svg.js.
 */
(function () {
  'use strict';

  const BRAIN_KEY = 'koa.brain.v1';
  const CHAT_KEY = 'koa.chat.v1';
  const MAX_CHAT = 80;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const stage = $('stage');
  const bubble = $('bubble');
  const chat = $('chat');
  const form = $('composer');
  const input = $('input');
  const sendBtn = $('send');
  const memory = $('memory');
  const factsEl = $('facts');

  // ---------- armazenamento seguro (modo privado pode bloquear) ----------
  const store = {
    get(k) {
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
    },
    del(k) {
      try { localStorage.removeItem(k); } catch (e) { /* ignora */ }
    },
  };

  const brain = new KoaBrain.Brain({
    storage: { load: () => store.get(BRAIN_KEY), save: (s) => store.set(BRAIN_KEY, s) },
  });

  let history = [];
  try { history = JSON.parse(store.get(CHAT_KEY) || '[]'); } catch (e) { history = []; }
  if (!Array.isArray(history)) history = [];

  // ---------- coala ----------
  KoaKoala.mount($('koala'), stage);

  // ---------- histórico ----------
  function saveHistory() {
    history = history.slice(-MAX_CHAT);
    store.set(CHAT_KEY, JSON.stringify(history));
  }

  function addMsg(who, text, persist = true) {
    const empty = chat.querySelector('.chat-empty');
    if (empty && who === 'me') empty.remove();
    const el = document.createElement('div');
    el.className = 'msg ' + who;
    el.textContent = text; // textContent: nada de HTML injetado
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    if (persist) {
      history.push({ who, text, t: Date.now() });
      saveHistory();
    }
    return el;
  }

  function renderHistory() {
    chat.innerHTML = '';
    if (!history.some((m) => m.who === 'me')) {
      const e = document.createElement('p');
      e.className = 'chat-empty';
      e.textContent = 'Escreva lá embaixo para conversar com o Koa. Sua conversa aparece aqui. 🌿';
      chat.appendChild(e);
    }
    for (const m of history) addMsg(m.who, m.text, false);
  }

  // ---------- balão de fala com "digitando" ----------
  let typingTimer = null;
  let typingToken = 0;

  function showTyping() {
    clearInterval(typingTimer);
    typingToken++;
    bubble.innerHTML = '<span class="typing" aria-label="Koa está pensando"><i></i><i></i><i></i></span>';
  }

  /** escreve o texto no balão aos poucos; devolve uma Promise */
  function typeInBubble(text) {
    clearInterval(typingTimer);
    const token = ++typingToken;
    if (reducedMotion.matches || text.length > 260) {
      bubble.textContent = text;
      return Promise.resolve();
    }
    const chars = Array.from(text); // respeita emojis
    const step = Math.max(1, Math.ceil(chars.length / 60)); // no máx ~1s
    let i = 0;
    bubble.textContent = '';
    return new Promise((resolve) => {
      typingTimer = setInterval(() => {
        if (token !== typingToken) { clearInterval(typingTimer); return resolve(); }
        i = Math.min(chars.length, i + step);
        bubble.textContent = chars.slice(0, i).join('');
        if (i >= chars.length) { clearInterval(typingTimer); resolve(); }
      }, 16);
    });
  }

  // ---------- nível ----------
  function plural(n) { return n === 1 ? '1 coisa' : n + ' coisas'; }

  function renderLevel() {
    const lv = brain.levelInfo();
    const n = brain.count;
    $('levelName').textContent = `Nível ${lv.level} · ${lv.name}`;
    $('levelCount').textContent = lv.next ? `${n}/${lv.next}` : plural(n);
    const pct = Math.round(lv.progress * 100);
    $('levelFill').style.width = pct + '%';
    const bar = $('levelBar');
    bar.setAttribute('aria-valuenow', String(pct));
    bar.setAttribute('aria-valuetext', `O Koa já aprendeu ${plural(n)}`);
    $('level').setAttribute('aria-label', `O Koa já aprendeu ${plural(n)}. Nível ${lv.level}, ${lv.name}.`);
    // o mundo 3D cresce junto (uma flor por coisa aprendida)
    stage.dataset.count = String(n);
    window.KoaFactIds = brain.facts.map((f) => f.id); // cada flor do mundo 3D é um fato
    window.dispatchEvent(new CustomEvent('koa:growth', { detail: { count: n, ids: window.KoaFactIds } }));
  }

  // ---------- comemoração ----------
  let toastTimer = null;
  function toast(text, ms = 2600) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function celebrate() {
    if (reducedMotion.matches) return;
    const box = $('celebrate');
    const items = ['🍃', '🌿', '💚', '⭐', '🎉', '✨', '🐨'];
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('span');
      s.className = 'confetti';
      s.textContent = items[i % items.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      s.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      s.style.setProperty('--dur', (1.8 + Math.random() * 1.6) + 's');
      s.style.animationDelay = Math.random() * 0.5 + 's';
      box.appendChild(s);
      setTimeout(() => s.remove(), 4200);
    }
  }

  // ---------- conversa ----------
  let busy = false;

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    input.value = '';
    updateSend();
    addMsg('me', text);

    KoaKoala.setMood('thinking');
    showTyping();

    const reply = brain.respond(text);
    if (reply.ignored) { busy = false; KoaKoala.setMood('idle'); return; }

    // tempo de "pensar" proporcional ao tamanho da resposta
    const wait = reducedMotion.matches ? 150 : Math.min(1100, 450 + reply.text.length * 6);
    const pause = new Promise((r) => setTimeout(r, wait));

    // cérebro avançado (opcional): só reescreve a fala; o aprendizado já aconteceu
    if (KoaLLM.isActive()) {
      const polished = await KoaLLM.polish({ brain, history, userText: text, draft: reply.text });
      if (polished.usedLLM) reply.text = polished.text;
      else if (polished.error) notifyLLMError(polished.error);
    }
    await pause;

    const pending = !!brain.state.pending;
    const after = pending ? 'curious' : 'idle';
    KoaKoala.setMood(reply.mood, reply.mood === after ? 0 : 2600, after);
    addMsg('koa', reply.text);
    await typeInBubble(reply.text);

    if (reply.levelUp) showLevelUp(reply.levelUp, after);
    if (reply.research) await doResearch(reply.research, text);
    renderLevel();
    busy = false;
  }

  function showLevelUp(lv, after) {
    celebrate();
    toast(`🎉 Nível ${lv.level}: ${lv.name}!`);
    KoaKoala.setMood('happy', 3500, after);
    const msg = `Subi de nível! Agora eu sou um ${lv.name}! 🎉 Obrigado por me ensinar ${plural(brain.count)}.`;
    addMsg('koa', msg);
    setTimeout(() => typeInBubble(msg), 900);
  }

  // ---------- pesquisa sozinho (Wikipédia) ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function updateOnline() {
    brain.canResearch = navigator.onLine !== false && !!window.KoaResearch;
  }
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();

  /** o Koa disse "vou pesquisar": busca, aprende e conta o que achou */
  async function doResearch(req, userText, quiet) {
    await sleep(reducedMotion.matches ? 100 : 700);
    if (!quiet) KoaKoala.setMood('thinking'); // quieto = por iniciativa própria, sem interromper o passeio
    showTyping();
    const offline = navigator.onLine === false;
    const [found] = await Promise.all([offline ? null : KoaResearch.lookup(req.subject), sleep(reducedMotion.matches ? 100 : 900)]);
    const res = found ? brain.learnResearch(Object.assign({}, req, found)) : brain.researchFailed(Object.assign({ offline }, req));
    if (KoaLLM.isActive()) {
      const polished = await KoaLLM.polish({ brain, history, userText: userText || req.subject, draft: res.text });
      if (polished.usedLLM) res.text = polished.text;
    }
    const after = brain.state.pending ? 'curious' : 'idle';
    KoaKoala.setMood(res.mood, res.mood === after ? 0 : 2600, after);
    addMsg('koa', res.text);
    await typeInBubble(res.text);
    if (res.levelUp) showLevelUp(res.levelUp, after);
    renderLevel();
  }

  function updateSend() {
    sendBtn.disabled = !input.value.trim();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
    input.focus(); // mantém o teclado aberto no iPhone
  });
  input.addEventListener('input', updateSend);

  // ---------- tela de memória ----------
  const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
  const ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

  function renderFacts() {
    const q = KoaBrain.normalize($('memSearch').value);
    const all = brain.facts.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    const list = q ? all.filter((f) => KoaBrain.normalize(brain.describe(f) + ' ' + f.subject + ' ' + f.value).includes(q)) : all;
    $('memSub').textContent = `O Koa já aprendeu ${plural(brain.count)} · ${brain.levelInfo().name}`;
    factsEl.innerHTML = '';
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'facts-empty';
      li.textContent = all.length ? 'Nada encontrado nessa busca.' : 'O Koa ainda não sabe nada. Volte pra conversa e ensine alguma coisa! 🌱';
      factsEl.appendChild(li);
      return;
    }
    for (const f of list) factsEl.appendChild(factItem(f));

    // o que ele deduziu sozinho (não dá para editar: muda sozinho quando os fatos mudam)
    const ded = brain.deductions().filter((d) => !q || KoaBrain.normalize(d.text).includes(q));
    if (ded.length) {
      const head = document.createElement('li');
      head.className = 'facts-head';
      head.textContent = `💭 Coisas que pensei sozinho (${ded.length})`;
      factsEl.appendChild(head);
      for (const d of ded) {
        const li = document.createElement('li');
        li.className = 'fact thought';
        const span = document.createElement('span');
        span.className = 'fact-text';
        span.textContent = d.text;
        const why = document.createElement('small');
        why.textContent = 'porque ' + d.because;
        span.appendChild(document.createElement('br'));
        span.appendChild(why);
        li.appendChild(span);
        factsEl.appendChild(li);
      }
    }
  }

  function factItem(f) {
    const li = document.createElement('li');
    li.className = 'fact';
    const span = document.createElement('span');
    span.className = 'fact-text';
    span.textContent = (f.source === 'wiki' ? '🔎 ' : '') + brain.describe(f);
    if (f.source === 'wiki') span.title = 'O Koa pesquisou isso sozinho na Wikipédia';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'fact-btn';
    edit.innerHTML = ICON_EDIT;
    edit.setAttribute('aria-label', 'Editar: ' + span.textContent);
    edit.addEventListener('click', () => li.replaceWith(editItem(f)));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fact-btn danger';
    del.innerHTML = ICON_DEL;
    del.setAttribute('aria-label', 'Apagar: ' + span.textContent);
    del.addEventListener('click', () => {
      if (!confirm(`Apagar "${span.textContent}"?`)) return;
      brain.deleteFact(f.id);
      renderFacts();
      renderLevel();
      toast('Apagado 🫥', 1600);
    });
    li.append(span, edit, del);
    return li;
  }

  function editItem(f) {
    const li = document.createElement('li');
    li.className = 'fact';
    const box = document.createElement('form');
    box.className = 'fact-edit';
    const idS = 'es-' + f.id;
    const idV = 'ev-' + f.id;
    box.innerHTML = `
      <label for="${idS}">Assunto (como você diria)</label><input id="${idS}" maxlength="60">
      <label for="${idV}">O que o Koa aprendeu</label><input id="${idV}" maxlength="200">
      <div class="row"><button type="button" class="btn" data-a="cancel">Cancelar</button><button type="submit" class="btn primary">Salvar</button></div>`;
    box.querySelector('#' + CSS.escape(idS)).value = f.subject;
    box.querySelector('#' + CSS.escape(idV)).value = f.value;
    box.querySelector('[data-a="cancel"]').addEventListener('click', renderFacts);
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const ok = brain.updateFact(f.id, {
        subject: box.querySelector('#' + CSS.escape(idS)).value,
        value: box.querySelector('#' + CSS.escape(idV)).value,
      });
      if (!ok) return toast('Preencha os dois campos 🙂', 1800);
      renderFacts();
      toast('Salvo! ✅', 1400);
    });
    li.appendChild(box);
    setTimeout(() => box.querySelector('input').focus(), 30);
    return li;
  }

  $('btnMemory').addEventListener('click', () => {
    $('memSearch').value = '';
    renderFacts();
    memory.showModal();
  });
  $('btnClose').addEventListener('click', () => memory.close());
  $('memSearch').addEventListener('input', renderFacts);

  $('btnForget').addEventListener('click', () => {
    if (!brain.count && !history.length) return toast('O Koa já não sabe nada 🙂');
    if (!confirm('Tem certeza? O Koa vai esquecer TUDO o que aprendeu e a conversa. Isso não pode ser desfeito (a não ser que você tenha exportado um backup).')) return;
    brain.forgetAll();
    history = [];
    saveHistory();
    memory.close();
    renderHistory();
    renderLevel();
    greet();
  });

  $('btnExport').addEventListener('click', async () => {
    const json = brain.exportJSON();
    const name = `koa-memoria-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    // No iPhone, compartilhar abre "Salvar em Arquivos"
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Memória do Koa' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  $('btnImport').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('Arquivo grande demais 😅');
    try {
      const text = await file.text();
      if (brain.count && !confirm('Importar vai substituir o que o Koa sabe agora. Continuar?')) return;
      const n = brain.importJSON(text);
      renderFacts();
      renderLevel();
      toast(`Importado! O Koa lembrou de ${plural(n)} 🧠`);
    } catch (err) {
      toast('Esse arquivo não parece um backup do Koa 😕', 3200);
    }
  });

  // ---------- cérebro avançado (configurações) ----------
  const settingsDlg = $('settings');
  const setStatus = $('setStatus');
  let lastLLMErrorKind = '';

  for (const m of KoaLLM.MODELS) {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.label;
    $('setModel').appendChild(o);
  }

  const LLM_ERRORS = {
    auth: 'A chave não foi aceita. Confira se copiou certinho.',
    rate: 'Limite de uso da API atingido. Tente de novo daqui a pouco.',
    network: 'Sem conexão com a API.',
    timeout: 'A API demorou demais para responder.',
    server: 'A API está com problemas agora.',
    refusal: 'A API não quis responder essa.',
    bad_request: 'A API recusou o pedido.',
  };

  function notifyLLMError(err) {
    // avisa uma vez por tipo de erro, para não encher de avisos
    if (err.kind === lastLLMErrorKind) return;
    lastLLMErrorKind = err.kind;
    toast(`${LLM_ERRORS[err.kind] || 'Erro na API.'} Usando o cérebro local 🐨`, 3600);
  }

  function renderLLMDot() {
    $('llmDot').hidden = !KoaLLM.isActive();
  }

  function setStatusText(text, kind) {
    setStatus.textContent = text;
    setStatus.className = 'status' + (kind ? ' ' + kind : '');
  }

  function formSettings() {
    return {
      enabled: $('setEnabled').checked,
      apiKey: $('setKey').value.trim(),
      model: $('setModel').value,
    };
  }

  $('btnSettings').addEventListener('click', () => {
    const s = KoaLLM.loadSettings();
    $('setEnabled').checked = s.enabled;
    $('setKey').value = s.apiKey;
    $('setModel').value = s.model;
    setStatusText(KoaLLM.isActive(s) ? 'Ligado ✨' : s.apiKey ? 'Desligado.' : 'Nenhuma chave salva.');
    settingsDlg.showModal();
  });
  $('btnSetClose').addEventListener('click', () => settingsDlg.close());

  $('setForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const s = formSettings();
    if (s.enabled && !s.apiKey) return setStatusText('Cole uma chave para ligar o cérebro avançado.', 'err');
    if (s.apiKey && !/^sk-ant-[\w-]{10,}$/.test(s.apiKey)) return setStatusText('Essa chave não parece uma chave da API do Claude.', 'err');
    if (!KoaLLM.saveSettings(s)) return setStatusText('Não consegui salvar (modo privado?).', 'err');
    lastLLMErrorKind = '';
    renderLLMDot();
    settingsDlg.close();
    toast(KoaLLM.isActive(s) ? 'Cérebro avançado ligado ✨' : 'Usando o cérebro local 🐨');
  });

  $('btnTest').addEventListener('click', async () => {
    const s = formSettings();
    if (!s.apiKey) return setStatusText('Cole uma chave primeiro.', 'err');
    const btn = $('btnTest');
    btn.disabled = true;
    setStatusText('Testando…');
    try {
      const reply = await KoaLLM.test(s);
      setStatusText('Funcionou! O Koa disse: ' + reply, 'ok');
    } catch (err) {
      setStatusText(LLM_ERRORS[err.kind] || 'Não funcionou.', 'err');
    } finally {
      btn.disabled = false;
    }
  });

  $('btnRemoveKey').addEventListener('click', () => {
    if (!confirm('Remover a chave deste aparelho? O Koa volta a usar só o cérebro local.')) return;
    KoaLLM.saveSettings({ enabled: false, apiKey: '', model: $('setModel').value });
    $('setKey').value = '';
    $('setEnabled').checked = false;
    renderLLMDot();
    setStatusText('Chave removida.', 'ok');
  });

  renderLLMDot();

  // ---------- teclado do iPhone ----------
  // Ajusta a altura do app à área visível para o campo não ficar escondido.
  const vv = window.visualViewport;
  function fitViewport() {
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', h + 'px');
    const kb = vv ? window.innerHeight - vv.height > 140 : false;
    app.classList.toggle('kb-open', kb);
    if (vv && vv.offsetTop) window.scrollTo(0, 0);
    chat.scrollTop = chat.scrollHeight;
  }
  if (vv) {
    vv.addEventListener('resize', fitViewport);
    vv.addEventListener('scroll', fitViewport);
  }
  window.addEventListener('resize', fitViewport);
  input.addEventListener('blur', () => setTimeout(fitViewport, 50));
  fitViewport();

  // ---------- início ----------
  function greet() {
    let text;
    if (brain.isNew()) {
      text = brain.introText();
      KoaKoala.setMood('curious');
    } else {
      text = brain.greeting(); // lembra do tempo longe e de algo que aprendeu
      KoaKoala.setMood('happy', 2200);
    }
    // a apresentação entra no histórico só uma vez; o "oi de novo" é só no balão
    if (!history.length) addMsg('koa', text);
    typeInBubble(text);
  }

  // ---------- autonomia: o Koa puxa assunto sozinho ----------
  // Se a pessoa ficar quieta, ele fala algo (no máximo 2 vezes seguidas sem resposta).
  let idleTimer = null;
  let unanswered = 0;
  let lastActivity = null;

  function scheduleInitiative() {
    clearTimeout(idleTimer);
    if (unanswered >= 2) return;
    const wait = (unanswered === 0 ? 40 : 90) * 1000 + Math.random() * 20000;
    idleTimer = setTimeout(speakUp, wait);
  }

  async function speakUp() {
    // não interrompe: nem com a pessoa digitando, nem com telas abertas, nem em segundo plano
    if (document.hidden || busy || input.value.trim() || memory.open || settingsDlg.open) return scheduleInitiative();
    const r = brain.initiative({ activity: lastActivity });
    lastActivity = null;
    if (!r || !r.text) return;
    unanswered++;
    busy = true;
    // sem a carinha de "pensando": isso faria o Koa largar o que está fazendo no mundo 3D
    showTyping();
    await new Promise((res) => setTimeout(res, reducedMotion.matches ? 100 : 900));
    let text = r.text;
    if (KoaLLM.isActive()) {
      const polished = await KoaLLM.polish({ brain, history, userText: '(a pessoa está quieta; o Koa puxa assunto)', draft: text });
      if (polished.usedLLM) text = polished.text;
    }
    const after = brain.state.pending ? 'curious' : 'idle';
    KoaKoala.setMood(r.mood || 'idle', 2600, after);
    addMsg('koa', text);
    await typeInBubble(text);
    if (r.research) await doResearch(r.research, '', true);
    busy = false;
    scheduleInitiative();
  }

  // o mundo 3D conta o que o Koa fez sozinho (bebeu água, cheirou flor...)
  window.addEventListener('koa:activity', (e) => {
    lastActivity = Object.assign({ at: Date.now() }, e.detail || {});
  });

  form.addEventListener('submit', () => {
    unanswered = 0;
    setTimeout(scheduleInitiative, 0);
  });
  input.addEventListener('input', () => {
    if (unanswered < 2) scheduleInitiative(); // digitando adia a iniciativa
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleInitiative();
  });

  renderHistory();
  renderLevel();
  greet();
  scheduleInitiative();

  // ---------- funciona offline ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sem offline, tudo bem */ });
    });
  }
})();
