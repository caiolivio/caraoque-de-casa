import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import { Karaoke, KaraokeError } from './karaoke.js';
import { searchVideos, SearchError } from './youtube.js';
import { createStore } from './store.js';
import { getLanIp } from './network.js';
import { Playlists } from './playlists.js';
import { createMedia, MAX_IMAGE_BYTES, MEDIA_KINDS } from './media.js';

const root = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const HOST_PIN = process.env.HOST_PIN?.trim() || String(Math.floor(1000 + Math.random() * 9000));
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY?.trim() || '';
const joinUrl = (process.env.PUBLIC_URL?.trim() || `http://${getLanIp()}:${PORT}`).replace(/\/$/, '');

const store = createStore(join(root, 'data', 'estado.json'));
const karaoke = new Karaoke({ initial: store.load() });
const playlistStore = createStore(join(root, 'data', 'listas.json'));
const playlists = new Playlists(playlistStore.load());
const media = createMedia(join(root, 'data', 'midia'));

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(join(root, 'public'), { extensions: ['html'] }));

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const brandingInfo = () => ({ joinUrl, media: media.info() });

app.get('/api/info', (_req, res) => res.json(brandingInfo()));

app.get('/media/:kind', (req, res) => {
  const m = media.get(req.params.kind);
  if (!m) return res.status(404).end();
  res.type(m.type).sendFile(m.file, { maxAge: '1y' });
});

app.get('/api/playlists', (_req, res) => res.json({ playlists: playlists.list() }));

let qrSvg;
app.get('/api/qr.svg', async (_req, res) => {
  qrSvg ??= await QRCode.toString(joinUrl, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
  res.type('image/svg+xml').send(qrSvg);
});

app.get('/api/search', async (req, res) => {
  try {
    const results = await searchVideos(req.query.q, {
      apiKey: YOUTUBE_API_KEY,
      karaokeOnly: req.query.karaoke !== '0',
    });
    res.json({ results });
  } catch (err) {
    const message = err instanceof SearchError ? err.message : 'A busca falhou. Tente de novo.';
    if (!(err instanceof SearchError)) console.error('[busca]', err);
    res.status(502).json({ error: message });
  }
});

// ---- Administração (PC da TV sem PIN; outros aparelhos com o PIN no cabeçalho x-host-pin) ----

const admin = express.Router();
admin.use(express.json({ limit: '100kb' }));
admin.use((req, res, next) => {
  const local = LOOPBACK.includes(req.socket.remoteAddress);
  if (local || req.get('x-host-pin') === HOST_PIN) {
    req.isLocal = local;
    return next();
  }
  res.status(401).json({ error: 'PIN errado.' });
});

// Responde { ok } ou { error } com a mesma regra dos eventos do Socket.IO.
const handle = (fn) => (req, res) => {
  try {
    res.json({ ok: true, ...fn(req) });
  } catch (err) {
    if (!(err instanceof KaraokeError)) console.error(`[admin] ${req.method} ${req.path}`, err);
    res.status(400).json({ error: err instanceof KaraokeError ? err.message : 'Algo deu errado.' });
  }
};

admin.get('/check', handle((req) => ({ pin: req.isLocal ? HOST_PIN : undefined, joinUrl, tvUrl: `http://localhost:${PORT}/tv` })));
admin.post('/playlists', handle((req) => ({ playlist: playlists.create(req.body.name) })));
admin.patch('/playlists/:id', handle((req) => (playlists.rename(req.params.id, req.body.name), {})));
admin.delete('/playlists/:id', handle((req) => (playlists.remove(req.params.id), {})));
admin.post('/playlists/:id/move', handle((req) => (playlists.moveList(req.params.id, req.body.where), {})));
admin.post('/playlists/:id/items', handle((req) => (playlists.addItem(req.params.id, req.body.video), {})));
admin.delete('/playlists/:id/items/:videoId', handle((req) => (playlists.removeItem(req.params.id, req.params.videoId), {})));
admin.post(
  '/playlists/:id/items/:videoId/move',
  handle((req) => (playlists.moveItem(req.params.id, req.params.videoId, req.body.where), {})),
);

admin.put(
  '/media/:kind',
  express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
  (req, res) => {
    if (!MEDIA_KINDS.includes(req.params.kind)) return res.status(404).json({ error: 'Tipo inválido.' });
    try {
      media.save(req.params.kind, req.body);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    io.emit('branding', brandingInfo());
    res.json({ ok: true, media: media.info() });
  },
);
admin.delete('/media/:kind', (req, res) => {
  if (!MEDIA_KINDS.includes(req.params.kind)) return res.status(404).json({ error: 'Tipo inválido.' });
  media.remove(req.params.kind);
  io.emit('branding', brandingInfo());
  res.json({ ok: true, media: media.info() });
});

app.use('/api/admin', admin);
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Imagem grande demais (máximo 15 MB).' });
  console.error(err);
  res.status(500).json({ error: 'Algo deu errado.' });
});

// ---- Tempo real ----

const isLocal = (socket) => LOOPBACK.includes(socket.handshake.address);
// O PC da TV (localhost) sempre pode controlar; celulares precisam do PIN.
const isHost = (socket) => socket.data.host === true || isLocal(socket);

const broadcast = () => io.emit('state', karaoke.snapshot());
karaoke.on('change', () => {
  broadcast();
  store.save(karaoke.toJSON());
});
playlists.on('change', () => {
  io.emit('playlists', playlists.list());
  playlistStore.save(playlists.toJSON());
});

function countReadyTvs() {
  let n = 0;
  for (const s of io.sockets.sockets.values()) if (s.data.tvReady) n++;
  karaoke.setReadyTvs(n);
}

io.on('connection', (socket) => {
  // Registra um evento com tratamento de erro e resposta (ack) padronizados.
  const on = (event, handler, { hostOnly = false } = {}) => {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (hostOnly && !isHost(socket)) return reply({ error: 'Só o anfitrião pode fazer isso.' });
      try {
        reply({ ok: true, ...handler(payload ?? {}) });
      } catch (err) {
        if (!(err instanceof KaraokeError)) console.error(`[${event}]`, err);
        reply({ error: err instanceof KaraokeError ? err.message : 'Algo deu errado.' });
      }
    });
  };

  socket.emit('state', karaoke.snapshot());
  socket.emit('playlists', playlists.list());

  on('queue:add', ({ singer, video }) => {
    const { item, ahead } = karaoke.add(singer, video);
    return { itemId: item.id, ahead };
  });

  // Quem escolheu pode tirar a própria música; o anfitrião pode tirar qualquer uma.
  on('queue:remove', ({ itemId, singerId }) => {
    const item = karaoke.getItem(itemId);
    if (!item) throw new KaraokeError('Essa música não está mais na fila.');
    if (!isHost(socket) && item.singer.id !== singerId) throw new KaraokeError('Só quem escolheu pode tirar.');
    karaoke.remove(itemId);
    return {};
  });

  socket.data.pinFailures = 0;
  on('host:auth', ({ pin }) => {
    if (socket.data.pinFailures >= 10) throw new KaraokeError('Muitas tentativas. Recarregue a página.');
    if (String(pin ?? '').trim() !== HOST_PIN) {
      socket.data.pinFailures++;
      throw new KaraokeError('PIN errado.');
    }
    socket.data.host = true;
    return {};
  });
  on('host:logout', () => {
    socket.data.host = false;
    return {};
  });
  on('host:skip', () => (karaoke.skip(), {}), { hostOnly: true });
  on('host:togglePause', () => (karaoke.togglePause(), {}), { hostOnly: true });
  on('host:move', ({ itemId, where }) => (karaoke.move(itemId, where), {}), { hostOnly: true });
  on('host:volume', ({ volume }) => (karaoke.setVolume(volume), {}), { hostOnly: true });
  on('host:restart', () => (io.emit('tv:command', { type: 'restart' }), {}), { hostOnly: true });

  // ---- Eventos da TV ----
  on('tv:ready', () => {
    socket.data.tvReady = true;
    countReadyTvs();
    return {};
  });
  on('tv:ended', ({ itemId }) => (karaoke.finish(itemId, 'played'), {}));
  on('tv:error', ({ itemId, code }) => {
    const item = karaoke.getItem(itemId);
    if (item && karaoke.finish(itemId, 'error')) {
      console.warn(`[tv] vídeo ${item.videoId} não tocou (erro ${code}); pulando.`);
      io.emit('toast', { message: `“${item.title}” não pode tocar fora do YouTube. Pulando…`, singerId: item.singer.id });
    }
    return {};
  });

  socket.on('disconnect', () => {
    if (socket.data.tvReady) countReadyTvs();
  });
});

// Atualiza a contagem regressiva de quem conectou no meio da intro.
setInterval(() => {
  if (karaoke.phase === 'intro') broadcast();
}, 5000).unref();

server.listen(PORT, () => {
  console.log('');
  console.log('  🎤  Huliokê está no ar!  · Life is a Huli');
  console.log('');
  console.log(`  TV (abra neste PC):       http://localhost:${PORT}/tv`);
  console.log(`  Celulares (mesmo Wi-Fi):  ${joinUrl}`);
  console.log(`  Administração (neste PC): http://localhost:${PORT}/admin`);
  console.log(`  PIN do anfitrião:         ${HOST_PIN}`);
  console.log(`  Busca:                    ${YOUTUBE_API_KEY ? 'API oficial do YouTube' : 'página do YouTube (sem chave de API)'}`);
  console.log('');
});

const shutdown = () => {
  store.save(karaoke.toJSON());
  store.flush();
  playlistStore.flush();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
