# Huliokê (Life is a Huli)

Karaokê caseiro em Node.js, da marca Life is a Huli (rodapé "Produto by Life is a Huli" em todas as telas). O PC ligado na TV roda o servidor; celulares na mesma rede montam a fila. Interface e mensagens em português do Brasil.

## Arquitetura

- `server/index.js`: Express (arquivos estáticos + `/api/search`, `/api/qr.svg`, `/api/info`) e Socket.IO.
- `server/karaoke.js`: classe `Karaoke`, fonte da verdade da fila. Fases: `idle` → `intro` (contagem de 10 s) → `playing` ⇄ `paused`. Emite `change`; o servidor transmite `state` (snapshot completo) para todos a cada mudança. Só avança a fila quando há pelo menos uma TV pronta (`tv:ready`).
- `server/youtube.js`: busca. Com `YOUTUBE_API_KEY` usa a Data API v3; sem chave, lê `ytInitialData` da página de resultados. Links colados viram um resultado via oEmbed.
- `server/playlists.js`: listas do anfitrião (padrão: "Life is a Huli"), salvas em `data/listas.json`. Mudanças vão para todos via evento `playlists`.
- `server/media.js`: foto de fundo, logo e vídeo de fundo (só TV) enviados pela administração, em `data/midia/`, servidos em `/media/fundo`, `/media/logo` e `/media/video`. Formato reconhecido pelos bytes (JPG, PNG, WebP, MP4, WebM; nunca SVG). Mudanças emitem `branding`.
- Administração: rotas REST em `/api/admin/*` (sem PIN em localhost; senão cabeçalho `x-host-pin`). Página `public/admin.html/js/css`.
- `server/store.js`: persiste fila/histórico/volume em `data/estado.json` (ignorado no git). Sem banco nativo de propósito, para `npm install` funcionar em qualquer Windows sem compilador.
- `public/`: sem build, JavaScript puro.
  - `tv.html/js/css`: tela da TV com YouTube IFrame Player API. A TV só executa o estado e reporta `tv:ended` / `tv:error` com o `itemId`.
  - `index.html`, `celular.js/css`: interface mobile (entrar, buscar, listas, fila, anfitrião).
  - `marca.js`: aplica logo e foto de fundo em elementos `[data-brand]` e na variável CSS `--bg-image`.

## Eventos Socket.IO

- Celular → servidor: `queue:add`, `queue:remove`, `host:auth`, `host:logout`, `host:skip`, `host:togglePause`, `host:move`, `host:volume`, `host:restart`. Todos respondem via ack `{ ok }` ou `{ error }`.
- TV → servidor: `tv:ready`, `tv:ended`, `tv:error`.
- Servidor → todos: `state`, `playlists`, `branding`, `toast`, `tv:command`.

Eventos `host:*` exigem PIN, exceto vindos de localhost (o PC da TV).

## Convenções

- Nunca usar `innerHTML` com dados de usuário ou do YouTube; no celular use o helper `h()`.
- `crypto.randomUUID` não existe no navegador em http pela rede local; não usar no front.
- Validar tudo que vem do cliente em `sanitizeSinger` / `sanitizeVideo`.
- Testes com `node:test` (`npm test`); a lógica da fila usa relógio e timers injetáveis.

## Próximas etapas (do plano)

7. Diversão: fila justa (rodízio entre pessoas), duetos, reações com emoji na TV, nota da galera, ranking da noite.
8. Facilidades: favoritos e histórico por pessoa, Cloudflare Tunnel opcional.
