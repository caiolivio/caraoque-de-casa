import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Karaoke, KaraokeError } from '../server/karaoke.js';

const singer = (name) => ({ id: name.toLowerCase(), name, emoji: '🎤', color: '#43bec6' });
const video = (n) => ({ videoId: `video${String(n).padStart(6, '0')}`, title: `Música ${n}` });

// Relógio e timers falsos para controlar a contagem regressiva.
function fakeTimers() {
  let now = 0;
  let timers = [];
  return {
    now: () => now,
    timers: {
      setTimeout: (fn, ms) => {
        const t = { fn, at: now + ms };
        timers.push(t);
        return t;
      },
      clearTimeout: (t) => (timers = timers.filter((x) => x !== t)),
    },
    advance(ms) {
      now += ms;
      const due = timers.filter((t) => t.at <= now);
      timers = timers.filter((t) => t.at > now);
      due.forEach((t) => t.fn());
    },
  };
}

function setup() {
  const clock = fakeTimers();
  const k = new Karaoke({ introMs: 10_000, now: clock.now, timers: clock.timers });
  k.setReadyTvs(1);
  return { k, clock };
}

test('primeira música entra na intro e depois toca', () => {
  const { k, clock } = setup();
  const { ahead } = k.add(singer('Ana'), video(1));
  assert.equal(ahead, 0);
  assert.equal(k.phase, 'intro');
  assert.equal(k.snapshot().introRemainingMs, 10_000);
  clock.advance(10_000);
  assert.equal(k.phase, 'playing');
});

test('não começa sem TV pronta e começa quando a TV liga', () => {
  const clock = fakeTimers();
  const k = new Karaoke({ now: clock.now, timers: clock.timers });
  k.add(singer('Ana'), video(1));
  assert.equal(k.phase, 'idle');
  assert.equal(k.current, null);
  k.setReadyTvs(1);
  assert.equal(k.phase, 'intro');
  assert.equal(k.current.title, 'Música 1');
});

test('fim da música avança a fila e ignora aviso repetido', () => {
  const { k, clock } = setup();
  const first = k.add(singer('Ana'), video(1)).item;
  const second = k.add(singer('Bia'), video(2));
  assert.equal(second.ahead, 1);
  clock.advance(10_000);
  assert.equal(k.finish(first.id), true);
  assert.equal(k.finish(first.id), false);
  assert.equal(k.current.id, second.item.id);
  assert.equal(k.phase, 'intro');
  assert.equal(k.history[0].status, 'played');
});

test('fila vazia volta para idle', () => {
  const { k } = setup();
  const { item } = k.add(singer('Ana'), video(1));
  k.skip();
  assert.equal(k.phase, 'idle');
  assert.equal(k.current, null);
  assert.equal(k.history[0].id, item.id);
  assert.equal(k.history[0].status, 'skipped');
});

test('recusa música repetida e dados inválidos', () => {
  const { k } = setup();
  k.add(singer('Ana'), video(1));
  assert.throws(() => k.add(singer('Bia'), video(1)), KaraokeError);
  assert.throws(() => k.add(singer('Bia'), { videoId: 'x', title: 'y' }), KaraokeError);
  assert.throws(() => k.add({ id: 'a', name: '   ' }, video(2)), KaraokeError);
});

test('limpa texto e monta a miniatura no servidor', () => {
  const { k } = setup();
  const { item } = k.add({ id: 'a', name: '  Ana   Paula ', color: 'red' }, { ...video(1), thumb: 'javascript:x' });
  assert.equal(item.singer.name, 'Ana Paula');
  assert.equal(item.singer.color, '#43bec6');
  assert.match(item.thumb, /^https:\/\/i\.ytimg\.com\//);
});

test('pausar, continuar e começar já durante a intro', () => {
  const { k, clock } = setup();
  k.add(singer('Ana'), video(1));
  k.togglePause();
  assert.equal(k.phase, 'playing');
  k.togglePause();
  assert.equal(k.phase, 'paused');
  clock.advance(10_000);
  assert.equal(k.phase, 'paused', 'timer da intro cancelado não pode despausar');
  k.togglePause();
  assert.equal(k.phase, 'playing');
});

test('reordenar e remover', () => {
  const { k } = setup();
  k.add(singer('Ana'), video(1));
  const b = k.add(singer('Bia'), video(2)).item;
  const c = k.add(singer('Caio'), video(3)).item;
  const d = k.add(singer('Duda'), video(4)).item;
  assert.deepEqual(k.queue.map((i) => i.id), [b.id, c.id, d.id]);
  k.move(d.id, 'top');
  assert.deepEqual(k.queue.map((i) => i.id), [d.id, b.id, c.id]);
  k.move(b.id, 'down');
  assert.deepEqual(k.queue.map((i) => i.id), [d.id, c.id, b.id]);
  assert.equal(k.move(d.id, 'up'), false);
  k.remove(c.id);
  assert.deepEqual(k.queue.map((i) => i.id), [d.id, b.id]);
  assert.equal(k.songsAhead(b.id), 2);
});

test('salva a música atual de volta no início da fila', () => {
  const { k } = setup();
  const a = k.add(singer('Ana'), video(1)).item;
  const b = k.add(singer('Bia'), video(2)).item;
  const saved = JSON.parse(JSON.stringify(k));
  assert.deepEqual(saved.queue.map((i) => i.id), [a.id, b.id]);
  const restored = new Karaoke({ initial: saved });
  assert.equal(restored.queue.length, 2);
  assert.equal(restored.phase, 'idle');
});

test('volume fica entre 0 e 100', () => {
  const { k } = setup();
  k.setVolume(150);
  assert.equal(k.volume, 100);
  k.setVolume(-3);
  assert.equal(k.volume, 0);
  k.setVolume('abc');
  assert.equal(k.volume, 0);
});
