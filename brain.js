/*
 * brain.js — o "cérebro" do Koa.
 *
 * Tudo aqui é 100% local: regras simples de padrão em português do Brasil,
 * uma memória de fatos e um pouco de "jeito de falar" aprendido com a pessoa.
 * Funciona no navegador (window.KoaBrain) e no Node (require) para os testes.
 *
 * Modelo de um fato:
 *   { id, subject, key, rel, value, plural, createdAt, updatedAt, uses }
 *   - subject: como a PESSOA escreveu ("meu nome", "o céu", "eu")
 *   - key:     forma normalizada para busca ("user:nome", "ceu")
 *   - rel:     relação ("é", "tem", "gosta", "mora", "nota", ...)
 *   - value:   o que foi aprendido, como a pessoa escreveu ("Ana", "azul")
 * Na hora de falar, o Koa troca a perspectiva (meu → seu, eu → você).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KoaBrain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_VERSION = 1;
  const MAX_INPUT = 500;
  const MAX_VALUE = 200;
  const MAX_SUBJECT = 60;

  const LEVELS = [
    { min: 0, name: 'Bebê coala' },
    { min: 10, name: 'Filhote curioso' },
    { min: 25, name: 'Coala aprendiz' },
    { min: 50, name: 'Coala estudante' },
    { min: 100, name: 'Coala sabido' },
    { min: 200, name: 'Coala sábio' },
    { min: 500, name: 'Mestre do eucalipto' },
    { min: 1000, name: 'Lenda dos coalas' },
  ];

  // ---------------------------------------------------------------------------
  // Utilidades de texto
  // ---------------------------------------------------------------------------

  function stripAccents(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /** minúsculas, sem acentos, sem pontuação, espaços simples */
  function normalize(s) {
    return stripAccents(String(s == null ? '' : s).toLowerCase())
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const ARTIGOS = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas']);

  /** plural simples -> singular (já sem acentos) */
  function singular(w) {
    if (w.length <= 3) return w;
    if (/(oes|aes)$/.test(w)) return w.slice(0, -3) + 'ao'; // leões -> leão
    if (/ais$/.test(w)) return w.slice(0, -2) + 'l'; // animais -> animal
    if (/eis$/.test(w)) return w.slice(0, -3) + 'el'; // papéis -> papel
    if (/ois$/.test(w)) return w.slice(0, -2) + 'l'; // lençóis -> lençol
    if (/(r|z)es$/.test(w)) return w.slice(0, -2); // flores -> flor
    if (/ns$/.test(w)) return w.slice(0, -2) + 'm'; // homens -> homem
    if (/[aeo]s$/.test(w)) return w.slice(0, -1); // gatos -> gato
    return w;
  }

  /** chave de busca para um assunto genérico */
  function keyOf(text) {
    return normalize(text)
      .split(' ')
      .filter((t) => t && !ARTIGOS.has(t))
      .map(singular)
      .join(' ');
  }

  function levenshtein(a, b) {
    a = String(a);
    b = String(b);
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    let cur = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[b.length];
  }

  /** 0..1 — 1 = igual */
  function similarity(a, b) {
    const max = Math.max(String(a).length, String(b).length);
    if (!max) return 1;
    return 1 - levenshtein(a, b) / max;
  }

  function maxEdits(len) {
    return len <= 3 ? 0 : len <= 6 ? 1 : 2;
  }

  /** quão parecidas duas chaves são (0 = nada a ver) */
  function keyMatchScore(q, k) {
    if (!q || !k) return 0;
    if (q === k) return 1;
    const d = levenshtein(q, k);
    if (d <= maxEdits(Math.min(q.length, k.length))) {
      return 1 - d / Math.max(q.length, k.length);
    }
    const qt = q.split(' ');
    const kt = k.split(' ');
    if (qt.length > 1 || kt.length > 1) {
      let common = 0;
      for (const t of qt) {
        if (kt.some((x) => x === t || (t.length > 3 && levenshtein(x, t) <= 1))) common++;
      }
      const ratio = common / Math.max(qt.length, kt.length);
      if (ratio >= 0.6) return ratio * 0.9;
    }
    return 0;
  }

  // troca de perspectiva: o que a pessoa disse -> como o Koa fala de volta
  const SWAP = {
    meu: 'seu', seu: 'meu', minha: 'sua', sua: 'minha',
    meus: 'seus', seus: 'meus', minhas: 'suas', suas: 'minhas',
    eu: 'você', 'você': 'eu', voce: 'eu', vc: 'eu',
    comigo: 'com você', contigo: 'comigo', mim: 'você',
  };
  const SWAP_RE = /(?<![\p{L}\p{N}])(meus|meu|minhas|minha|seus|seu|suas|sua|eu|você|voce|vc|comigo|contigo|mim)(?![\p{L}\p{N}])/giu;

  function swapPerspective(text) {
    return String(text).replace(SWAP_RE, (m) => {
      const out = SWAP[m.toLowerCase()] || m;
      return m[0] !== m[0].toLowerCase() ? cap(out) : out;
    });
  }

  /** "de" + assunto com contração: o gato -> do gato, a lua -> da lua */
  function deX(s) {
    const m = String(s).match(/^(o|a|os|as)\s+(.+)$/iu);
    return m ? `d${m[1].toLowerCase()} ${m[2]}` : `de ${s}`;
  }

  function cap(s) {
    s = String(s);
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  }

  function joinPt(list) {
    const l = list.filter(Boolean);
    if (l.length <= 1) return l.join('');
    return l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
  }

  function wordCount(s) {
    return String(s).trim().split(/\s+/).filter(Boolean).length;
  }

  /** limpa um valor aprendido */
  function cleanValue(v) {
    let s = String(v == null ? '' : v)
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
      .replace(/[\s.!?,;:…]+$/u, '')
      .trim();
    if (s.length > MAX_VALUE) s = s.slice(0, MAX_VALUE).trim() + '…';
    return s;
  }

  /** limpa um assunto vindo de pergunta */
  function cleanSubject(s) {
    return String(s)
      .replace(/[\s.!?,;:…]+$/u, '')
      .replace(/\s+(mesmo|afinal|hein|ent[aã]o)$/iu, '')
      .replace(/^(um|uma|uns|umas)\s+/iu, '')
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .trim();
  }

  /** "gato tem bigode, rabo e patas" -> lista, se as partes forem curtas */
  function splitList(v) {
    const parts = v.split(/\s*,\s*|\s+e\s+/u).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => wordCount(p) <= 4)) return parts;
    return [v];
  }

  const STOPWORDS = new Set(normalize(
    'o a os as um uma uns umas de do da dos das em no na nos nas por pelo pela para pra com sem que e é eh eu você voce vc ' +
    'ele ela eles elas meu minha meus minhas seu sua seus suas isso isto aquilo aquele aquela já ja não nao sim mais menos muito muita ' +
    'muitos muitas também tambem só so mas como quando onde qual quais quem porque pq tá ta tô to está esta estou estava foi ser ' +
    'ter tem tenho sou era vai vou koa oi olá ola tudo bem aí ai lá la aqui até ate me te se lhe nós nos gente coisa coisas sabe ' +
    'acho fica isso então entao agora hoje depois antes bom boa dia noite tarde ok legal pode quer obrigado obrigada valeu kkk'
  ).split(' '));

  const INTERJECTIONS = new Set([
    'nossa', 'ah', 'aff', 'afe', 'eita', 'oba', 'eba', 'uau', 'oxe', 'oxi', 'gente', 'amiga', 'amigo', 'amor',
    'mano', 'cara', 'poxa', 'putz', 'ai', 'ui', 'vixe', 'opa', 'hmm', 'hum', 'uhul', 'caramba', 'caraca',
    'misericordia', 'socorro', 'ahh', 'aaa', 'ixi', 'pois', 'bah', 'tche', 'uai', 'oloco', 'nossinha',
  ]);
  const GREET_WORDS = new Set(['oi', 'oie', 'ola', 'oii', 'eai', 'opa', 'hey', 'alo', 'salve']);

  /** "nossaaaa" -> "nossa", "oiiii" -> "oii" */
  function collapse(w) {
    return w.replace(/(\p{L})\1{2,}/gu, '$1$1').replace(/(\p{L})\1$/u, '$1');
  }

  const LAUGH_RE = /(?<![\p{L}])(k{3,}|(?:ha){2,}h?|(?:he){2,}|(?:hu?e){2,}|(?:rs){1,}|kk)(?![\p{L}])/giu;
  const EMOJI_RE = /\p{Extended_Pictographic}/gu;

  // ---------------------------------------------------------------------------
  // Verbos / relações
  // ---------------------------------------------------------------------------

  const VERBS = {
    'se chamam': { rel: 'chama', plural: true }, 'se chama': { rel: 'chama', plural: false },
    'são': { rel: 'é', plural: true }, sao: { rel: 'é', plural: true },
    'é': { rel: 'é', plural: false }, eh: { rel: 'é', plural: false },
    'têm': { rel: 'tem', plural: true }, tem: { rel: 'tem', plural: false },
    ficam: { rel: 'fica', plural: true }, fica: { rel: 'fica', plural: false },
    moram: { rel: 'mora', plural: true }, mora: { rel: 'mora', plural: false },
    vivem: { rel: 'vive', plural: true }, vive: { rel: 'vive', plural: false },
    gostam: { rel: 'gosta', plural: true }, gosta: { rel: 'gosta', plural: false },
    comem: { rel: 'come', plural: true }, come: { rel: 'come', plural: false },
    servem: { rel: 'serve', plural: true }, serve: { rel: 'serve', plural: false },
    significam: { rel: 'significa', plural: true }, significa: { rel: 'significa', plural: false },
    trabalham: { rel: 'trabalha', plural: true }, trabalha: { rel: 'trabalha', plural: false },
  };
  // mais verbos que o Koa entende: [singular, plural, forma com "eu"]
  const EXTRA_VERBS = [
    ['pode', 'podem', 'posso'], ['consegue', 'conseguem', 'consigo'], ['faz', 'fazem', 'faço'],
    ['usa', 'usam', 'uso'], ['precisa', 'precisam', 'preciso'], ['ajuda', 'ajudam', 'ajudo'],
    ['ama', 'amam', 'amo'], ['adora', 'adoram', 'adoro'], ['odeia', 'odeiam', 'odeio'],
    ['produz', 'produzem', 'produzo'], ['bebe', 'bebem', 'bebo'], ['protege', 'protegem', 'protejo'],
    ['parece', 'parecem', 'pareço'], ['vira', 'viram', 'viro'], ['sabe', 'sabem', 'sei'],
    ['tem medo de', 'têm medo de', 'tenho medo de'], ['foi', 'foram', 'fui'],
  ];
  for (const [s, p] of EXTRA_VERBS) {
    VERBS[s] = { rel: s, plural: false };
    VERBS[p] = { rel: s, plural: true };
  }
  const VERB_ALTS = Object.keys(VERBS).sort((a, b) => b.length - a.length).map((v) => v.replace(/ /g, '\\s+')).join('|');
  const STATEMENT_RE = new RegExp(`^(.+?)\\s+(?:tamb[eé]m\\s+)?(${VERB_ALTS})\\s+(.+)$`, 'iu');
  const STARTS_WITH_VERB_RE = new RegExp(`^(?:tamb[eé]m\\s+)?(?:${VERB_ALTS})\\s+\\S`, 'iu');

  const REL_SING = {
    'é': 'é', tem: 'tem', fica: 'fica', mora: 'mora', vive: 'vive', gosta: 'gosta', come: 'come',
    serve: 'serve', significa: 'significa', chama: 'se chama', trabalha: 'trabalha',
  };
  const REL_PL = {
    'é': 'são', tem: 'têm', fica: 'ficam', mora: 'moram', vive: 'vivem', gosta: 'gostam', come: 'comem',
    serve: 'servem', significa: 'significam', chama: 'se chamam', trabalha: 'trabalham',
  };
  const REL_EU = {
    'é': 'sou', tem: 'tenho', fica: 'fico', mora: 'moro', vive: 'vivo', gosta: 'gosto', come: 'como',
    serve: 'sirvo', significa: 'significo', chama: 'me chamo', trabalha: 'trabalho',
  };
  for (const [s, p, eu] of EXTRA_VERBS) {
    REL_SING[s] = s;
    REL_PL[s] = p;
    REL_EU[s] = eu;
  }
  const REL_ORDER = ['chama', 'é', 'tem', 'ação', 'pode', 'gosta', 'não gosta', 'come', 'bebe', 'mora', 'vive', 'fica', 'trabalha', 'serve', 'significa', 'nota'];

  function verbFor(rel, subjOut, plural) {
    if (rel.startsWith('não ')) return 'não ' + verbFor(rel.slice(4), subjOut, plural);
    const isEu = normalize(subjOut) === 'eu';
    const table = isEu ? REL_EU : plural ? REL_PL : REL_SING;
    return table[rel] || rel;
  }

  /** o "resto" da frase depois do sujeito: "tem bigode", "mia" */
  function predicate(rel, subjOut, vals, plural) {
    if (rel === 'ação') return joinPt(vals);
    if (rel === 'não ação') return 'não ' + joinPt(vals);
    return `${verbFor(rel, subjOut, plural)} ${joinPt(vals)}`;
  }

  /** frase sem maiúscula nem ponto: "o céu é azul" */
  function phrase(subject, rel, values, plural) {
    const subjOut = swapPerspective(subject);
    const vals = (Array.isArray(values) ? values : [values]).map(swapPerspective);
    if (rel === 'nota') return `sobre ${subjOut}: ${vals.join('; ')}`;
    return `${subjOut} ${predicate(rel, subjOut, vals, plural)}`;
  }

  // ---------------------------------------------------------------------------
  // Gosto e humor do Koa
  // ---------------------------------------------------------------------------
  const POS_WORDS = new Set(normalize(
    'fofo fofa fofinho fofinha lindo linda bonito bonita gostoso gostosa doce legal bom boa divertido divertida ' +
    'cheiroso cheirosa macio macia alegre amigo amiga carinhoso carinhosa delicioso deliciosa incrível maravilhoso ' +
    'maravilhosa colorido colorida brilhante feliz engraçado engraçada amoroso amorosa calmo calma fofura top'
  ).split(' '));
  const NEG_WORDS = new Set(normalize(
    'chato chata feio feia ruim perigoso perigosa bravo brava nojento nojenta amargo amarga barulhento barulhenta ' +
    'fedido fedida triste mau má venenoso venenosa assustador assustadora violento violenta sujo suja horrível'
  ).split(' '));
  const KOA_LIKES = ['eucalipto', 'folha', 'arvore', 'abraco', 'carinho', 'soneca', 'dormir', 'sol', 'flor', 'fruta', 'agua', 'lua', 'estrela', 'natureza', 'coala'];
  const KOA_DISLIKES = ['barulho', 'fogo', 'fumaca', 'grito', 'tempestade', 'motosserra', 'trovao'];
  const DAILY_MOODS = ['alegre', 'brincalhão', 'pensativo', 'carinhoso', 'animado'];

  /** número 0..1 estável a partir de um texto */
  function hashStr(s) {
    let h = 2166136261;
    for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return ((h >>> 0) % 10000) / 10000;
  }

  /** calculadora simples (+ - * / e parênteses), sem eval */
  function calc(expr) {
    const s = expr.replace(/\s+/g, '');
    let i = 0;
    const num = () => {
      const m = s.slice(i).match(/^\d+(?:\.\d+)?/);
      if (!m) throw new Error('num');
      i += m[0].length;
      return parseFloat(m[0]);
    };
    const factor = () => {
      if (s[i] === '-') { i++; return -factor(); }
      if (s[i] === '(') {
        i++;
        const v = sum();
        if (s[i] !== ')') throw new Error(')');
        i++;
        return v;
      }
      return num();
    };
    const term = () => {
      let v = factor();
      while (s[i] === '*' || s[i] === '/') {
        const op = s[i++];
        const r = factor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    };
    const sum = () => {
      let v = term();
      while (s[i] === '+' || s[i] === '-') {
        const op = s[i++];
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    };
    const v = sum();
    if (i !== s.length) throw new Error('fim');
    return v;
  }

  function sentence(subject, rel, values, plural) {
    return cap(phrase(subject, rel, values, plural)) + '.';
  }

  /** chave de um assunto (trata "meu X", "você", "eu") */
  function subjectKey(subject) {
    const n = normalize(subject);
    if (!n) return '';
    if (/^(voce|vc|tu|koa|o koa)$/.test(n)) return 'koa:self';
    if (n === 'eu') return 'user:sou';
    const m = n.match(/^(?:(?:o|a|os|as)\s+)?(?:meu|minha|meus|minhas)\s+(.+)$/);
    if (m) return 'user:' + keyOf(m[1]);
    return keyOf(subject);
  }

  function namespace(key) {
    const m = String(key).match(/^(user|koa):/);
    return m ? m[1] : '';
  }

  // campos de perfil que só têm um valor (trocar em vez de acumular)
  const SINGLE_USER_RE = /^user:(nome|idade|anivers|apelido|cidade|signo|profiss|email|telefone|.*favorit|.*preferid)/;
  function isSingleValued(key, rel) {
    if (key === 'user:mora') return true;
    return SINGLE_USER_RE.test(key) && (rel === 'é' || rel === 'tem' || rel === 'chama');
  }

  // ---------------------------------------------------------------------------
  // Padrões de conversa
  // ---------------------------------------------------------------------------

  const QSTART_RE = /^(?:o\s*qu[eê]|oq|que|quem|qual|quais|como|onde|quando|por\s+qu[eê]|cad[eê]|quant[oa]s?|(?:voc[eê]|vc)\s+(?:sabe|conhece|lembra)|sabe|me\s+(?:fala|conta|diz)|fala\s+(?:mais\s+)?sobre|conta\s+(?:mais\s+)?sobre)(?=[\s?!.,]|$)/iu;
  const YES_RE = /^(?:sim+|s|ss+|isso+|isso\s+mesmo|aham|uhum|exato|claro|é\s+sim|eh\s+sim|certo|correto|verdade|acertou|é\s+isso|é)$/iu;
  const NO_RE = /^(?:n[aã]o+|n|nops|nope|negativo|errado|nada\s+a\s+ver)$/iu;
  const CANCEL_RE = /^(?:n[aã]o\s+sei|sei\s+l[aá]|sei\s+n[aã]o|deixa(?:\s+pra\s+l[aá])?|esquece|depois|nada|pula|pr[oó]xim[ao]|outra\s+hora|n[aã]o\s+quero)(?=\s|$|[.!,])/iu;

  const FRAMES = [
    { re: /^(?:(?:voc[eê]|vc)\s+)?(?:sabe\s+)?(?:me\s+(?:diz|dizer|fala|falar|conta|contar)\s+)?(?:o\s*qu[eê]|oq|que|quem|qual|quais)\s+(?:é|e|eh|são|sao|foi|era|eram|seria)\s+(.+)$/iu, rels: ['é', 'nota', 'chama'] },
    { re: /^qual\s+(?:(?:o|a|os|as)\s+)?(.+)$/iu, rels: ['é', 'chama'] },
    { re: /^(?:o\s*qu[eê]|oq)\s+(?:significa|quer\s+dizer)\s+(.+)$/iu, rels: ['significa', 'é'] },
    { re: /^(?:o\s*qu[eê]|oq)\s+(.+?)\s+(?:tem|têm|possui)$/iu, rels: ['tem'] },
    { re: /^(?:o\s*qu[eê]|oq)\s+(.+?)\s+(?:come|comem)$/iu, rels: ['come'] },
    { re: /^(?:do\s+qu[eê]|o\s*qu[eê]|oq|de\s+qu[eê])\s+(.+?)\s+(?:gosta|gostam)$/iu, rels: ['gosta'] },
    { re: /^onde\s+(?:é\s+que\s+)?(?:fica|ficam|é|mora|moram|vive|vivem)\s+(.+)$/iu, rels: ['fica', 'mora', 'vive'] },
    { re: /^onde\s+(.+?)\s+(?:fica|ficam|mora|moram|vive|vivem)$/iu, rels: ['fica', 'mora', 'vive'] },
    { re: /^(?:para|pra)\s+(?:que|qu[eê])\s+(?:serve|servem)\s+(.+)$/iu, rels: ['serve'] },
    { re: /^como\s+(?:se\s+)?(?:chama|chamam)\s+(.+)$/iu, rels: ['chama', 'é'] },
    { re: /^(.+?)\s+(?:é|e|são|eh)\s+(?:o\s*qu[eê]|oq|quem)$/iu, rels: ['é', 'nota', 'chama'] },
    { re: /^(?:o\s*qu[eê]\s+)?(?:voc[eê]|vc)\s+sabe\s+(?:sobre|de|do|da|dos|das)\s+(.+)$/iu, rels: null },
    { re: /^(?:me\s+)?(?:fala|conta|diz)\s+(?:mais\s+|um\s+pouco\s+)?(?:sobre|de|do|da|dos|das)\s+(.+)$/iu, rels: null },
    { re: /^(?:voc[eê]|vc)\s+(?:sabe|conhece)\s+(.+)$/iu, rels: null },
  ];

  const ASK_TEXT = {
    'é': (s, quem) => `${quem ? 'quem' : 'o que'} é ${s}`,
    nota: (s) => `o que é ${s}`,
    tem: (s) => `o que ${s} tem`,
    come: (s) => `o que ${s} come`,
    gosta: (s) => `do que ${s} gosta`,
    fica: (s) => `onde fica ${s}`,
    mora: (s) => `onde ${s} mora`,
    vive: (s) => `onde ${s} vive`,
    serve: (s) => `para que serve ${s}`,
    chama: (s) => `como ${s} se chama`,
    significa: (s) => `o que significa ${s}`,
  };

  const USER_Q = {
    'user:nome': { subject: 'meu nome', rel: 'é', ask: 'Como você se chama?', none: 'Ainda não sei o seu nome...' },
    'user:gosta': { subject: 'eu', rel: 'gosta', prep: 'de', list: true, ask: 'Do que você gosta?', none: 'Você ainda não me contou do que gosta...' },
    'user:naogosta': { subject: 'eu', rel: 'não gosta', prep: 'de', list: true, ask: 'Do que você não gosta?', none: 'Você ainda não me contou do que não gosta...' },
    'user:mora': { subject: 'eu', rel: 'mora', prep: 'em', ask: 'Onde você mora?', none: 'Ainda não sei onde você mora...' },
    'user:idade': { subject: 'eu', rel: 'tem', age: true, ask: 'Quantos anos você tem?', none: 'Ainda não sei sua idade...' },
    'user:tem': { subject: 'eu', rel: 'tem', list: true, ask: 'O que você tem?', none: 'Você ainda não me contou o que tem...' },
    'user:trabalha': { subject: 'eu', rel: 'trabalha', ask: 'Com o que você trabalha?', none: 'Ainda não sei com o que você trabalha...' },
  };

  // ---------------------------------------------------------------------------
  // O cérebro
  // ---------------------------------------------------------------------------

  function emptyState() {
    return {
      version: STORAGE_VERSION,
      facts: [],
      pending: null,
      lastSubject: null,
      turns: 0,
      lastCuriosityTurn: -99,
      asked: [],
      style: { msgs: 0, words: {}, openers: {}, greets: {}, laughs: {}, emojis: {}, phrases: [] },
    };
  }

  class Brain {
    /**
     * @param {object} opts
     * @param {{load:()=>string|null, save:(s:string)=>void}} [opts.storage]
     * @param {()=>number} [opts.rng]  aleatoriedade (injetável nos testes)
     * @param {()=>number} [opts.now]
     */
    constructor(opts = {}) {
      this.storage = opts.storage || null;
      this.rng = opts.rng || Math.random;
      this.now = opts.now || (() => Date.now());
      this.seq = 0;
      this.canResearch = !!opts.canResearch; // o app liga quando há internet
      this.state = emptyState();
      this.load();
    }

    // ---- persistência ------------------------------------------------------
    load() {
      if (!this.storage) return;
      try {
        const raw = this.storage.load();
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.facts)) {
          this.state = Object.assign(emptyState(), data);
          this.state.style = Object.assign(emptyState().style, data.style || {});
        }
      } catch (e) {
        /* memória corrompida: começa do zero sem quebrar o app */
      }
    }

    save() {
      if (!this.storage) return;
      try {
        this.storage.save(JSON.stringify(this.state));
      } catch (e) {
        /* armazenamento cheio ou bloqueado (modo privado) */
      }
    }

    // ---- consultas públicas ------------------------------------------------
    get facts() {
      return this.state.facts;
    }

    get count() {
      return this.state.facts.length;
    }

    isNew() {
      return this.count === 0 && this.state.turns === 0;
    }

    levelInfo(count = this.count) {
      let i = 0;
      for (let k = 0; k < LEVELS.length; k++) if (count >= LEVELS[k].min) i = k;
      const cur = LEVELS[i];
      const next = LEVELS[i + 1] || null;
      const progress = next ? (count - cur.min) / (next.min - cur.min) : 1;
      return { index: i, level: i + 1, name: cur.name, min: cur.min, next: next ? next.min : null, progress };
    }

    introText() {
      return 'Oi! Eu sou o Koa 🐨 Acabei de chegar e ainda não sei NADA... nadinha! ' +
        'Você me ensina? Pode me contar coisas tipo "o céu é azul" ou "meu nome é Ana".';
    }

    /** texto de um fato para a lista "O que o Koa sabe" */
    describe(f) {
      return sentence(f.subject, f.rel, [f.value], f.plural);
    }

    // ---- edição manual (tela de memória) ----------------------------------
    updateFact(id, changes) {
      const f = this.state.facts.find((x) => x.id === id);
      if (!f) return false;
      if (changes.value != null) {
        const v = cleanValue(changes.value);
        if (!v) return false;
        f.value = v;
      }
      if (changes.subject != null) {
        const s = cleanValue(changes.subject).slice(0, MAX_SUBJECT);
        const k = subjectKey(s);
        if (!s || !k) return false;
        // fatos especiais (perfil/gostos) mantêm a chave; os demais seguem o assunto novo
        if (!/^user:(gosta|naogosta|tem|idade|mora|trabalha|sou)$/.test(f.key)) f.key = k;
        f.subject = s;
      }
      f.updatedAt = this.now();
      this.save();
      return true;
    }

    deleteFact(id) {
      const before = this.state.facts.length;
      this.state.facts = this.state.facts.filter((x) => x.id !== id);
      this.save();
      return this.state.facts.length < before;
    }

    forgetAll() {
      this.state = emptyState();
      this.save();
    }

    exportJSON() {
      return JSON.stringify({ app: 'koa', version: STORAGE_VERSION, exportedAt: new Date(this.now()).toISOString(), state: this.state }, null, 2);
    }

    /** importa um backup; devolve quantos fatos vieram. Lança erro se inválido. */
    importJSON(text) {
      const data = JSON.parse(text);
      const st = data && data.state ? data.state : data;
      if (!st || !Array.isArray(st.facts)) throw new Error('Arquivo não parece um backup do Koa.');
      const facts = [];
      for (const f of st.facts) {
        if (!f || typeof f.subject !== 'string' || typeof f.value !== 'string') continue;
        const subject = cleanValue(f.subject).slice(0, MAX_SUBJECT);
        const value = cleanValue(f.value);
        if (!subject || !value) continue;
        facts.push({
          id: typeof f.id === 'string' ? f.id : this.newId(),
          subject,
          key: typeof f.key === 'string' && f.key ? f.key : subjectKey(subject),
          rel: typeof f.rel === 'string' && f.rel ? f.rel : 'é',
          value,
          plural: !!f.plural,
          createdAt: Number(f.createdAt) || this.now(),
          updatedAt: Number(f.updatedAt) || this.now(),
          uses: Number(f.uses) || 0,
          ...(f.source === 'wiki' ? { source: 'wiki' } : {}),
        });
      }
      const next = Object.assign(emptyState(), st, { facts, pending: null });
      next.style = Object.assign(emptyState().style, st.style || {});
      this.state = next;
      this.save();
      return facts.length;
    }

    newId() {
      this.seq++;
      return 'f' + this.now().toString(36) + this.seq.toString(36) + Math.floor(this.rng() * 1e6).toString(36);
    }

    pick(arr) {
      return arr[Math.min(arr.length - 1, Math.floor(this.rng() * arr.length))];
    }

    userName() {
      const f = this.state.facts.find((x) => x.key === 'user:nome');
      return f ? f.value : '';
    }

    // ---- conversa ------------------------------------------------------------
    /**
     * Recebe uma mensagem da pessoa e devolve a resposta do Koa.
     * @returns {{text:string, mood:string, learned:boolean, count:number, level:object, levelUp:object|null, ignored?:boolean}}
     */
    respond(input) {
      let text = String(input == null ? '' : input).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) return { text: '', mood: 'idle', learned: false, count: this.count, level: this.levelInfo(), levelUp: null, ignored: true };

      const out = { parts: [], mood: 'idle', learned: 0, changed: 0, answered: false, asked: false };
      if (text.length > MAX_INPUT) {
        text = text.slice(0, MAX_INPUT);
        out.parts.push('Uau, quanta coisa! Vou guardar só o comecinho, tá? 😅');
      }

      const levelBefore = this.levelInfo().index;
      this.state.turns++;
      this.learnStyle(text);

      const sentences = text.split(/(?<=[.!?;…])\s+|\n+/u).map((s) => s.trim()).filter(Boolean).slice(0, 6);
      for (const s of sentences) this.handleSentence(s, out);

      if (!out.parts.length) this.fallback(text, out);
      if (out.learned && !this.state.pending && !out.asked) {
        const keys = new Set(this.state.facts.slice(-out.learned).map((f) => f.key));
        if (!this.maybeThink(out, keys)) this.maybeCurious(out);
        if (!out.asked && !out.thought) this.maybeOpinion(out, [...keys][0]);
      }
      this.state.lastSeen = this.now();

      return this.finish(out, levelBefore);
    }

    /** monta o resultado de uma fala do Koa */
    finish(out, levelBefore) {
      let mood = out.mood;
      if (out.learned || out.changed) mood = 'happy';
      else if (out.asked && mood !== 'confused') mood = 'curious';

      let reply = out.parts.slice(0, 4).join(' ');
      reply = this.decorate(reply, mood);

      const levelNow = this.levelInfo();
      const levelUp = levelNow.index > levelBefore ? levelNow : null;
      this.save();
      const r = { text: reply, mood, learned: out.learned > 0, count: this.count, level: levelNow, levelUp };
      if (out.research) r.research = out.research;
      return r;
    }

    // ---- pesquisa sozinho (Wikipédia) -----------------------------------------
    /** dá para pesquisar isso? (nunca coisas sobre a pessoa ou sobre o Koa) */
    researchable(key, rel) {
      if (!this.canResearch || !key || namespace(key)) return false;
      if (rel && !['é', 'nota', 'chama', 'significa'].includes(rel)) return false;
      return key.length >= 2 && wordCount(key) <= 5 && !/^\d+$/.test(key);
    }

    /** transforma a frase da Wikipédia em um fato: "X é um mamífero..." -> é / "um mamífero..." */
    definitionFrom(sentence) {
      const s = String(sentence).replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
      const m = s.match(/\s(é|são|foi|era|eram|foram|constitui|constituem|representa|representam|designa|designam|refere-se\s+a|referem-se\s+a)\s/iu);
      if (!m) return { rel: 'nota', value: cleanValue(s), plural: false };
      let v = s.slice(m.index + m[0].length).trim();
      // corta na primeira vírgula quando a frase for comprida
      const comma = v.indexOf(',');
      if (v.length > 90 && comma > 15) v = v.slice(0, comma);
      if (v.length > 160) v = v.slice(0, 160).replace(/\s+\S*$/, '') + '…';
      const verb = m[1].toLowerCase();
      const past = /^(foi|era|eram|foram)$/.test(verb); // "Santos Dumont foi um inventor"
      return { rel: past ? 'foi' : 'é', value: cleanValue(v), plural: /^(são|eram|foram|constituem|representam|designam|referem)/.test(verb) };
    }

    /** o app pesquisou e achou: o Koa aprende e conta */
    learnResearch(r) {
      const levelBefore = this.levelInfo().index;
      const out = { parts: [], mood: 'idle', learned: 0, changed: 0, answered: false, asked: false };
      const d = this.definitionFrom(r.sentence);
      let subject = cleanSubject(r.subject);
      // usa o título da Wikipédia quando é o mesmo nome (mantém maiúsculas: "Santos Dumont")
      if (r.title && normalize(r.title) === normalize(subject)) subject = r.title;
      else if (r.title && /^\p{Lu}/u.test(r.title) && normalize(r.title).split(' ').length > 1 && normalize(r.title).includes(normalize(subject))) subject = r.title;
      // "Dinossauros são..." mas ela perguntou "o que é um dinossauro": concorda com o assunto dela
      d.plural = d.plural && /s$/i.test(normalize(subject));
      const res = d.value ? this.learn({ subject, key: r.key, rel: d.rel, value: d.value, plural: d.plural, source: 'wiki' }) : null;
      if (res && res.status === 'new') {
        out.learned++;
        const p = phrase(res.fact.subject, res.fact.rel, [res.fact.value], res.fact.plural);
        this.say(out, `${this.pick(['Pesquisei! 🔎', 'Fui pesquisar e descobri:', 'Achei na Wikipédia!'])} ${cap(p)}! ${this.pick(['🤯', '✨', '🤓', '🌿'])}`, 'happy');
        this.maybeThink(out, new Set([r.key]));
      } else if (res) {
        this.say(out, `Pesquisei e confirmei: ${phrase(res.fact.subject, res.fact.rel, [res.fact.value], res.fact.plural)}! 🤓`, 'happy');
      } else {
        return this.researchFailed(r);
      }
      this.state.lastSubject = { key: r.key, subject: res.fact.subject, rel: res.fact.rel };
      return this.finish(out, levelBefore);
    }

    /** não achou (ou sem internet): volta a pedir para ensinar */
    researchFailed(r) {
      const levelBefore = this.levelInfo().index;
      const out = { parts: [], mood: 'idle', learned: 0, changed: 0, answered: false, asked: false };
      const s = swapPerspective(cleanSubject(r.subject));
      this.say(out, r.offline ? `Sem internet não consigo pesquisar... 😅 Me ensina o que é ${s}?` : `Procurei, mas não achei nada sobre ${s}... 😅 Me ensina o que é?`, 'curious');
      this.setPending(out, { type: 'teach', subject: cleanSubject(r.subject), key: r.key, rel: 'é' });
      return this.finish(out, levelBefore);
    }

    say(out, text, mood) {
      out.parts.push(text);
      const prio = { idle: 0, confused: 1, curious: 2, happy: 3 };
      if (mood && prio[mood] >= prio[out.mood]) out.mood = mood;
    }

    setPending(out, p) {
      this.state.pending = p;
      out.asked = true;
    }

    handleSentence(raw, out) {
      const isQ = /\?\s*$/.test(raw) || QSTART_RE.test(raw);
      const core = raw.replace(/[\s?!.;…]+$/u, '').replace(/^[\s,.;:!]+/u, '').trim();
      if (!core) return;

      if (this.state.pending && this.handlePending(core, isQ, out)) return;
      if (this.smalltalk(core, out)) return;
      if (this.correction(core, out)) return;
      if (this.forget(core, out)) return;
      if (this.mathAndTime(core, out)) return;
      if (isQ) return this.question(core, out);
      const facts = this.parseStatement(core);
      if (facts) return this.learnAll(facts, out, {});
      this.fallback(core, out);
    }

    // ---- extração de fatos -----------------------------------------------------
    /** devolve lista de fatos {subject,key,rel,value,plural} ou null */
    parseStatement(core) {
      let m;
      const c = core.replace(/\s+/g, ' ').trim();

      if ((m = c.match(/^(?:eu\s+)?me\s+chamo\s+(.+)$/iu))) {
        return this.mk('meu nome', 'user:nome', 'é', m[1]);
      }
      if ((m = c.match(/^(?:eu\s+)?(n[aã]o\s+)?(?:gosto|amo|adoro|curto)\s+(?:muito\s+|demais\s+|mesmo\s+)?(.+)$/iu))) {
        const neg = !!m[1];
        const vals = splitList(cleanValue(m[2])).map((v) => (/^(de|do|da|dos|das)\s/iu.test(v) ? v : 'de ' + v));
        return this.mkList('eu', neg ? 'user:naogosta' : 'user:gosta', neg ? 'não gosta' : 'gosta', vals);
      }
      if ((m = c.match(/^(?:eu\s+)?moro\s+(.+)$/iu))) {
        return this.mk('eu', 'user:mora', 'mora', m[1]);
      }
      if ((m = c.match(/^(?:eu\s+)?tenho\s+(\d+\s+anos?.*)$/iu))) {
        return this.mk('eu', 'user:idade', 'tem', m[1]);
      }
      if ((m = c.match(/^(?:eu\s+)?tenho\s+(.+)$/iu))) {
        return this.mkList('eu', 'user:tem', 'tem', splitList(cleanValue(m[1])));
      }
      if ((m = c.match(/^(?:eu\s+)?trabalho\s+(.+)$/iu))) {
        return this.mk('eu', 'user:trabalha', 'trabalha', m[1]);
      }
      if ((m = c.match(/^(?:eu\s+)?sou\s+(.+)$/iu))) {
        const v = cleanValue(m[1]);
        const name = v.match(/^(?:(?:a|o)\s+)?(\p{Lu}[\p{L}'-]*(?:\s+\p{Lu}[\p{L}'-]*)?)$/u);
        if (name) return this.mk('meu nome', 'user:nome', 'é', name[1]);
        return this.mkList('eu', 'user:sou', 'é', splitList(v));
      }

      if ((m = c.match(STATEMENT_RE))) {
        let subject = m[1].trim();
        const verb = VERBS[m[2].toLowerCase().replace(/\s+/g, ' ')] || { rel: 'é', plural: false };
        let rel = verb.rel;
        let neg = false;
        const nm = subject.match(/^(.+?)\s+n[aã]o$/iu);
        if (nm) {
          subject = nm[1];
          neg = true;
        }
        subject = subject.replace(/\s+tamb[eé]m$/iu, '').replace(/^(?:e|mas|ent[aã]o|olha|sabia que)\s+/iu, '').trim();
        if (/^(ele|ela|eles|elas|isso|isto|esse|essa|aquilo)$/iu.test(subject)) {
          if (!this.state.lastSubject) return null;
          subject = this.state.lastSubject.subject;
        }
        if (!this.validSubject(subject)) return null;
        const key = subjectKey(subject);
        if (!key) return null;
        if (neg) rel = 'não ' + rel;
        const value = cleanValue(m[3]);
        if (!value) return null;
        const vals = rel === 'é' && wordCount(value) > 8 ? [value] : ['tem', 'come', 'gosta', 'é'].includes(rel) ? splitList(value) : [value];
        return this.mkList(subject, key, rel, vals, verb.plural);
      }

      // ações sem complemento: "o gato mia", "os pássaros voam", "o peixe não anda"
      if ((m = c.match(/^(.{1,40}?)\s+(n[aã]o\s+)?(\p{L}{2,}(?:a|e|am|em|ia|iam))$/iu))) {
        const verbWord = m[3];
        let subject = m[1].trim().replace(/\s+tamb[eé]m$/iu, '');
        if (/(osa|oso|inha|inho|ela|ita|ada|ida)$/iu.test(verbWord) && !/^nada$/iu.test(verbWord)) return null;
        if (/^(eu|voc[eê]|vc|tu|n[oó]s|que|isso)$/iu.test(subject)) return null;
        if (/^(ele|ela|eles|elas|isso|isto)$/iu.test(subject)) {
          if (!this.state.lastSubject) return null;
          subject = this.state.lastSubject.subject;
        }
        if (!this.validSubject(subject) || wordCount(subject) > 4) return null;
        const key = subjectKey(subject);
        if (!key || key === 'koa:self') return null;
        return this.mk(subject, key, m[2] ? 'não ação' : 'ação', verbWord, /m$/i.test(verbWord));
      }
      return null;
    }

    // ---- raciocínio: dedução e busca reversa ---------------------------------
    keySet() {
      return new Set(this.state.facts.map((f) => f.key));
    }

    /** chaves que um valor pode representar: "um animal fofo" -> ["animal fofo", "animal"] */
    valueKeys(v) {
      const k = keyOf(cleanSubject(v));
      if (!k) return [];
      const first = k.split(' ')[0];
      return k === first ? [k] : [k, first];
    }

    /** categorias de um assunto (gato é um animal -> animal), até 3 níveis */
    categoriesOf(key, depth = 3, seen = new Set()) {
      if (depth <= 0 || seen.has(key)) return [];
      seen.add(key);
      const keys = this.keySet();
      const out = [];
      for (const f of this.state.facts) {
        if (f.key !== key || f.rel !== 'é') continue;
        for (const ck of this.valueKeys(f.value)) {
          if (!keys.has(ck) || seen.has(ck)) continue;
          out.push({ key: ck, via: f });
          out.push(...this.categoriesOf(ck, depth - 1, seen));
        }
      }
      return out;
    }

    /** o que um assunto "herda" das categorias e ninguém ensinou diretamente */
    inherited(key, rels) {
      const own = this.findByKey(key);
      const out = [];
      for (const c of this.categoriesOf(key)) {
        for (const f of this.state.facts) {
          if (f.key !== c.key || f.rel === 'nota' || namespace(f.key)) continue;
          if (rels && !rels.includes(f.rel)) continue;
          if (own.some((o) => o.rel === f.rel && this.sameValue(o.value, f.value))) continue;
          if (f.rel === 'é' && this.valueKeys(f.value).includes(key)) continue;
          if (out.some((o) => o.fact.rel === f.rel && this.sameValue(o.fact.value, f.value))) continue;
          out.push({ fact: f, cat: c });
        }
      }
      return out;
    }

    /** "como gato é um animal, e animal respira, então gato respira" */
    deductionText(subject, inh, plural) {
      const via = inh.cat.via;
      return {
        because: `${phrase(via.subject, 'é', [via.value], via.plural)} e ${phrase(inh.fact.subject, inh.fact.rel, [inh.fact.value], inh.fact.plural)}`,
        result: phrase(subject, inh.fact.rel, [inh.fact.value], plural),
      };
    }

    /** tudo o que o Koa conseguiu deduzir sozinho */
    deductions(limit = 60) {
      const out = [];
      const seen = new Set();
      for (const f of this.state.facts) {
        if (namespace(f.key) || seen.has(f.key)) continue;
        seen.add(f.key);
        for (const inh of this.inherited(f.key)) {
          const t = this.deductionText(f.subject, inh, f.plural);
          out.push({ id: `${f.key}|${inh.fact.rel}|${normalize(inh.fact.value)}`, key: f.key, catKey: inh.cat.key, text: cap(t.result) + '.', because: t.because, result: t.result });
          if (out.length >= limit) return out;
        }
      }
      return out;
    }

    /** fatos cujo VALOR fala de algo: "o que é azul?" -> "o céu é azul" */
    reverseLookup(valueRaw, rels) {
      const toks = keyOf(cleanSubject(valueRaw)).split(' ').filter(Boolean);
      if (!toks.length) return [];
      return this.state.facts.filter((f) => {
        if (f.rel === 'nota' || (rels && !rels.includes(f.rel))) return false;
        const vt = keyOf(f.value).split(' ');
        return toks.every((t) => vt.includes(t));
      });
    }

    answerReverse(rel, valueRaw, out) {
      const value = cleanSubject(valueRaw);
      const hits = this.reverseLookup(value, [rel]);
      if (hits.length) {
        this.say(out, `${this.compose(hits)} 😊`, 'happy');
        out.answered = true;
        return;
      }
      const verb = rel === 'ação' ? swapPerspective(value) : `${REL_SING[rel] || rel} ${swapPerspective(value)}`;
      this.say(out, `Hmm, não sei quem ${verb}... 🤔 Me conta?`, 'curious');
      this.setPending(out, { type: 'teach-subject', rel, value: rel === 'ação' ? value : value });
    }

    // ---- gosto e humor -------------------------------------------------------
    /** opinião do Koa sobre um assunto: score 1 (gosta), 0 (tanto faz), -1 (não gosta) */
    opinion(key) {
      const k = String(key).replace(/^user:/, '');
      const toks = k.split(' ');
      if (KOA_LIKES.some((w) => toks.includes(singular(w)) || toks.includes(w))) return { score: 1, reason: 'innate' };
      if (KOA_DISLIKES.some((w) => toks.includes(singular(w)) || toks.includes(w))) return { score: -1, reason: 'innate' };
      let s = 0;
      let fact = null;
      for (const f of this.findByKey(key)) {
        for (const w of normalize(f.value).split(' ')) {
          if (POS_WORDS.has(w)) { s++; fact = fact || f; }
          if (NEG_WORDS.has(w)) { s--; fact = fact || f; }
        }
      }
      if (s) return { score: Math.sign(s), reason: 'fact', fact };
      if (this.findByKey('user:gosta').some((f) => keyOf(f.value).split(' ').some((t) => toks.includes(t)))) return { score: 1, reason: 'user' };
      const h = hashStr('gosto:' + k);
      return { score: h < 0.6 ? 1 : h < 0.85 ? 0 : -1, reason: 'taste' };
    }

    opinionText(subjectRaw) {
      const subject = cleanSubject(String(subjectRaw).replace(/^(?:de|do|da|dos|das)\s+/iu, ''));
      const key = subjectKey(subject);
      const s = swapPerspective(subject);
      const known = this.findByKey(key).length > 0;
      const op = this.opinion(key);
      let t;
      if (op.reason === 'innate') t = op.score > 0 ? `Eu AMO ${s}! 🌿 Coala que é coala adora ${s}.` : `Ai, não gosto ${deX(s)}... me dá medo. 😣`;
      else if (op.reason === 'fact') t = op.score > 0 ? `Gosto sim! ${cap(phrase(op.fact.subject, op.fact.rel, [op.fact.value], op.fact.plural))}, né? 💚` : `Hmm, não muito... ${cap(phrase(op.fact.subject, op.fact.rel, [op.fact.value], op.fact.plural))}. 😕`;
      else if (op.reason === 'user') t = `Gosto! Você gosta, então eu também quero gostar! 🥰`;
      else t = op.score > 0 ? `Acho que gosto ${deX(s)}! Não sei explicar, só gosto. 😊` : op.score === 0 ? `Sei lá... ${s} é ok. Nem gosto nem desgosto. 🤷` : `Hmm, acho que não curto muito ${s}... mas posso mudar de ideia! 😅`;
      return { text: t, known, key, subject, score: op.score };
    }

    /** humor do Koa: depende da hora e do "humor do dia" */
    koaMood() {
      const d = new Date(this.now());
      const h = d.getHours();
      const daily = DAILY_MOODS[Math.floor(hashStr('dia:' + Math.floor(this.now() / 86400000)) * DAILY_MOODS.length)];
      if (h < 6 || h >= 23) return { key: 'sonolento', daily };
      if (h >= 11 && h < 14) return { key: 'faminto', daily };
      return { key: daily, daily };
    }

    howAreYou() {
      return {
        sonolento: 'Tô com soninho... *boceja* 😴 Mas pra você eu fico acordado! E você?',
        faminto: 'Tô com uma fominha de eucalipto! 🌿 E você, já comeu?',
        alegre: 'Tô feliz da vida hoje! ☀️ E você?',
        brincalhão: 'Tô brincalhão hoje! Quer brincar de me ensinar coisas? 😜',
        pensativo: 'Tô pensativo... fiquei pensando nas coisas que você me ensinou. 💭 E você?',
        carinhoso: 'Tô carinhoso hoje! Me dá um abraço? 🤗 E você, como está?',
        animado: 'Tô super animado! 🤩 E você?',
      }[this.koaMood().key];
    }

    // ---- contas, hora e data -------------------------------------------------
    mathAndTime(core, out) {
      const c = core.trim();
      const d = new Date(this.now());
      if (/^(?:que\s+horas?\s+(?:s[aã]o|[eé])|me\s+diz\s+as\s+horas|sabe\s+que\s+horas\s+s[aã]o)/iu.test(c)) {
        this.say(out, `Agora são ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}! ⏰`, 'idle');
        out.answered = true;
        return true;
      }
      if (/^(?:que\s+dia\s+(?:[eé]\s+)?hoje|hoje\s+[eé]\s+que\s+dia|qual\s+(?:[eé]\s+)?a\s+data\s+(?:de\s+)?hoje)/iu.test(c)) {
        const txt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
        this.say(out, `Hoje é ${txt}! 📅`, 'idle');
        out.answered = true;
        return true;
      }
      if (/^(?:o\s*qu[eê]|oq)\s+(?:voc[eê]|vc)\s+aprendeu\s+hoje/iu.test(c)) {
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const today = this.state.facts.filter((f) => f.createdAt >= start);
        this.say(out, today.length ? `Hoje eu aprendi ${today.length} ${today.length === 1 ? 'coisa' : 'coisas'}! ${today.slice(-4).map((f) => this.describe(f)).join(' ')} 🧠` : 'Hoje ainda não aprendi nada... 🥺 Me ensina?', today.length ? 'happy' : 'curious');
        out.answered = true;
        return true;
      }
      let e = c
        .replace(/^(?:quanto\s+(?:[eé]|eh|d[aá]|fica)\s+|calcul[ae]\s+|faz\s+a\s+conta\s+(?:de\s+)?)/iu, '')
        .replace(/\bmais\b/giu, '+').replace(/\bmenos\b/giu, '-').replace(/\bvezes\b/giu, '*')
        .replace(/dividido\s+por/giu, '/').replace(/[x×]/giu, '*').replace(/÷/g, '/').replace(/,/g, '.');
      if (/^[\d\s+\-*/().]+$/.test(e) && /\d\s*[+\-*/]\s*[\d(-]/.test(e)) {
        let v;
        try {
          v = calc(e);
        } catch (err) {
          return false;
        }
        if (!Number.isFinite(v)) {
          this.say(out, 'Dividir por zero? Nem coala consegue! 😵', 'confused');
        } else {
          const r = v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
          this.say(out, this.pick([`Contei nos dedinhos: ${r}! 🐨`, `Hmm... ${r}! Acertei? 🤓`, `Essa eu sei! Dá ${r}. ✨`]), 'happy');
        }
        out.answered = true;
        return true;
      }
      return false;
    }

    validSubject(s) {
      if (!s || s.length > MAX_SUBJECT || wordCount(s) > 6) return false;
      if (QSTART_RE.test(s)) return false;
      if (/(?:^|\s)(?:que|quando|onde|porque|se)(?:\s|$)/iu.test(s)) return false;
      if (!/[\p{L}\p{N}]/u.test(s)) return false;
      return true;
    }

    mk(subject, key, rel, value, plural) {
      const v = cleanValue(value);
      if (!v) return null;
      return [{ subject, key, rel, value: v, plural: !!plural }];
    }

    mkList(subject, key, rel, values, plural) {
      const list = values.map(cleanValue).filter(Boolean).map((v) => ({ subject, key, rel, value: v, plural: !!plural }));
      return list.length ? list : null;
    }

    // ---- memória ---------------------------------------------------------------
    sameValue(a, b) {
      const x = normalize(a);
      const y = normalize(b);
      if (x === y) return true;
      return x.length > 4 && y.length > 4 && similarity(x, y) >= 0.9;
    }

    /** guarda um fato. status: new | dup | replaced */
    learn(f, opts = {}) {
      const value = cleanValue(f.value);
      if (!value || !f.key) return null;
      const facts = this.state.facts;
      const same = facts.filter((x) => x.key === f.key && x.rel === f.rel);
      const dup = same.find((x) => this.sameValue(x.value, value));
      const now = this.now();
      this.state.lastSubject = { key: f.key, subject: (same[0] && same[0].subject) || f.subject, rel: f.rel };

      if (dup && !opts.target) return { status: 'dup', fact: dup };

      let target = opts.target || null;
      if (!target && same.length && (opts.correction || isSingleValued(f.key, f.rel))) {
        target = same.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
      }
      if (target) {
        const old = target.value;
        if (this.sameValue(old, value)) return { status: 'dup', fact: target };
        target.value = value;
        target.updatedAt = now;
        // remove duplicatas que a correção possa ter criado
        this.state.facts = facts.filter((x) => x === target || !(x.key === target.key && x.rel === target.rel && this.sameValue(x.value, value)));
        return { status: 'replaced', fact: target, old };
      }

      // se havia o fato negativo oposto ("gato não é verde"), remove
      const opposite = f.rel.startsWith('não ') ? f.rel.slice(4) : 'não ' + f.rel;
      this.state.facts = facts.filter((x) => !(x.key === f.key && x.rel === opposite && this.sameValue(x.value, value)));

      const fact = {
        id: this.newId(),
        subject: (same[0] && same[0].subject) || cleanValue(f.subject).slice(0, MAX_SUBJECT),
        key: f.key,
        rel: f.rel,
        value,
        plural: !!f.plural,
        createdAt: now,
        updatedAt: now,
        uses: 0,
      };
      if (f.source) fact.source = f.source; // 'wiki' = pesquisou sozinho
      this.state.facts.push(fact);
      return { status: 'new', fact };
    }

    learnAll(facts, out, opts) {
      const results = facts.map((f) => this.learn(f, opts)).filter(Boolean);
      if (!results.length) return this.fallback('', out);
      const news = results.filter((r) => r.status === 'new');
      const reps = results.filter((r) => r.status === 'replaced');
      const dups = results.filter((r) => r.status === 'dup');
      const first = (news[0] || reps[0] || dups[0]).fact;
      const subj = first.subject;
      const pl = first.plural;
      const list = (rs) => phrase(subj, rs[0].fact.rel, rs.map((r) => r.fact.value), pl);

      if (news.length) {
        out.learned += news.length;
        const f = news[0].fact;
        if (f.key === 'user:nome') {
          this.say(out, `Prazer em te conhecer, ${f.value}! 💚 Vou guardar seu nome no meu coraçãozinho.`, 'happy');
        } else if (f.key === 'koa:self') {
          this.say(out, `Eu ${verbFor(f.rel, 'eu')} ${joinPt(news.map((r) => swapPerspective(r.fact.value)))}? Own, obrigado! 🥰 Vou lembrar disso.`, 'happy');
        } else if (f.rel === 'nota') {
          this.say(out, `Anotado! ${cap(list(news))}. 📝`, 'happy');
        } else {
          const p = list(news);
          this.say(out, this.pick([
            `Oba! Aprendi que ${p}! 🌿`,
            `Anotado! ${cap(p)}. 📝`,
            `Que legal! Agora eu sei que ${p}.`,
            `Hmm... ${p}. Vou guardar isso no meu cerebrinho! 🧠`,
            `Uau! Eu não sabia que ${p}! ✨`,
          ]), 'happy');
        }
      }
      if (reps.length) {
        out.changed += reps.length;
        const r = reps[0];
        const nowP = phrase(r.fact.subject, r.fact.rel, [r.fact.value], r.fact.plural);
        if (opts.correction) {
          this.say(out, `Ah, entendi errado! Obrigado por me corrigir. 🙏 Agora sei que ${nowP}.`, 'happy');
        } else {
          const oldP = phrase(r.fact.subject, r.fact.rel, [r.old], r.fact.plural);
          this.say(out, `Hmm, antes você tinha me dito que ${oldP}. Atualizei: ${nowP}! 🔄`, 'happy');
        }
      }
      if (dups.length && !news.length && !reps.length) {
        this.say(out, this.pick([
          `Eu já sabia disso! ${cap(list(dups))}. 😊`,
          `Isso eu já aprendi: ${list(dups)}! 😄`,
        ]), 'happy');
        out.answered = true;
      }
    }

    findByKey(key, rels) {
      return this.state.facts.filter((f) => f.key === key && (!rels || rels.includes(f.rel)));
    }

    /** melhor chave parecida (busca aproximada) */
    fuzzyKey(key) {
      const ns = namespace(key);
      let best = null;
      let bestScore = 0;
      const seen = new Set();
      for (const f of this.state.facts) {
        if (seen.has(f.key) || namespace(f.key) !== ns) continue;
        seen.add(f.key);
        const a = ns ? key.slice(ns.length + 1) : key;
        const b = ns ? f.key.slice(ns.length + 1) : f.key;
        const s = keyMatchScore(a, b);
        if (s > bestScore) {
          bestScore = s;
          best = f.key;
        }
      }
      return best ? { key: best, score: bestScore } : null;
    }

    compose(facts) {
      const byKey = new Map();
      for (const f of facts) {
        if (!byKey.has(f.key)) byKey.set(f.key, []);
        byKey.get(f.key).push(f);
      }
      const sentences = [];
      for (const group of byKey.values()) {
        const subj = group[0].subject;
        const rels = [...new Set(group.map((f) => f.rel))].sort((a, b) => {
          const ia = REL_ORDER.indexOf(a.replace(/^não /, ''));
          const ib = REL_ORDER.indexOf(b.replace(/^não /, ''));
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        for (const rel of rels) {
          const fs = group.filter((f) => f.rel === rel);
          sentences.push(sentence(subj, rel, fs.map((f) => f.value), fs[0].plural));
        }
      }
      for (const f of facts) f.uses = (f.uses || 0) + 1;
      return sentences.join(' ');
    }

    // ---- perguntas -------------------------------------------------------------
    question(core, out) {
      const c = core.replace(/\s+/g, ' ').trim();
      let m;

      if (/^(?:(?:quem|o\s*qu[eê])\s+(?:é|e|eh|és)\s+(?:voc[eê]|vc|tu|o\s+koa|koa)|qual\s+(?:é\s+|e\s+)?(?:o\s+)?seu\s+nome|como\s+(?:voc[eê]|vc)\s+se\s+chama|(?:voc[eê]|vc)\s+(?:é|e)\s+quem)$/iu.test(c)) {
        return this.aboutKoa(out);
      }
      if (/(?:o\s*qu[eê]|quanto|quantas\s+coisas)\s+(?:voc[eê]|vc)\s+(?:j[aá]\s+)?(?:sabe|aprendeu)(?:\s+at[eé]\s+agora)?$/iu.test(c)) {
        return this.summary(out);
      }
      if (/sobre\s+(?:mim|eu)$/iu.test(c)) return this.aboutUser(out);
      if (/^(?:qual\s+(?:é\s+|e\s+)?(?:o\s+)?meu\s+nome|como\s+(?:é\s+que\s+)?eu\s+me\s+chamo|quem\s+(?:sou|é)\s+eu|(?:voc[eê]|vc)\s+sabe\s+(?:o\s+)?meu\s+nome|(?:voc[eê]|vc)\s+sabe\s+quem\s+(?:eu\s+sou|sou\s+eu)|(?:voc[eê]|vc)\s+lembra\s+(?:do\s+)?meu\s+nome)$/iu.test(c)) {
        return this.answerUser(['user:nome', 'user:sou'], out);
      }
      if (/^(?:do\s+qu[eê]|o\s*qu[eê]|oq|de\s+qu[eê])\s+eu\s+n[aã]o\s+gosto/iu.test(c)) return this.answerUser(['user:naogosta'], out);
      if (/^(?:do\s+qu[eê]|o\s*qu[eê]|oq|de\s+qu[eê])\s+eu\s+(?:mais\s+)?(?:gosto|amo|adoro|curto)/iu.test(c)) return this.answerUser(['user:gosta'], out);
      if (/^onde\s+(?:é\s+que\s+)?eu\s+moro/iu.test(c)) return this.answerUser(['user:mora'], out);
      if (/^quant[oa]s\s+anos\s+eu\s+tenho|^qual\s+(?:é\s+)?(?:a\s+)?minha\s+idade/iu.test(c)) return this.answerUser(['user:idade'], out);
      if (/^(?:o\s*qu[eê]|oq)\s+eu\s+tenho/iu.test(c)) return this.answerUser(['user:tem'], out);
      if (/^(?:com\s+o\s*qu[eê]|onde|em\s+qu[eê])\s+eu\s+trabalho/iu.test(c)) return this.answerUser(['user:trabalha'], out);

      // gostos do Koa
      if ((m = c.match(/^(?:(?:e\s+)?(?:voc[eê]|vc|tu)\s+)gosta\s+(?:muito\s+)?((?:de|do|da|dos|das)\s+.+)$/iu))) {
        const op = this.opinionText(m[1]);
        this.say(out, op.text, op.score > 0 ? 'happy' : op.score < 0 ? 'confused' : 'idle');
        out.answered = true;
        if (!op.known && op.key && !/^user:|^koa:/.test(op.key) && this.opinion(op.key).reason === 'taste') {
          this.say(out, `Mas me conta: o que é ${swapPerspective(op.subject)}?`, 'curious');
          this.setPending(out, { type: 'teach', subject: op.subject, key: op.key, rel: 'é' });
        }
        return;
      }
      if ((m = c.match(/^(?:o\s*qu[eê]|oq)\s+(?:voc[eê]|vc)\s+acha\s+(?:de|do|da|dos|das|sobre)\s+(.+)$/iu))) {
        const op = this.opinionText(m[1]);
        this.say(out, op.text, op.score > 0 ? 'happy' : 'idle');
        out.answered = true;
        return;
      }
      if (/^(?:do\s+qu[eê]|o\s*qu[eê]|oq|de\s+qu[eê])\s+(?:voc[eê]|vc)\s+(?:mais\s+)?gosta/iu.test(c)) {
        const liked = [...new Set(this.state.facts.filter((f) => !namespace(f.key)).map((f) => f.key))]
          .filter((k) => this.opinion(k).score > 0)
          .slice(0, 4)
          .map((k) => deX(swapPerspective(this.findByKey(k)[0].subject)));
        this.say(out, `Eu gosto ${joinPt(['de eucalipto', 'de soneca', 'de abraço', ...liked])}! 🌿 E de conversar com você, claro! 💚`, 'happy');
        out.answered = true;
        return;
      }
      if (/^(?:como\s+(?:voc[eê]|vc)\s+(?:est[aá]|t[aá])|(?:voc[eê]|vc)\s+(?:est[aá]|t[aá])\s+bem|qual\s+(?:[eé]\s+)?(?:o\s+)?seu\s+humor)/iu.test(c)) {
        this.say(out, this.howAreYou(), 'happy');
        return;
      }

      // busca reversa: "quem tem bigode?", "quem mia?"
      if ((m = c.match(/^(?:quem|o\s*qu[eê]|que|qual|quais)\s+(?:coisa\s+|bicho\s+|animal\s+)?(tem|têm|come|comem|mora|moram|vive|vivem|gosta|gostam|pode|podem|faz|fazem|usa|usam|bebe|bebem|precisa|precisam|ama|amam|adora|adoram)\s+(.+)$/iu))) {
        const v = VERBS[m[1].toLowerCase()];
        if (v) return this.answerReverse(v.rel, m[2], out);
      }
      if ((m = c.match(/^quem\s+(\p{L}{2,}(?:a|e|am|em|ia|iam))$/iu)) && !/^(sabe|pode|gosta)$/iu.test(m[1])) {
        return this.answerReverse('ação', m[1], out);
      }

      for (const fr of FRAMES) {
        if ((m = c.match(fr.re))) {
          const subject = cleanSubject(m[1]);
          if (subject && this.validSubject(subject)) {
            return this.answerAbout(subject, fr.rels, out, /^(?:.*\s)?quem(?:\s|$)/iu.test(c));
          }
        }
      }

      // pergunta de sim/não: "gato é um animal?"
      const st = this.parseStatement(c);
      if (st) return this.yesNo(st, out);

      // pergunta que não entendi, mas fala de algo que conheço: conta o que sabe e pede a resposta
      const toks = new Set(keyOf(c).split(' '));
      let best = null;
      for (const f of this.state.facts) {
        if (namespace(f.key)) continue;
        if (f.key.split(' ').every((t) => toks.has(t)) && (!best || f.key.length > best.key.length)) best = f;
      }
      if (best) {
        this.say(out, `Hmm, isso eu não sei... Mas o que eu sei é: ${this.compose(this.findByKey(best.key))} Me conta a resposta? 🤔`, 'curious');
        const subjRe = new RegExp('^(?:(?:o|a|os|as)\\s+)?' + best.subject.replace(/^(?:o|a|os|as)\s+/iu, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'iu');
        const q = c.replace(subjRe, '');
        this.setPending(out, { type: 'teach', subject: best.subject, key: best.key, rel: 'nota', prefix: (q !== c ? q : c) + '? ' });
        return;
      }

      this.say(out, this.pick([
        'Hmm... essa eu não sei responder ainda. 🤔 Me ensina alguma coisa sobre isso?',
        'Ih, não entendi a pergunta... 😅 Tenta perguntar tipo "o que é um gato?"',
      ]), 'confused');
    }

    answerAbout(subject, rels, out, quem) {
      let key = subjectKey(subject);
      if (!key) return this.fallback(subject, out);
      if (key === 'koa:self') return this.aboutKoa(out);
      const mainRel = (rels && rels[0]) || 'é';
      // perguntaram sobre coalas: ele mesmo é um!
      if (/^(coala|koala)$/.test(key) && !out.koalaSelf) {
        out.koalaSelf = true;
        this.say(out, 'Coala? Eu sou um coala! 🐨💚', 'happy');
        if (!this.findByKey(key).length && !this.findByKey(key === 'coala' ? 'koala' : 'coala').length) {
          if (this.researchable('coala', 'é')) {
            this.say(out, 'Mas quero saber mais sobre a minha espécie... vou pesquisar! 🔎', 'curious');
            out.research = { subject: 'coala', key: 'coala', rel: 'é' };
          } else {
            this.say(out, 'Sei que adoro eucalipto e soneca! Mas me conta mais sobre os coalas?', 'curious');
            this.setPending(out, { type: 'teach', subject: 'coala', key: 'coala', rel: 'é' });
          }
          return;
        }
        key = key === 'koala' && this.findByKey('coala').length ? 'coala' : key;
        out.answered = true;
        return this.say(out, this.compose(this.findByKey(key)), 'happy');
      }
      const ask = (ASK_TEXT[mainRel] || ASK_TEXT['é'])(swapPerspective(subject), quem);
      const all = this.findByKey(key);
      const hits = rels ? all.filter((f) => rels.includes(f.rel)) : all;

      const inh = this.inherited(key, rels);
      const subjOf = (all[0] && all[0].subject) || subject;
      const plOf = !!(all[0] && all[0].plural);
      if (hits.length) {
        this.state.lastSubject = { key, subject: hits[0].subject, rel: hits[0].rel };
        let t = this.compose(hits);
        if (inh.length) {
          const extra = inh.slice(0, 2).map((i) => predicate(i.fact.rel, swapPerspective(subjOf), [swapPerspective(i.fact.value)], plOf));
          t += ` E pensando aqui: como ${phrase(inh[0].cat.via.subject, 'é', [inh[0].cat.via.value])}, acho que também ${joinPt(extra)}. 🤔`;
        }
        this.say(out, t, 'idle');
        out.answered = true;
        return;
      }
      if (inh.length) {
        const d = this.deductionText(subjOf, inh[0], plOf);
        this.state.lastSubject = { key, subject: subjOf, rel: mainRel };
        this.say(out, `Ninguém me contou, mas pensei sozinho: ${d.because}... então acho que ${d.result}! 💭`, 'happy');
        out.answered = true;
        return;
      }
      if (all.length) {
        this.state.lastSubject = { key, subject: all[0].subject, rel: mainRel };
        this.say(out, `Hmm, isso eu ainda não sei... Mas sei que: ${this.compose(all)} Me conta, ${ask}?`, 'curious');
        this.setPending(out, { type: 'teach', subject: all[0].subject, key, rel: mainRel === 'nota' ? 'é' : mainRel });
        return;
      }
      const rev = namespace(key) ? [] : this.reverseLookup(subject);
      if (rev.length) {
        const known = rev.slice(0, 3).map((f) => phrase(f.subject, f.rel, [f.value], f.plural)).join('; ');
        if (this.researchable(key, mainRel)) {
          // sabe algo relacionado, mas ainda assim vai pesquisar o que é
          this.say(out, `Sei que ${known}... mas ${ask}? Vou pesquisar! 🔎`, 'curious');
          out.research = { subject, key, rel: 'é' };
          return;
        }
        this.say(out, `Hmm, não sei ${ask} sozinho... Mas sei que ${known}! Me ensina mais sobre ${swapPerspective(subject)}? 🤔`, 'curious');
        this.setPending(out, { type: 'teach', subject, key, rel: mainRel === 'nota' ? 'é' : mainRel });
        return;
      }
      const fz = this.fuzzyKey(key);
      if (fz) {
        const facts = this.findByKey(fz.key);
        const altSubj = swapPerspective(facts[0].subject);
        this.say(out, `Hmm, não conheço "${swapPerspective(subject)}"... Você quis dizer "${altSubj}"? ${this.compose(facts)} Se for outra coisa, me ensina ${ask}! 🤔`, 'curious');
        this.setPending(out, { type: 'teach', subject, key, rel: mainRel === 'nota' ? 'é' : mainRel, alt: fz.key });
        return;
      }
      if (this.researchable(key, mainRel) && !out.research) {
        // não sabe: vai pesquisar sozinho (o app faz a busca e chama learnResearch)
        this.say(out, this.pick([
          `Hmm, não sei ${ask}... vou pesquisar! 🔎`,
          `Essa eu não sei ainda! Peraí que vou pesquisar... 🔎`,
          `${cap(ask)}? Deixa eu pesquisar rapidinho! 🔎`,
        ]), 'curious');
        out.research = { subject, key, rel: 'é' };
        return;
      }
      this.say(out, this.pick([
        `Não sei ${ask}... 🤔 Pode me ensinar?`,
        `Hmm, ${ask}? Ainda não aprendi isso! Me ensina? 🥺`,
        `Eita, essa eu não sei! ${cap(ask)}? Me conta!`,
      ]), 'curious');
      this.setPending(out, { type: 'teach', subject, key, rel: mainRel === 'nota' ? 'é' : mainRel });
    }

    answerUser(keys, out) {
      const facts = this.state.facts.filter((f) => keys.includes(f.key));
      if (facts.length) {
        this.say(out, this.compose(facts), 'idle');
        out.answered = true;
        this.state.lastSubject = { key: facts[0].key, subject: facts[0].subject, rel: facts[0].rel };
        return;
      }
      const q = USER_Q[keys[0]];
      this.say(out, `${q.none} ${q.ask} 🥺`, 'curious');
      this.setPending(out, Object.assign({ type: 'teach', key: keys[0] }, q));
    }

    aboutKoa(out) {
      const mine = this.findByKey('koa:self');
      const lv = this.levelInfo();
      let t = `Eu sou o Koa, um coalinha aprendiz! 🐨 Já aprendi ${this.count} ${this.count === 1 ? 'coisa' : 'coisas'} e meu nível é "${lv.name}".`;
      if (mine.length) t += ` E você me disse que ${phrase('você', 'é', mine.map((f) => f.value))}. 🥰`;
      this.say(out, t, 'happy');
      out.answered = true;
    }

    summary(out) {
      const n = this.count;
      if (!n) {
        this.say(out, 'Ainda não sei nada... 🥺 Me ensina alguma coisa?', 'curious');
        return;
      }
      const sample = this.state.facts.slice().sort(() => this.rng() - 0.5).slice(0, 3);
      this.say(out, `Já aprendi ${n} ${n === 1 ? 'coisa' : 'coisas'}! Por exemplo: ${sample.map((f) => this.describe(f)).join(' ')}`, 'happy');
      out.answered = true;
    }

    aboutUser(out) {
      const facts = this.state.facts.filter((f) => f.key.startsWith('user:'));
      if (facts.length) {
        this.say(out, `O que eu sei sobre você: ${this.compose(facts)} 💚`, 'happy');
        out.answered = true;
        return;
      }
      this.say(out, 'Ainda sei pouquinho sobre você... Me conta! Como você se chama? 🥺', 'curious');
      this.setPending(out, Object.assign({ type: 'teach', key: 'user:nome' }, USER_Q['user:nome']));
    }

    yesNo(st, out) {
      const f = st[0];
      const known = this.findByKey(f.key);
      const sameRel = known.filter((x) => x.rel === f.rel);
      const p = phrase(known[0] ? known[0].subject : f.subject, f.rel, [f.value], f.plural);
      if (sameRel.some((x) => this.sameValue(x.value, f.value) || normalize(x.value).includes(normalize(f.value)))) {
        this.say(out, `Sim! ${cap(p)}. 😊`, 'happy');
        out.answered = true;
        return;
      }
      const negRel = f.rel.startsWith('não ') ? f.rel.slice(4) : 'não ' + f.rel;
      if (known.some((x) => x.rel === negRel && this.sameValue(x.value, f.value))) {
        this.say(out, `Não! Você me ensinou que ${phrase(known[0].subject, negRel, [f.value], f.plural)}.`, 'idle');
        out.answered = true;
        return;
      }
      const inh = this.inherited(f.key, [f.rel]).find((i) => this.sameValue(i.fact.value, f.value) || normalize(i.fact.value).includes(normalize(f.value)));
      if (inh) {
        const d = this.deductionText(known[0] ? known[0].subject : f.subject, inh, f.plural);
        this.say(out, `Acho que sim! ${cap(d.because)}... então ${d.result}! 🤓`, 'happy');
        out.answered = true;
        return;
      }
      if (known.length) {
        this.say(out, `Hmm, não sei... O que eu sei é: ${this.compose(known)} Mas ${p}? É verdade?`, 'curious');
      } else {
        this.say(out, `Não sei... ${cap(p)}? 🤔 Se for verdade, me confirma que eu aprendo!`, 'curious');
      }
      this.setPending(out, { type: 'confirm', facts: st });
    }

    // ---- quando o Koa está esperando uma resposta ---------------------------
    handlePending(core, isQ, out) {
      const p = this.state.pending;
      const clear = () => {
        this.state.pending = null;
      };

      if (p.type === 'confirm') {
        if (YES_RE.test(core) || /^(?:sim|é sim|isso)[\s,!]/iu.test(core)) {
          clear();
          this.learnAll(p.facts, out, {});
          return true;
        }
        if (NO_RE.test(core)) {
          clear();
          this.say(out, 'Ah, ok! Então não vou aprender isso. 👍', 'idle');
          return true;
        }
        clear();
        return false;
      }

      if (p.type === 'teach-subject') {
        // o Koa perguntou "quem mia?" e a pessoa respondeu "o gato"
        clear();
        if (isQ || CANCEL_RE.test(core) || NO_RE.test(core) || (this.parseStatement(core) && wordCount(core) > 3)) return false;
        const subject = cleanSubject(core.replace(/^(?:[eé]\s+)?/iu, ''));
        const key = subjectKey(subject);
        if (!key || !this.validSubject(subject)) return false;
        this.learnAll([{ subject, key, rel: p.rel, value: p.value, plural: false }], out, {});
        return true;
      }
      if (CANCEL_RE.test(core)) {
        clear();
        this.say(out, this.pick(['Tudo bem! Fica pra próxima. 🍃', 'Sem problemas! Depois você me conta. 😊']), 'idle');
        return true;
      }
      if (p.alt && YES_RE.test(core)) {
        clear();
        this.say(out, 'Ah, então eu acertei! 😄', 'happy');
        return true;
      }
      if (NO_RE.test(core)) {
        if (p.alt) {
          p.alt = null;
          this.say(out, `Ah, então é outra coisa! Me conta: ${(ASK_TEXT[p.rel] || ASK_TEXT['é'])(swapPerspective(p.subject))}?`, 'curious');
          out.asked = true;
          return true;
        }
        clear();
        this.say(out, 'Tudo bem! 😊', 'idle');
        return true;
      }
      if (isQ) {
        clear();
        return false;
      }
      // a resposta é uma frase completa? deixa o fluxo normal cuidar
      if (this.parseStatement(core) && !STARTS_WITH_VERB_RE.test(core)) {
        clear();
        return false;
      }
      if (/^(?:n[aã]o\s*[,.!]|na\s+verdade|errado)/iu.test(core)) {
        clear();
        return false;
      }

      // trata como resposta à pergunta do Koa
      clear();
      let ans = core.replace(/^(?:(?:ent[aã]o|bom|olha|acho\s+que|hmm+|ah+)[\s,]+)+/iu, '').trim();
      ans = ans.replace(/^(?:ele|ela|eles|elas|isso|isto|esse|essa)\s+/iu, '');
      if (p.prefix) ans = ans.replace(/^(?:porque|por\s+qu[eê]|pq)\s+/iu, '');

      let facts = null;
      if (!p.prefix && STARTS_WITH_VERB_RE.test(ans)) {
        facts = this.parseStatement(`${p.subject} ${ans}`);
        if (facts) facts.forEach((f) => (f.key = p.key));
      }
      if (!facts) {
        let v = cleanValue(p.prefix ? ans : ans.replace(/^(?:é|eh|são|sao|se\s+chama)\s+/iu, ''));
        if (!v) {
          this.say(out, 'Hmm, não entendi... 😅', 'confused');
          return true;
        }
        if (p.age && /^\d+$/.test(v)) v += ' anos';
        let vals = p.list ? splitList(v) : [v];
        if (p.prep) vals = vals.map((x) => (/^(de|do|da|dos|das|em|no|na|nos|nas|com|para|pra)\s/iu.test(x) ? x : p.prep + ' ' + x));
        if (p.prefix) vals = [p.prefix + v];
        let rel = p.rel || 'é';
        if (rel === 'é' && wordCount(v) > 10) rel = 'nota';
        facts = vals.map((x) => ({ subject: p.subject, key: p.key, rel, value: x, plural: false }));
      }
      this.learnAll(facts, out, { correction: !!p.correction });
      return true;
    }

    // ---- correções e "esquece" ------------------------------------------------
    correction(core, out) {
      let m = core.match(/^(?:n[aã]o\s*[,.!]*\s*)?(?:na\s+verdade|na\s+real|errado|errou|corrigindo|corre[cç][aã]o|voc[eê]\s+errou)\s*[,:.!]*\s*(.*)$/iu);
      if (!m) {
        const m2 = core.match(/^n[aã]o\s*[,.!]+\s*(.+)$/iu);
        if (m2 && (/^(?:é|eh|são|sao|tem|ele|ela)\s/iu.test(m2[1]) || this.parseStatement(m2[1]))) m = m2;
      }
      if (!m) return false;
      const rest = m[1].trim();
      const last = this.state.lastSubject;

      if (!rest) {
        if (last) {
          this.say(out, `Ops! 😳 Então me fala o certo: ${(ASK_TEXT[last.rel] || ASK_TEXT['é'])(swapPerspective(last.subject))}?`, 'curious');
          this.setPending(out, { type: 'teach', subject: last.subject, key: last.key, rel: last.rel, correction: true });
        } else {
          this.say(out, 'Ops! O que foi que eu errei? Me fala o certo. 😳', 'confused');
        }
        return true;
      }

      // "gato não é preto, é branco"
      const nm = rest.match(/^(?:(.+?)\s+)?n[aã]o\s+(?:é|eh|são)\s+(.+?)\s*[,;]\s*(?:e\s+)?(?:sim\s+)?(?:é|eh|são)?\s*(?:sim\s+)?(.+)$/iu);
      if (nm) {
        const subject = nm[1] ? nm[1].trim() : last && last.subject;
        if (subject) {
          const key = subjectKey(subject);
          const target = this.findByKey(key, ['é']).find((f) => this.sameValue(f.value, nm[2]) || normalize(f.value).includes(normalize(nm[2])));
          this.learnAll([{ subject, key, rel: 'é', value: nm[3], plural: false }], out, { correction: true, target });
          return true;
        }
      }

      const facts = this.parseStatement(rest);
      if (facts && !STARTS_WITH_VERB_RE.test(rest)) {
        this.learnAll(facts, out, { correction: true });
        return true;
      }
      if (last) {
        const ans = rest.replace(/^(?:ele|ela|isso)\s+/iu, '');
        if (STARTS_WITH_VERB_RE.test(ans)) {
          const fs = this.parseStatement(`${last.subject} ${ans}`);
          if (fs) {
            fs.forEach((f) => (f.key = last.key));
            this.learnAll(fs, out, { correction: true });
            return true;
          }
        }
        const v = cleanValue(ans.replace(/^(?:é|eh|são|sao)\s+/iu, ''));
        if (v) {
          this.learnAll([{ subject: last.subject, key: last.key, rel: last.rel || 'é', value: v, plural: false }], out, { correction: true });
          return true;
        }
      }
      this.say(out, 'Hmm, não sei bem o que corrigir... 😅 Me fala a frase inteira, tipo "o céu é azul".', 'confused');
      return true;
    }

    forget(core, out) {
      const m = core.match(/^(?:esquece|esque[cç]a|apaga|apague|deleta)\s+(.+)$/iu);
      if (!m) return false;
      let what = m[1].trim();
      if (/^tudo$/iu.test(what)) {
        this.say(out, 'Pra eu esquecer tudo, use o botão "Esquecer tudo" na tela "O que o Koa sabe". 🥺', 'confused');
        return true;
      }
      const que = what.match(/^que\s+(.+)$/iu);
      if (que) {
        const st = this.parseStatement(que[1]);
        if (st) {
          const before = this.count;
          this.state.facts = this.state.facts.filter((f) => !st.some((s) => s.key === f.key && s.rel === f.rel && this.sameValue(s.value, f.value)));
          this.say(out, before > this.count ? 'Pronto, esqueci isso! 🫥' : 'Hmm, eu nem sabia disso. 🤷', 'idle');
          return true;
        }
      }
      what = what.replace(/^(?:tudo\s+)?(?:sobre|de|do|da|o\s+que\s+(?:é|eu\s+te\s+disse\s+sobre))\s+/iu, '');
      const key = subjectKey(cleanSubject(what));
      const before = this.count;
      this.state.facts = this.state.facts.filter((f) => f.key !== key);
      const n = before - this.count;
      if (this.state.lastSubject && this.state.lastSubject.key === key) this.state.lastSubject = null;
      this.say(out, n ? `Pronto, esqueci ${n === 1 ? 'o que sabia' : `as ${n} coisas que sabia`} sobre ${swapPerspective(cleanSubject(what))}. 🫥` : `Eu não sabia nada sobre ${swapPerspective(cleanSubject(what))} mesmo. 🤷`, 'idle');
      return true;
    }

    // ---- papo -----------------------------------------------------------------
    smalltalk(core, out) {
      const name = this.userName();
      const n = normalize(core);
      let m;

      if ((m = core.match(/^(o+i+e*|ol[aá]+|e\s*a[ií]+|opa+|hey|al[oô]|salve|bom\s+dia|boa\s+tarde|boa\s+noite)(?:\s*,?\s*koa)?(?=[\s,!.]|$)\s*[,!.]*\s*/iu))) {
        const rest = core.slice(m[0].length);
        const how = rest.match(/^(?:tudo\s+bem|td\s+bem|tudo\s+bom|como\s+vai|como\s+(?:voc[eê]|vc)\s+(?:est[aá]|t[aá]))(?:\s+(?:com\s+)?(?:voc[eê]|vc))?\s*[?!.,]*\s*/iu);
        const word = m[1].toLowerCase();
        const favGreet = this.favorite(this.state.style.greets, 2);
        const g = /^(bom|boa)/.test(word) ? cap(word.replace(/\s+/g, ' ')) : cap(favGreet ? favGreet.form : word);
        let t = `${g}${name ? ', ' + name : ''}! 🐨`;
        if (how) t += ' ' + this.howAreYou();
        else if (!rest) t += ' ' + this.pick(['Me ensina alguma coisa nova?', 'Que bom te ver!', 'Tava com saudade!']);
        this.say(out, t, 'happy');
        const remaining = how ? rest.slice(how[0].length) : rest;
        if (remaining.trim()) this.handleSentence(remaining, out);
        return true;
      }
      if (/^(?:tudo\s+bem|td\s+bem|tudo\s+bom|como\s+vai|como\s+(?:voc[eê]|vc)\s+(?:est[aá]|t[aá]))(?:\s+(?:com\s+)?(?:voc[eê]|vc))?$/iu.test(core)) {
        this.say(out, this.howAreYou(), 'happy');
        return true;
      }
      if (/^(?:eu\s+)?(?:te\s+amo|amo\s+(?:voc[eê]|vc|tu)|gosto\s+(?:muito\s+)?de\s+(?:voc[eê]|vc|ti))(?:\s+koa)?$/iu.test(core)) {
        this.say(out, this.pick(['Own! Eu também gosto muito de você! 🐨💚', 'Aaah, que fofo! Eu também te amo! 💚']), 'happy');
        return true;
      }
      if (/^(?:muito\s+)?(?:obrigad[oa]|brigad[oa]|valeu|vlw|obg|thanks)(?=[\s,!.]|$)/iu.test(core) && wordCount(core) <= 5) {
        this.say(out, this.pick(['De nada! 💚', 'Imagina! 😊', 'Por nada! Eu que agradeço por me ensinar! 🌿']), 'happy');
        return true;
      }
      if (/^(?:tchau+|xau+|at[eé]\s+(?:mais|logo|amanh[aã]|depois)|fui|bye|beijos?|bjs?|boa\s+noite\s+koa)(?=[\s,!.]|$)/iu.test(core) && wordCount(core) <= 5) {
        this.say(out, `Tchau${name ? ', ' + name : ''}! Volta logo pra me ensinar mais coisas! 🌿💤`, 'happy');
        return true;
      }
      if (/^(?:k{2,}|(?:h?a){2,}h?|(?:he){2,}|(?:rs)+|(?:hu?e){2,}|lol|kkk+)+$/iu.test(n.replace(/\s/g, ''))) {
        const laugh = this.favorite(this.state.style.laughs, 1);
        this.say(out, `${laugh ? laugh.form : 'hehe'} 😄`, 'happy');
        return true;
      }
      if ((m = core.match(/^(?:eu\s+)?(?:t[oô]|estou|to|tou|t[ôo]\s+me\s+sentindo|estou\s+me\s+sentindo)\s+(?:muito\s+|super\s+|bem\s+)?(\p{L}+)/iu))) {
        const w = normalize(m[1]);
        if (/^(bem|otim|feliz|alegre|animad|content|tranquil|de boa)/.test(w)) {
          this.say(out, 'Que bom! Fico feliz junto! 💚', 'happy');
          return true;
        }
        if (/^(triste|mal|cansad|chatead|doente|ansios|preocupad|estressad|sozinh|desanimad)/.test(w)) {
          this.say(out, 'Ah, que pena... 😢 Quer um abraço de coala? Eu sou ótimo em abraços! 🐨🤗', 'curious');
          return true;
        }
      }
      if (/^(?:ajuda|help|socorro|como\s+(?:eu\s+)?(?:te\s+)?ensino|como\s+funciona|o\s+que\s+eu\s+fa[cç]o)/iu.test(core)) {
        this.say(out, 'Eu aprendo com você! Me conte coisas como "o céu é azul", "meu nome é Ana" ou "eu gosto de chocolate". Depois me pergunte: "o que é o céu?", "qual é o meu nome?". Se eu errar, diga "não, na verdade..." 🐨', 'idle');
        return true;
      }
      if (/^(?:que\s+(?:legal|fofo|fofa|lindo|linda|bom|massa|top|demais|incr[ií]vel|bonitinho|engra[cç]ado|chique)|amei|adorei|uau|nossa|eita|caramba)(?:\s+\p{L}+)?$/iu.test(core)) {
        this.say(out, this.pick(['Né? 😄', 'Também acho! 🐨', 'Hehe, né?! ✨']), 'happy');
        return true;
      }
      if (YES_RE.test(core) || NO_RE.test(core) || /^(?:ok+|okay|blz|beleza|t[aá]|certo|entendi|legal|show|top|massa|hum+|hmm+|ah+)$/iu.test(core)) {
        this.say(out, this.pick(['😊 Me conta mais alguma coisa?', 'Hehe! O que mais você pode me ensinar? 🌿', 'Tá bom! 🐨']), 'idle');
        return true;
      }
      return false;
    }

    fallback(core, out) {
      // a frase fala de algo que o Koa já conhece? guarda como anotação sobre o assunto
      if (core && wordCount(core) >= 3 && core.length <= 200) {
        const toks = new Set(keyOf(core).split(' '));
        let best = null;
        for (const f of this.state.facts) {
          if (namespace(f.key) || f.rel === 'nota') continue;
          const kt = f.key.split(' ');
          if (kt.every((t) => toks.has(t)) && (!best || f.key.length > best.key.length)) best = f;
        }
        if (best) {
          const r = this.learn({ subject: best.subject, key: best.key, rel: 'nota', value: core, plural: best.plural });
          if (r && r.status === 'new') {
            out.learned++;
            this.say(out, `Hmm, não entendi direitinho, mas guardei isso sobre ${swapPerspective(best.subject)}: "${swapPerspective(core)}" 📝`, 'happy');
            return;
          }
        }
      }
      const fav = this.favoriteWord();
      const asked = new Set(this.state.asked);
      if (fav && !asked.has('w:' + fav.key) && this.rng() < 0.5) {
        this.state.asked.push('w:' + fav.key);
        this.say(out, `Hmm, não entendi muito bem... 😅 Mas percebi que você fala bastante "${fav.form}". O que é ${fav.form}?`, 'curious');
        this.setPending(out, { type: 'teach', subject: fav.form, key: fav.key, rel: 'é' });
        return;
      }
      this.say(out, this.pick([
        'Hmm, não entendi muito bem... 🤔 Ainda estou aprendendo! Me ensina com frases tipo "o céu é azul".',
        'Eita, essa eu não peguei... 😅 Pode falar de outro jeito? Tipo "gato é um animal".',
        'Hmm... não sei o que fazer com isso ainda. 🥺 Me ensina com "X é Y" ou me faça uma pergunta!',
      ]), 'confused');
    }

    // ---- curiosidade -----------------------------------------------------------
    curiosityCandidates() {
      const st = this.state;
      const keys = new Set(st.facts.map((f) => f.key));
      const asked = new Set(st.asked);
      const cands = [];
      for (const f of st.facts) {
        if (f.rel === 'é' && !namespace(f.key)) {
          const bare = cleanSubject(f.value);
          const vk = keyOf(bare);
          if (vk && wordCount(vk) <= 3 && !keys.has(vk) && !asked.has('v:' + vk) && !/^\d/.test(vk) && !/^(porque|que|pq|se|quando|de|do|da)\s/.test(vk) && !/[\p{Lu}]/u.test(bare[0] || '')) {
            cands.push({ id: 'v:' + vk, text: `Você me disse que ${phrase(f.subject, f.rel, [f.value], f.plural)}. Mas o que é ${swapPerspective(bare)}? 🤔`, pending: { type: 'teach', subject: bare, key: vk, rel: 'é' } });
          }
        }
        if (f.key === 'user:gosta' && !asked.has('pq:' + f.id)) {
          cands.push({ id: 'pq:' + f.id, text: `Por que você gosta ${f.value}? 🤔`, pending: { type: 'teach', subject: 'eu', key: 'user:gostapq:' + keyOf(f.value), rel: 'gosta', prefix: f.value + ' porque ' } });
        }
      }
      const subjects = [...new Set(st.facts.filter((f) => !namespace(f.key)).map((f) => f.key))];
      for (const k of subjects) {
        const fs = st.facts.filter((f) => f.key === k);
        if (fs.length <= 2 && !asked.has('m:' + k)) {
          cands.push({ id: 'm:' + k, text: `O que mais você sabe sobre ${swapPerspective(fs[0].subject)}? Me conta! 🤔`, pending: { type: 'teach', subject: fs[0].subject, key: k, rel: 'é' } });
        }
      }
      return cands;
    }

    markAsked(id) {
      const st = this.state;
      st.asked.push(id);
      if (st.asked.length > 300) st.asked = st.asked.slice(-300);
    }

    maybeCurious(out) {
      const st = this.state;
      if (st.turns - st.lastCuriosityTurn < 3 || st.facts.length < 2 || this.rng() >= 0.3) return;
      const cands = this.curiosityCandidates();
      if (!cands.length) return;
      const c = this.pick(cands);
      this.markAsked(c.id);
      st.lastCuriosityTurn = st.turns;
      this.say(out, c.text, 'curious');
      this.setPending(out, c.pending);
    }

    /** depois de aprender, o Koa liga os pontos sozinho e conta o que deduziu */
    maybeThink(out, keys) {
      const asked = new Set(this.state.asked);
      const d = this.deductions().find((x) => !asked.has('d:' + x.id) && (!keys || keys.has(x.key) || keys.has(x.catKey)));
      if (!d) return false;
      this.markAsked('d:' + d.id);
      this.say(out, this.pick([
        `Opa, pensei sozinho! 💭 Se ${d.because}, então ${d.result}! 🤯`,
        `Peraí... ${d.because}... então ${d.result}! Descobri sozinho! 🤓`,
      ]), 'happy');
      out.thought = true;
      return true;
    }

    /** às vezes o Koa dá opinião sobre o que acabou de aprender */
    maybeOpinion(out, key) {
      if (!key || namespace(key) || this.rng() >= 0.2) return;
      const f = this.findByKey(key)[0];
      if (!f) return;
      const op = this.opinion(key);
      const s = swapPerspective(f.subject);
      if (op.score > 0) this.say(out, this.pick([`E quer saber? Acho que gosto ${deX(s)}! 💚`, `${cap(s)}... gostei! 😊`]), 'happy');
      else if (op.score < 0) this.say(out, `Hmm, sei não se gosto ${deX(s)}... 😕`, 'idle');
    }

    // ---- puxar assunto sozinho -------------------------------------------------
    /**
     * O Koa fala sem ser chamado (o app chama isso quando a pessoa fica um tempo quieta).
     * @param {{activity?: {type:string, factId?:string}}} ctx
     * @returns {{text:string, mood:string}}
     */
    initiative(ctx = {}) {
      const st = this.state;
      const out = { parts: [], mood: 'idle', learned: 0, changed: 0, answered: false, asked: false };
      const name = this.userName();
      const nm = name ? ', ' + name : '';
      const asked = new Set(st.asked);
      const facts = st.facts;
      const h = new Date(this.now()).getHours();
      const dayId = Math.floor(this.now() / 86400000);
      const cands = [];
      const add = (id, w, fn) => {
        if (!asked.has(id)) cands.push({ id, w, fn });
      };

      if (!facts.length) {
        add('i:vazio:' + st.turns, 3, () => this.say(out, this.pick([`Ei${nm}... me ensina alguma coisa? Tô curioso! 🥺`, `Psiu${nm}! Minha cabecinha tá vazia... me conta uma coisa? 🐨`]), 'curious'));
      }
      const act = ctx.activity;
      if (act && act.type) {
        const f = act.factId && facts.find((x) => x.id === act.factId);
        const texts = {
          pond: 'Acabei de beber água no laguinho! 💧 Tava geladinha.',
          flower: f ? `Fui cheirar uma flor que nasceu quando você me ensinou que ${phrase(f.subject, f.rel, [f.value], f.plural)} 🌸` : 'Cheirei uma florzinha agora! 🌸 Que cheirinho bom.',
          nap: 'Tirei uma soneca rapidinha... 😴 Voltei!',
          wander: 'Dei uma voltinha pela ilha! 🏝️',
          sky: 'Tava olhando o céu... ☁️ Fiquei pensando em tanta coisa.',
          tree: 'Subi de volta no meu galho! 🌿',
        };
        if (texts[act.type]) add(`i:act:${act.type}:${act.at || this.now()}`, 4, () => this.say(out, texts[act.type], 'happy'));
      }
      const ded = this.deductions().find((x) => !asked.has('d:' + x.id));
      if (ded) {
        add('d:' + ded.id, 3, () => this.say(out, `Ei, sabe o que eu pensei sozinho? 💭 Se ${ded.because}, então ${ded.result}!`, 'happy'));
      }
      // curiosidade própria: pesquisa sozinho algo que apareceu na conversa e ele não conhece
      if (this.canResearch) {
        for (const c of this.curiosityCandidates().filter((x) => x.id.startsWith('v:')).slice(0, 3)) {
          const p = c.pending;
          if (!this.researchable(p.key, 'é')) continue;
          add('i:pesq:' + p.key, 3, () => {
            this.markAsked(c.id);
            this.say(out, this.pick([
              `Fiquei curioso sobre ${swapPerspective(p.subject)} e fui pesquisar... 🔎`,
              `Sabe aquilo de ${swapPerspective(p.subject)}? Vou pesquisar o que é! 🔎`,
            ]), 'curious');
            out.research = { subject: p.subject, key: p.key, rel: 'é' };
          });
        }
      }
      // (o que dá para pesquisar ele pesquisa em vez de perguntar)
      const askable = this.curiosityCandidates().filter((x) => !(this.canResearch && x.id.startsWith('v:') && this.researchable(x.pending.key, 'é')));
      for (const c of askable.slice(0, 6)) {
        add(c.id, 2, () => {
          this.say(out, c.text, 'curious');
          this.setPending(out, c.pending);
        });
      }
      const recall = facts.filter((f) => !namespace(f.key) && f.rel !== 'nota');
      if (recall.length) {
        const f = recall[Math.floor(this.rng() * recall.length)];
        add(`i:lembra:${f.id}:${dayId}`, 2, () => this.say(out, `Tava aqui lembrando que ${phrase(f.subject, f.rel, [f.value], f.plural)}... ${this.pick(['Que legal isso! 💚', 'Adoro saber disso!', 'Nunca vou esquecer! 🧠'])}`, 'happy'));
        const op = this.opinion(f.key);
        if (op.score > 0) add(`i:opina:${f.key}`, 1, () => this.say(out, `Sabe do que eu gosto? ${cap(deX(swapPerspective(f.subject)))}! ${op.fact ? cap(phrase(op.fact.subject, op.fact.rel, [op.fact.value], op.fact.plural)) + '! 🥰' : '😊'}`, 'happy'));
      }
      const likes = this.findByKey('user:gosta');
      if (likes.length) {
        const f = likes[Math.floor(this.rng() * likes.length)];
        add(`i:gosto:${f.id}:${dayId}`, 2, () => this.say(out, `Lembrei que você gosta ${swapPerspective(f.value)}${nm}! Hoje teve? 😋`, 'curious'));
      }
      const slot = h >= 6 && h < 10 ? 'manha' : h >= 11 && h < 14 ? 'almoco' : h >= 15 && h < 18 ? 'tarde' : h >= 21 ? 'noite' : '';
      const slotText = {
        manha: `Bom dia${nm}! ☀️ Dormiu bem?`,
        almoco: 'Já almoçou? Eu já comi meu eucalipto! 🌿',
        tarde: 'Que tal um lanchinho? 🍎 Eu tô de olho numa folhinha aqui...',
        noite: 'Tá ficando tarde... 😴 Vai dormir cedo hoje?',
      };
      if (slot) add(`i:hora:${slot}:${dayId}`, 2, () => this.say(out, slotText[slot], 'idle'));
      add(`i:humor:${dayId}`, 1, () => this.say(out, this.howAreYou().replace(/ E você.*$/, '') + ' 🐨', 'happy'));

      // sem nada aprendido, o assunto é sempre pedir para aprender
      if (!facts.length) cands.splice(0, cands.length, ...cands.filter((c) => /^i:(vazio|act):/.test(c.id)));
      if (!cands.length) return null;
      let total = cands.reduce((a, c) => a + c.w, 0);
      let r = this.rng() * total;
      let pick = cands[cands.length - 1];
      for (const c of cands) {
        r -= c.w;
        if (r <= 0) { pick = c; break; }
      }
      this.markAsked(pick.id);
      pick.fn();
      const text = this.decorate(out.parts.join(' '), out.mood);
      this.save();
      const result = { text, mood: out.asked && out.mood !== 'happy' ? 'curious' : out.mood };
      if (out.research) result.research = out.research;
      return result;
    }

    /** cumprimento ao abrir o app, lembrando de coisas e de quanto tempo faz */
    greeting() {
      const st = this.state;
      const name = this.userName();
      const nm = name ? ', ' + name : '';
      const last = st.lastSeen || 0;
      const away = last ? this.now() - last : 0;
      st.lastSeen = this.now();
      let t;
      const recent = st.facts.filter((f) => !namespace(f.key) && f.rel !== 'nota');
      const f = recent.length ? recent[Math.floor(this.rng() * recent.length)] : null;
      if (away > 2 * 86400000) {
        t = `Que saudade${nm}! 🥺 Você sumiu por ${Math.floor(away / 86400000)} dias! Senti sua falta.`;
      } else if (away > 6 * 3600000 || !last) {
        t = `Oi de novo${nm}! 🐨 Já sei ${this.count} ${this.count === 1 ? 'coisa' : 'coisas'}.`;
        if (f) t += ` Fiquei pensando que ${phrase(f.subject, f.rel, [f.value], f.plural)}... 💭`;
      } else {
        t = `Oi${nm}! Voltou rapidinho! 😄`;
      }
      if (this.koaMood().key === 'sonolento') t += ' *boceja* 😴';
      this.save();
      return t + ' Me ensina mais?';
    }

    // ---- jeito de falar --------------------------------------------------------
    bump(map, key, form) {
      const e = map[key] || { n: 0, form };
      e.n++;
      e.form = form;
      map[key] = e;
      const keys = Object.keys(map);
      if (keys.length > 300) {
        keys.sort((a, b) => map[a].n - map[b].n).slice(0, keys.length - 250).forEach((k) => delete map[k]);
      }
    }

    learnStyle(text) {
      const s = this.state.style;
      s.msgs++;
      const lower = text.toLowerCase();
      const firstRaw = (lower.match(/^[\p{L}]+/u) || [''])[0];
      const first = collapse(stripAccents(firstRaw));
      if (first) {
        if (GREET_WORDS.has(first) || /^oi+e*$/.test(first)) this.bump(s.greets, first.replace(/i+/, 'i').replace(/e+$/, 'e'), firstRaw);
        else if (INTERJECTIONS.has(first)) this.bump(s.openers, first, firstRaw);
      }
      for (const l of lower.match(LAUGH_RE) || []) this.bump(s.laughs, l[0] === 'k' ? 'k' : l.slice(0, 2), l);
      for (const e of text.match(EMOJI_RE) || []) this.bump(s.emojis, e, e);
      for (const w of normalize(text).split(' ')) {
        if (w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w) && !/^k+$/.test(w)) this.bump(s.words, singular(w), w);
      }
      s.phrases.push(text.slice(0, 120));
      if (s.phrases.length > 50) s.phrases = s.phrases.slice(-50);
    }

    favorite(map, min) {
      let best = null;
      for (const k of Object.keys(map || {})) if (!best || map[k].n > best.n) best = Object.assign({ key: k }, map[k]);
      return best && best.n >= min ? best : null;
    }

    favoriteWord() {
      const keys = new Set(this.state.facts.map((f) => f.key));
      const words = this.state.style.words;
      let best = null;
      for (const k of Object.keys(words)) {
        if (keys.has(k) || words[k].n < 3) continue;
        if (!best || words[k].n > best.n) best = Object.assign({ key: k }, words[k]);
      }
      return best;
    }

    /** usa expressões da pessoa nas respostas, aos poucos */
    decorate(text, mood) {
      if (!text) return text;
      const s = this.state.style;
      const op = this.favorite(s.openers, 2);
      if (op && (mood === 'happy' || mood === 'idle') && this.rng() < 0.3 && !normalize(text).startsWith(normalize(op.form))) {
        text = `${cap(op.form)}! ${text}`;
      }
      const laugh = this.favorite(s.laughs, 2);
      if (laugh && mood === 'happy' && this.rng() < 0.35) text += ' ' + laugh.form;
      const emo = this.favorite(s.emojis, 2);
      if (emo && this.rng() < 0.3 && !text.includes(emo.form)) text += ' ' + emo.form;
      // um toque do humor do dia
      const km = this.koaMood().key;
      if (km === 'sonolento' && this.rng() < 0.15 && !text.includes('boceja')) text = '*boceja* ' + text;
      if (km === 'carinhoso' && mood === 'happy' && this.rng() < 0.1) text += ' 🤗';
      if (km === 'brincalhão' && mood === 'happy' && this.rng() < 0.1) text += ' 😜';
      return text;
    }
  }

  return {
    Brain,
    LEVELS,
    normalize,
    keyOf,
    singular,
    subjectKey,
    levenshtein,
    similarity,
    keyMatchScore,
    swapPerspective,
    joinPt,
  };
});
