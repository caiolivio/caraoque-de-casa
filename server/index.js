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

const root = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const HOST_PIN = process.env.HOST_PIN?.trim() || String(Math.floor(1000 + Math.random() * 9000));
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY?.trim() || '';
const joinUrl = (process.env.PUBLIC_URL?.trim() || `http://${getLanIp()}:${PORT}`).replace(/\/$/, '');

const store = createStore(join(root, 'data', 'estado.json'));
const karaoke = new Karaoke({ initial: store.load() });

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(join(root, 'public'), { extensions: ['html'] }));

app.get('/api/info', (_req, res) => res.json({ joinUrl }));

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

// ---- Tempo real ----

const isLocal = (socket) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(socket.handshake.address);
// O PC da TV (localhost) sempre pode controlar; celulares precisam do PIN.
const isHost = (socket) => socket.data.host === true || isLocal(socket);

const broadcast = () => io.emit('state', karaoke.snapshot());
karaoke.on('change', () => {
  broadcast();
  store.save(karaoke.toJSON());
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
  console.log('  🎤  Caraoquê de casa está no ar!');
  console.log('');
  console.log(`  TV (abra neste PC):       http://localhost:${PORT}/tv`);
  console.log(`  Celulares (mesmo Wi-Fi):  ${joinUrl}`);
  console.log(`  PIN do anfitrião:         ${HOST_PIN}`);
  console.log(`  Busca:                    ${YOUTUBE_API_KEY ? 'API oficial do YouTube' : 'página do YouTube (sem chave de API)'}`);
  console.log('');
});

const shutdown = () => {
  store.save(karaoke.toJSON());
  store.flush();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
