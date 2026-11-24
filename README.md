# Koa 🐨 — o coala que aprende conversando

O Koa começa sem saber **nada** e aprende tudo com a conversa. Ele roda inteiro no navegador
(feito pensando no Safari do iPhone), sem servidor e sem inteligência artificial externa:
tudo o que ele aprende fica guardado **só no aparelho**.

## Como ensinar o Koa

| Você diz | O Koa aprende |
|---|---|
| `o céu é azul` · `gatos são animais` · `o gato tem bigode` | fatos sobre coisas |
| `meu nome é Ana` · `me chamo Ana` · `minha cor favorita é verde` | coisas sobre você |
| `eu gosto de chocolate e pizza` · `eu moro em Curitiba` | seus gostos e sua vida |
| `você é fofo` | coisas sobre ele mesmo |
| `não, na verdade é verde` · `o gato não é preto, é branco` | correções |
| `esquece o gato` | apaga um assunto |

Perguntas: `o que é um gato?`, `qual é o meu nome?`, `do que eu gosto?`, `onde fica Paris?`,
`o que você sabe sobre mim?`, `quem é você?`. Se ele não souber, pergunta de volta e a sua
próxima resposta vira conhecimento. De vez em quando ele também faz perguntas curiosas e
começa a usar palavras, risadas e emojis que você costuma usar.

O livrinho no canto de cima abre **"O que o Koa sabe"**: lá dá para editar, apagar, exportar
um backup `.json`, importar e esquecer tudo.

## O mundinho 3D

O Koa mora numa ilha flutuante com um pé de eucalipto, laguinho, nuvens e folhas caindo.
O céu segue a hora do aparelho: dia, entardecer e noite com estrelas e vaga-lumes.
O mundo **cresce** conforme ele aprende: nasce uma florzinha por coisa aprendida, e a cada
10 coisas aparece uma borboleta.

- Arraste no mundo para girar. Toque no Koa e ele fica feliz.
- O botão ⛶ no canto abre o mundo em tela cheia, com zoom de pinça. O ✕ volta para a conversa.
- O mundo usa a biblioteca Three.js. Na primeira vez, ela vem da internet e depois fica guardada
  para funcionar offline. Sem WebGL, ou na primeira visita sem internet, aparece o coala 2D.

## Cérebro avançado (opcional)

O botão ✨ no topo abre as configurações. Com uma chave da API do Claude, o Koa **continua
aprendendo do mesmo jeito** (tudo local), mas a resposta é reescrita pelo Claude para soar mais
natural. O Claude só pode usar o que o Koa aprendeu, então o coala continua "sem saber nada" além
do que foi ensinado.

1. Crie uma chave em <https://console.anthropic.com> (em **API Keys**) e defina um **limite de gastos** baixo.
2. No Koa: ✨ → cole a chave → **Testar** → marque "Usar o cérebro avançado" → **Salvar**.
3. Modelos: Opus 5.5 (padrão, mais esperto), Sonnet 5.5 ou Haiku 5.5 (mais barato).

Privacidade: a chave fica só no aparelho e só é enviada para `api.anthropic.com`, junto com a
memória do Koa e as últimas mensagens. O backup exportado não inclui a chave. Sem chave, sem
internet ou se a API falhar, o Koa responde com o cérebro local.

## Rodar no computador

```bash
cd koa-coala
python -m http.server 8140
```

Abra <http://localhost:8140>. Testes do cérebro (sem dependências):

```bash
node tests/brain.test.js
```

## Publicar de graça

**Netlify (mais fácil):** entre em <https://app.netlify.com/drop> e arraste a pasta `koa-coala`.
Pronto, você recebe um link `https://...netlify.app`.

**GitHub Pages:** crie um repositório, envie os arquivos desta pasta e ative
*Settings → Pages → Deploy from branch → main / (root)*.

> Precisa ser `https` para funcionar offline e virar app no iPhone. Os dois jeitos acima já dão isso.

## Colocar na Tela de Início do iPhone

1. Abra o link no **Safari**.
2. Toque em **Compartilhar** (quadrado com a seta para cima).
3. Escolha **Adicionar à Tela de Início** → **Adicionar**.

O Koa abre em tela cheia, como um app, e funciona mesmo sem internet.

> A memória fica no Safari daquele aparelho. Se apagar os dados do site, ou passar semanas sem
> abrir, o iOS pode limpar. Use **Exportar** de vez em quando para guardar um backup.

## Arquivos

- `index.html`: a página
- `style.css`: visual e animações do coala
- `app.js`: a interface (conversa, balão, nível, memória, teclado do iPhone)
- `brain.js`: o cérebro (extrair fatos, memória, busca aproximada, respostas, curiosidade, estilo)
- `world3d.js`: o mundinho 3D (ilha, eucalipto, céu, coala 3D, flores que crescem)
- `llm.js`: cérebro avançado opcional (chamada à API do Claude)
- `koala.svg.js`: o desenho do coala e os estados (parado, pensando, feliz, curioso, confuso)
- `sw.js`: deixa o app funcionar offline (ao mudar arquivos, troque a `VERSION`)
- `manifest.webmanifest` e `icons/`: configuração de app (PWA)
- `tools/make-icons.js`: gera os ícones (`node tools/make-icons.js`)
- `tests/brain.test.js`: testes
