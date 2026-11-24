/*
 * koala.svg.js — o desenho do Koa (SVG inline, original) e seus estados.
 * Estados: idle (parado), thinking (pensando), happy (feliz),
 *          curious (curioso), confused (confuso).
 * As animações ficam no style.css, ativadas por data-mood no contêiner.
 */
(function (root) {
  'use strict';

  /** orelha peluda: círculo + tufos na borda de fora + pelinhos claros por dentro */
  function ear(side, cx, cy) {
    const dir = side === 'l' ? 1 : -1;
    const tufts = [];
    // ângulos da borda de fora (esquerda/cima para a orelha esquerda, espelhado na direita)
    for (let a = 140; a <= 300; a += 20) {
      const rad = (a * Math.PI) / 180;
      const x = cx + dir * 37 * Math.cos(rad);
      const y = cy + 37 * Math.sin(rad);
      tufts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10"/>`);
    }
    const ix = cx + dir * 2;
    const iy = cy + 2;
    const wisps = [
      `M${ix - dir * 14} ${iy + 2} q${dir * 8} -4 ${dir * 16} -2`,
      `M${ix - dir * 12} ${iy - 9} q${dir * 8} 0 ${dir * 14} 4`,
      `M${ix - dir * 12} ${iy + 12} q${dir * 8} -6 ${dir * 15} -6`,
    ];
    return `
      <g class="k-ear k-ear-${side}">
        <g style="fill:var(--fur)">${tufts.join('')}</g>
        <circle cx="${cx}" cy="${cy}" r="40" fill="url(#kFur)"/>
        <circle cx="${ix}" cy="${iy}" r="24" fill="url(#kEar)"/>
        <g style="stroke:var(--fluff)" stroke-width="3" stroke-linecap="round" fill="none" opacity=".9">
          ${wisps.map((d) => `<path d="${d}"/>`).join('')}
        </g>
      </g>`;
  }

  const SVG = `
<svg class="koala" viewBox="0 0 240 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Koa, o coala">
  <defs>
    <radialGradient id="kFur" cx="45%" cy="35%" r="75%">
      <stop offset="0" style="stop-color:var(--fur-light)"/>
      <stop offset="1" style="stop-color:var(--fur)"/>
    </radialGradient>
    <radialGradient id="kEar" cx="50%" cy="50%" r="60%">
      <stop offset="0" style="stop-color:var(--ear-in-light)"/>
      <stop offset="1" style="stop-color:var(--ear-in)"/>
    </radialGradient>
    <linearGradient id="kNose" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a505e"/>
      <stop offset="1" stop-color="#2a2e37"/>
    </linearGradient>
  </defs>

  <!-- sombra no chão -->
  <ellipse class="k-shadow" cx="120" cy="243" rx="62" ry="6" style="fill:var(--shadow)"/>

  <g class="k-all">
    <!-- corpo -->
    <g class="k-body">
      <ellipse cx="120" cy="200" rx="64" ry="46" fill="url(#kFur)"/>
      <ellipse cx="120" cy="208" rx="38" ry="31" style="fill:var(--belly)"/>
      <!-- galhinho de eucalipto -->
      <g class="k-leaf">
        <path d="M70 232 C 100 214, 140 212, 176 196" style="stroke:var(--branch)" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M150 205 c 6 -16 22 -20 30 -18 c -2 12 -14 22 -30 18z" style="fill:var(--leaf)"/>
        <path d="M124 213 c 2 -16 16 -24 26 -24 c 0 12 -10 24 -26 24z" style="fill:var(--leaf-2)"/>
        <path d="M98 222 c 0 -14 12 -22 22 -24 c 2 12 -8 22 -22 24z" style="fill:var(--leaf)"/>
      </g>
      <!-- patinhas abraçando o galho -->
      <ellipse cx="86" cy="214" rx="17" ry="12" style="fill:var(--fur-dark)"/>
      <ellipse cx="154" cy="210" rx="17" ry="12" style="fill:var(--fur-dark)"/>
      <ellipse cx="96" cy="240" rx="18" ry="8" style="fill:var(--fur-dark)"/>
      <ellipse cx="144" cy="240" rx="18" ry="8" style="fill:var(--fur-dark)"/>
    </g>

    <!-- cabeça -->
    <g class="k-head">
      <!-- orelhas grandes e peludas -->
      ${ear('l', 54, 70)}
      ${ear('r', 186, 70)}

      <ellipse cx="120" cy="110" rx="76" ry="66" fill="url(#kFur)"/>
      <!-- tufinho no topo -->
      <path d="M108 48 q6 -10 12 -2 q6 -10 12 2" fill="none" style="stroke:var(--fur-dark)" stroke-width="3" stroke-linecap="round"/>

      <!-- bochechas -->
      <ellipse class="k-cheek" cx="70" cy="134" rx="14" ry="9" style="fill:var(--cheek)"/>
      <ellipse class="k-cheek" cx="170" cy="134" rx="14" ry="9" style="fill:var(--cheek)"/>

      <!-- sobrancelhas (curioso / confuso) -->
      <g class="k-brows" style="stroke:var(--fur-dark)" stroke-width="4" stroke-linecap="round" fill="none">
        <path class="k-brow-l" d="M76 84 q10 -8 22 -2"/>
        <path class="k-brow-r" d="M142 82 q12 -6 22 2"/>
      </g>

      <!-- olhos normais -->
      <g class="k-eyes">
        <g class="k-eye">
          <ellipse cx="88" cy="104" rx="8.5" ry="10.5" fill="#262a33"/>
          <g class="k-pupil"><circle cx="91" cy="100" r="3.2" fill="#fff"/><circle cx="86" cy="108" r="1.4" fill="#fff" opacity=".7"/></g>
        </g>
        <g class="k-eye">
          <ellipse cx="152" cy="104" rx="8.5" ry="10.5" fill="#262a33"/>
          <g class="k-pupil"><circle cx="155" cy="100" r="3.2" fill="#fff"/><circle cx="150" cy="108" r="1.4" fill="#fff" opacity=".7"/></g>
        </g>
      </g>
      <!-- olhos sorrindo (feliz) -->
      <g class="k-eyes-happy" stroke="#262a33" stroke-width="4.5" stroke-linecap="round" fill="none">
        <path d="M79 107 q9 -12 18 0"/>
        <path d="M143 107 q9 -12 18 0"/>
      </g>

      <!-- narigão -->
      <path class="k-nose" d="M102 112 C 104 100, 136 100, 138 112 C 141 128, 134 146, 120 147 C 106 146, 99 128, 102 112 Z" fill="url(#kNose)"/>
      <ellipse cx="112" cy="112" rx="5" ry="3.2" fill="#fff" opacity=".35"/>

      <!-- boca -->
      <path class="k-mouth" d="M110 156 q10 9 20 0" stroke="#3a3f4b" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <path class="k-mouth-open" d="M111 154 q9 14 18 0 z" fill="#3a3f4b"/>
      <path class="k-mouth-wavy" d="M106 157 q4 -5 8 0 t8 0 t8 0 t8 0" stroke="#3a3f4b" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>
  </g>

  <!-- balõezinhos de pensamento -->
  <g class="k-think" style="fill:var(--think)">
    <circle class="k-dot k-dot1" cx="196" cy="36" r="5"/>
    <circle class="k-dot k-dot2" cx="210" cy="22" r="7"/>
    <circle class="k-dot k-dot3" cx="227" cy="9" r="8"/>
  </g>

  <!-- corações e estrelinhas (feliz) -->
  <g class="k-hearts">
    <path class="k-heart k-h1" d="M30 30 c-6 -8 -18 -2 -12 8 l12 12 l12 -12 c6 -10 -6 -16 -12 -8z" style="fill:var(--heart)"/>
    <path class="k-heart k-h2" d="M210 40 c-5 -6 -14 -2 -10 6 l10 10 l10 -10 c4 -8 -5 -12 -10 -6z" style="fill:var(--heart)"/>
    <path class="k-heart k-h3" d="M200 120 l3 7 l7 1 l-5 5 l1 7 l-6 -3 l-6 3 l1 -7 l-5 -5 l7 -1z" style="fill:var(--star)"/>
    <path class="k-heart k-h4" d="M36 130 l3 7 l7 1 l-5 5 l1 7 l-6 -3 l-6 3 l1 -7 l-5 -5 l7 -1z" style="fill:var(--star)"/>
  </g>

  <!-- interrogação (confuso / curioso) -->
  <text class="k-question" x="206" y="44" font-size="46" font-weight="800" style="fill:var(--question)" font-family="ui-rounded, system-ui, sans-serif">?</text>
</svg>`;

  let resetTimer = null;
  let stageEl = null;

  const Koala = {
    svg: SVG,
    /** coloca o coala dentro de `el`; `stage` recebe data-mood */
    mount(el, stage) {
      el.innerHTML = SVG;
      stageEl = stage || el;
      this.setMood('idle');
    },
    /**
     * muda o humor. Se `ms` for informado, volta para `then` (padrão idle) depois.
     */
    setMood(mood, ms, then) {
      if (!stageEl) return;
      clearTimeout(resetTimer);
      // reinicia animações de "uma vez só" (pulo do feliz)
      if (stageEl.dataset.mood === mood && mood === 'happy') {
        stageEl.dataset.mood = 'idle';
        void stageEl.offsetWidth;
      }
      stageEl.dataset.mood = mood;
      if (ms) resetTimer = setTimeout(() => (stageEl.dataset.mood = then || 'idle'), ms);
    },
    get mood() {
      return stageEl ? stageEl.dataset.mood : 'idle';
    },
  };

  root.KoaKoala = Koala;
})(typeof globalThis !== 'undefined' ? globalThis : this);
