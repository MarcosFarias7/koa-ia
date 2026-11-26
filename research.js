/*
 * research.js — o Koa pesquisa sozinho na Wikipédia em português.
 *
 * Usa a API pública e gratuita da Wikipédia (sem chave). Só a palavra
 * pesquisada sai do aparelho; a conversa e a memória do Koa não.
 */
(function (root) {
  'use strict';

  const API = 'https://pt.wikipedia.org/api/rest_v1/page/summary/';
  const SEARCH = 'https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=';
  const TIMEOUT_MS = 9000;
  const cache = new Map();

  async function getJSON(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** "o ornitorrinco" -> "Ornitorrinco" */
  function toTitle(subject) {
    const s = String(subject).trim().replace(/^(o|a|os|as|um|uma|uns|umas)\s+/iu, '').replace(/[?!.]+$/, '');
    return s ? s[0].toUpperCase() + s.slice(1) : '';
  }

  /** primeira frase, sem parênteses nem notas [1] */
  function firstSentence(text) {
    const clean = String(text || '')
      .replace(/\s*\([^()]*\)/g, '')
      .replace(/\s*\[[^\]]*\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const m = clean.match(/^.{20,}?[.!?](?=\s+[A-ZÀ-Ú]|$)/u);
    return (m ? m[0] : clean).trim();
  }

  async function summary(title) {
    const j = await getJSON(API + encodeURIComponent(title.replace(/ /g, '_')) + '?redirect=true');
    if (!j || j.type === 'disambiguation' || !j.extract) return null;
    return j;
  }

  /**
   * Pesquisa um assunto.
   * @returns {Promise<{sentence:string, title:string, url:string}|null>}
   */
  async function lookup(subject) {
    const title = toTitle(subject);
    if (!title || title.length > 60) return null;
    const k = title.toLowerCase();
    if (cache.has(k)) return cache.get(k);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

    let j = await summary(title);
    if (!j) {
      // não achou a página exata: usa a busca da Wikipédia
      const s = await getJSON(SEARCH + encodeURIComponent(title));
      const hit = s && s.query && s.query.search && s.query.search[0];
      if (hit) j = await summary(hit.title);
    }
    let result = null;
    if (j) {
      const sentence = firstSentence(j.extract);
      if (sentence.length >= 15) {
        result = {
          sentence,
          title: j.title,
          url: (j.content_urls && j.content_urls.mobile && j.content_urls.mobile.page) || `https://pt.wikipedia.org/wiki/${encodeURIComponent(j.title)}`,
        };
      }
    }
    cache.set(k, result);
    return result;
  }

  root.KoaResearch = { lookup, firstSentence, toTitle };
})(typeof globalThis !== 'undefined' ? globalThis : this);
