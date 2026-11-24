// Testes do cérebro do Koa. Rodar com:  node tests/brain.test.js
// Sem dependências: usa só o módulo nativo node:assert.
'use strict';
const assert = require('node:assert/strict');
const K = require('../brain.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + '\n      ' + e.message.split('\n').join('\n      '));
  }
}

/** cérebro determinístico: sem curiosidade aleatória nem enfeites */
function brain(opts = {}) {
  let t = 1000;
  return new K.Brain(Object.assign({ rng: () => 0.99, now: () => ++t }, opts));
}
const ask = (b, msg) => b.respond(msg).text;

console.log('\nUtilidades de texto');
test('normalize tira acentos, maiúsculas e pontuação', () => {
  assert.equal(K.normalize('  Olá, MUNDO!! Ação '), 'ola mundo acao');
});
test('keyOf ignora artigos e plural simples', () => {
  assert.equal(K.keyOf('Os Gatos'), 'gato');
  assert.equal(K.keyOf('animais'), 'animal');
  assert.equal(K.keyOf('as flores'), 'flor');
  assert.equal(K.keyOf('leões'), 'leao');
});
test('levenshtein e similaridade', () => {
  assert.equal(K.levenshtein('gato', 'gatu'), 1);
  assert.equal(K.levenshtein('', 'abc'), 3);
  assert.ok(K.similarity('elefante', 'elefnte') > 0.8);
});
test('keyMatchScore aceita erro de digitação, rejeita palavras curtas diferentes', () => {
  assert.ok(K.keyMatchScore('elefnte', 'elefante') > 0);
  assert.ok(K.keyMatchScore('capital franca', 'capital da franca') > 0);
  assert.equal(K.keyMatchScore('sol', 'mar'), 0);
});
test('troca de perspectiva meu → seu, eu → você', () => {
  assert.equal(K.swapPerspective('meu gato é minha vida'), 'seu gato é sua vida');
  assert.equal(K.swapPerspective('Eu amo'), 'Você amo');
});
test('subjectKey reconhece perfil e o próprio Koa', () => {
  assert.equal(K.subjectKey('meu nome'), 'user:nome');
  assert.equal(K.subjectKey('a minha cor favorita'), 'user:cor favorita');
  assert.equal(K.subjectKey('você'), 'koa:self');
});

console.log('\nExtração de fatos');
test('começa sem saber nada', () => {
  const b = brain();
  assert.equal(b.count, 0);
  assert.ok(b.isNew());
  assert.match(b.introText(), /não sei NADA/);
});
test('"o céu é azul" vira fato', () => {
  const b = brain();
  const r = b.respond('O céu é azul.');
  assert.ok(r.learned);
  assert.equal(r.mood, 'happy');
  assert.equal(b.count, 1);
  assert.equal(b.facts[0].key, 'ceu');
  assert.equal(b.facts[0].value, 'azul');
});
test('"X são Y" guarda plural', () => {
  const b = brain();
  b.respond('gatos são animais');
  assert.equal(b.facts[0].plural, true);
  assert.match(ask(b, 'o que são gatos?'), /Gatos são animais/);
});
test('"meu nome é Ana" e pergunta pelo nome', () => {
  const b = brain();
  assert.match(ask(b, 'meu nome é Ana'), /Ana/);
  assert.match(ask(b, 'qual é o meu nome?'), /Seu nome é Ana/);
});
test('"me chamo" e "eu sou a" também contam como nome', () => {
  const b = brain();
  b.respond('me chamo Bia');
  assert.equal(b.userName(), 'Bia');
  const b2 = brain();
  b2.respond('eu sou a Carla');
  assert.equal(b2.userName(), 'Carla');
});
test('"eu gosto de X e Y" guarda vários gostos', () => {
  const b = brain();
  b.respond('eu gosto de chocolate e pizza');
  assert.equal(b.count, 2);
  assert.match(ask(b, 'do que eu gosto?'), /Você gosta de chocolate e de pizza/);
});
test('"minha X é Y" vira conhecimento sobre a pessoa', () => {
  const b = brain();
  b.respond('minha cor favorita é verde');
  assert.match(ask(b, 'qual minha cor favorita?'), /Sua cor favorita é verde/);
});
test('"tem" e lista', () => {
  const b = brain();
  b.respond('o gato tem bigode, rabo e quatro patas');
  assert.equal(b.count, 3);
  assert.match(ask(b, 'o que o gato tem?'), /bigode, rabo e quatro patas/);
});
test('"ele é" usa o último assunto', () => {
  const b = brain();
  b.respond('o koala é um marsupial');
  b.respond('ele é fofo');
  assert.equal(b.facts.filter((f) => f.key === 'koala').length, 2);
});
test('elogio ao Koa vira conhecimento sobre ele mesmo', () => {
  const b = brain();
  assert.match(ask(b, 'você é fofo'), /Eu sou fofo\?/);
  assert.match(ask(b, 'quem é você?'), /eu sou fofo/);
});

console.log('\nPerguntas e aprendizado por pergunta');
test('não sabe → pergunta "pode me ensinar?" → próxima resposta vira fato', () => {
  const b = brain();
  const r = b.respond('o que é um gato?');
  assert.match(r.text, /ensina|conta/i);
  assert.equal(r.mood, 'curious');
  const r2 = b.respond('um animal que mia');
  assert.ok(r2.learned);
  assert.match(ask(b, 'o que é gato?'), /Gato é um animal que mia/);
});
test('resposta começando com verbo completa o assunto', () => {
  const b = brain();
  b.respond('o que é um tatu?');
  b.respond('é um bicho com casco');
  assert.match(ask(b, 'quem é tatu?'), /Tatu é um bicho com casco/);
});
test('"não sei" cancela a pergunta pendente', () => {
  const b = brain();
  b.respond('o que é zebra?');
  assert.match(ask(b, 'não sei'), /próxima|Depois/);
  assert.equal(b.count, 0);
});
test('pergunta sobre o nome sem saber → pergunta de volta e aprende', () => {
  const b = brain();
  assert.match(ask(b, 'qual é o meu nome?'), /Como você se chama/);
  b.respond('Marcos');
  assert.equal(b.userName(), 'Marcos');
});
test('busca aproximada com erro de digitação', () => {
  const b = brain();
  b.respond('elefante é um animal grande');
  assert.match(ask(b, 'o que é elefnte?'), /elefante é um animal grande/i);
});
test('busca ignora acentos e maiúsculas', () => {
  const b = brain();
  b.respond('A Ação é importante');
  assert.match(ask(b, 'o que é acao?'), /importante/);
});
test('pergunta de sim/não', () => {
  const b = brain();
  b.respond('gato é um animal');
  assert.match(ask(b, 'gato é um animal?'), /^Sim!/);
  assert.match(ask(b, 'gato é uma planta?'), /verdade/);
  b.respond('sim');
  assert.equal(b.facts.filter((f) => f.key === 'gato').length, 2);
});
test('"o que você sabe?" resume', () => {
  const b = brain();
  b.respond('sol é quente');
  assert.match(ask(b, 'o que você sabe?'), /Já aprendi 1 coisa/);
});

console.log('\nCorreção e conflitos');
test('"não, na verdade..." atualiza o último fato', () => {
  const b = brain();
  b.respond('o céu é verde');
  const r = b.respond('não, na verdade é azul');
  assert.match(r.text, /corrigir/);
  assert.equal(b.count, 1);
  assert.equal(b.facts[0].value, 'azul');
});
test('correção com frase completa', () => {
  const b = brain();
  b.respond('a capital da França é Londres');
  b.respond('na verdade a capital da França é Paris');
  assert.match(ask(b, 'qual é a capital da França?'), /Paris/);
  assert.doesNotMatch(ask(b, 'qual é a capital da França?'), /Londres/);
});
test('"X não é A, é B" troca o valor certo', () => {
  const b = brain();
  b.respond('o gato é preto');
  b.respond('o gato é fofo');
  b.respond('errado, o gato não é preto, é branco');
  const vals = b.facts.map((f) => f.value).sort();
  assert.deepEqual(vals, ['branco', 'fofo']);
});
test('nome (valor único) é substituído e avisa do conflito', () => {
  const b = brain();
  b.respond('meu nome é Ana');
  const r = b.respond('meu nome é Bia');
  assert.match(r.text, /antes você tinha me dito/);
  assert.equal(b.count, 1);
  assert.equal(b.userName(), 'Bia');
});
test('duplicata não conta duas vezes', () => {
  const b = brain();
  b.respond('o sol é quente');
  const r = b.respond('O SOL É QUENTE!!');
  assert.equal(b.count, 1);
  assert.equal(r.learned, false);
  assert.match(r.text, /já sabia|já aprendi/);
});
test('"esquece X" apaga o assunto', () => {
  const b = brain();
  b.respond('o sol é quente');
  b.respond('esquece o sol');
  assert.equal(b.count, 0);
});

console.log('\nCasos de borda');
test('entrada vazia é ignorada', () => {
  const b = brain();
  const r = b.respond('   ');
  assert.equal(r.ignored, true);
  assert.equal(b.state.turns, 0);
});
test('texto muito longo é cortado sem quebrar', () => {
  const b = brain();
  const r = b.respond('banana é ' + 'muito '.repeat(300) + 'boa');
  assert.match(r.text, /comecinho/);
  assert.ok(b.facts.every((f) => f.value.length <= 201));
});
test('caracteres especiais não quebram', () => {
  const b = brain();
  for (const s of ['<script>alert(1)</script>', '💚💚💚', '???', '!!!', '\u0000\u0007', '"" é ""', 'é é é']) {
    const r = b.respond(s);
    assert.equal(typeof r.text, 'string');
  }
});
test('frase sem sentido deixa o Koa confuso', () => {
  const b = brain();
  assert.equal(b.respond('blablabla xyz').mood, 'confused');
});
test('várias frases numa mensagem', () => {
  const b = brain();
  b.respond('O gato é um animal. O cachorro é um animal também! Qual é o meu nome?');
  assert.equal(b.count, 2);
  assert.equal(b.state.pending.key, 'user:nome');
});
test('cumprimento usa o nome da pessoa', () => {
  const b = brain();
  b.respond('meu nome é Ana');
  assert.match(ask(b, 'oi koa!'), /Oi, Ana/);
});

console.log('\nNível, estilo, persistência');
test('sobe de nível no marco de 10', () => {
  const b = brain();
  let up = null;
  for (let i = 0; i < 10; i++) {
    const r = b.respond(`coisa${'abcdefghij'[i]} é legal`);
    if (r.levelUp) up = r.levelUp;
  }
  assert.ok(up);
  assert.equal(up.level, 2);
  assert.equal(up.name, 'Filhote curioso');
});
test('aprende o jeito de falar e reutiliza', () => {
  const b = brain({ rng: () => 0 }); // sempre enfeita / sempre curioso
  b.respond('nossa, o céu é azul kkkk');
  b.respond('nossa, o mar é azul kkkk');
  const r = b.respond('nossa, a grama é verde kkkk');
  assert.match(r.text, /^Nossa!/);
  assert.match(r.text, /kkkk/);
});
test('curiosidade faz perguntas sobre o que aprendeu', () => {
  const b = brain({ rng: () => 0 });
  b.respond('o gato é um animal');
  const r = b.respond('o cachorro é um amigo');
  assert.ok(b.state.pending, 'deveria ter uma pergunta pendente');
  assert.match(r.text, /\?/);
  assert.equal(r.mood, 'happy'); // aprendeu algo e ainda perguntou
  // a resposta à curiosidade vira conhecimento
  const before = b.count;
  b.respond('é um ser vivo');
  assert.equal(b.count, before + 1);
  // não pergunta de novo logo em seguida
  b.respond('a vaca é um bicho');
  assert.equal(b.state.pending, null);
});
test('salva e carrega do armazenamento', () => {
  let saved = null;
  const storage = { load: () => saved, save: (s) => (saved = s) };
  const b = brain({ storage });
  b.respond('meu nome é Ana');
  const b2 = brain({ storage });
  assert.equal(b2.userName(), 'Ana');
});
test('armazenamento corrompido não quebra', () => {
  const b = brain({ storage: { load: () => '{oops', save() {} } });
  assert.equal(b.count, 0);
});
test('exportar e importar', () => {
  const b = brain();
  b.respond('o sol é quente');
  b.respond('eu gosto de praia');
  const json = b.exportJSON();
  const b2 = brain();
  assert.equal(b2.importJSON(json), 2);
  assert.match(ask(b2, 'o que é o sol?'), /quente/);
  assert.throws(() => b2.importJSON('{"x":1}'));
  assert.throws(() => b2.importJSON('não é json'));
});
test('editar e apagar fatos', () => {
  const b = brain();
  b.respond('o sol é frio');
  const id = b.facts[0].id;
  assert.ok(b.updateFact(id, { value: 'quente' }));
  assert.match(ask(b, 'o que é o sol?'), /quente/);
  assert.equal(b.updateFact(id, { value: '   ' }), false);
  assert.ok(b.deleteFact(id));
  assert.equal(b.count, 0);
});
test('esquecer tudo', () => {
  const b = brain();
  b.respond('o sol é quente');
  b.forgetAll();
  assert.equal(b.count, 0);
  assert.ok(b.isNew());
});

console.log(`\n${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
