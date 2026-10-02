import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

// Tempo da tela "Próximo: Fulano" antes de cada música (dá tempo de pegar o microfone).
export const INTRO_MS = 10_000;
const HISTORY_LIMIT = 200;

export class KaraokeError extends Error {}

const VIDEO_ID = /^[\w-]{11}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function sanitizeSinger(singer) {
  const id = cleanText(singer?.id, 64);
  const name = cleanText(singer?.name, 24);
  if (!id || !name) throw new KaraokeError('Informe seu nome antes de escolher uma música.');
  return {
    id,
    name,
    emoji: cleanText(singer?.emoji, 8) || '🎤',
    color: COLOR.test(singer?.color ?? '') ? singer.color : '#43bec6',
  };
}

export function sanitizeVideo(video) {
  const videoId = cleanText(video?.videoId, 11);
  if (!VIDEO_ID.test(videoId)) throw new KaraokeError('Vídeo inválido.');
  return {
    videoId,
    title: cleanText(video?.title, 200) || 'Sem título',
    channel: cleanText(video?.channel, 100),
    duration: cleanText(video?.duration, 12),
    thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  };
}

/**
 * Fonte da verdade da fila. Fases:
 *  idle    → nada tocando (fila vazia ou nenhuma TV pronta)
 *  intro   → tela "Próximo: Fulano" com contagem regressiva
 *  playing → vídeo tocando na TV
 *  paused  → vídeo pausado pelo anfitrião
 * Emite 'change' sempre que algo muda.
 */
export class Karaoke extends EventEmitter {
  constructor({ initial, introMs = INTRO_MS, now = Date.now, timers = globalThis } = {}) {
    super();
    this.introMs = introMs;
    this.now = now;
    this.timers = timers;
    this.queue = Array.isArray(initial?.queue) ? initial.queue : [];
    this.history = Array.isArray(initial?.history) ? initial.history : [];
    this.volume = Number.isFinite(initial?.volume) ? initial.volume : 80;
    this.current = null;
    this.phase = 'idle';
    this.introEndsAt = null;
    this.introTimer = null;
    this.readyTvs = 0;
  }

  setReadyTvs(count) {
    const wasZero = this.readyTvs === 0;
    this.readyTvs = count;
    if (wasZero && count > 0 && this.phase === 'idle' && this.queue.length) {
      this.#advance();
      this.#changed();
    } else if (wasZero !== (count === 0)) {
      this.#changed();
    }
  }

  add(singer, video) {
    const s = sanitizeSinger(singer);
    const v = sanitizeVideo(video);
    const duplicate = this.current?.videoId === v.videoId || this.queue.some((i) => i.videoId === v.videoId);
    if (duplicate) throw new KaraokeError('Essa música já está na fila.');
    const item = { id: randomUUID(), ...v, singer: s, addedAt: this.now() };
    this.queue.push(item);
    if (this.phase === 'idle') this.#advance();
    this.#changed();
    return { item, ahead: this.songsAhead(item.id) };
  }

  /** Quantas músicas tocam antes desta (contando a atual). 0 = é a vez dela. */
  songsAhead(itemId) {
    if (this.current?.id === itemId) return 0;
    const index = this.queue.findIndex((i) => i.id === itemId);
    if (index === -1) return -1;
    return index + (this.current ? 1 : 0);
  }

  getItem(itemId) {
    if (this.current?.id === itemId) return this.current;
    return this.queue.find((i) => i.id === itemId) ?? null;
  }

  /** A TV avisa que o vídeo terminou ou deu erro. Ignora avisos repetidos ou atrasados. */
  finish(itemId, status = 'played') {
    if (!this.current || this.current.id !== itemId) return false;
    this.history.unshift({ ...this.current, status, endedAt: this.now() });
    this.history.length = Math.min(this.history.length, HISTORY_LIMIT);
    this.#advance();
    this.#changed();
    return true;
  }

  skip() {
    return this.current ? this.finish(this.current.id, 'skipped') : false;
  }

  togglePause() {
    if (this.phase === 'playing') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'playing';
    else if (this.phase === 'intro') this.#startPlaying();
    else return;
    this.#changed();
  }

  remove(itemId) {
    if (this.current?.id === itemId) return this.skip();
    const index = this.queue.findIndex((i) => i.id === itemId);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    this.#changed();
    return true;
  }

  move(itemId, where) {
    const index = this.queue.findIndex((i) => i.id === itemId);
    if (index === -1) return false;
    const target = where === 'top' ? 0 : where === 'up' ? index - 1 : where === 'down' ? index + 1 : index;
    if (target < 0 || target >= this.queue.length || target === index) return false;
    const [item] = this.queue.splice(index, 1);
    this.queue.splice(target, 0, item);
    this.#changed();
    return true;
  }

  setVolume(volume) {
    const v = Math.round(Number(volume));
    if (!Number.isFinite(v)) return;
    this.volume = Math.max(0, Math.min(100, v));
    this.#changed();
  }

  snapshot() {
    return {
      phase: this.phase,
      current: this.current,
      queue: this.queue,
      introRemainingMs: this.phase === 'intro' ? Math.max(0, this.introEndsAt - this.now()) : 0,
      volume: this.volume,
      tvReady: this.readyTvs > 0,
      history: this.history.slice(0, 20),
    };
  }

  /** O que vai para o disco. A música atual volta para o início da fila ao reiniciar. */
  toJSON() {
    return {
      queue: this.current ? [this.current, ...this.queue] : this.queue,
      history: this.history,
      volume: this.volume,
    };
  }

  #advance() {
    this.timers.clearTimeout(this.introTimer);
    this.introTimer = null;
    this.introEndsAt = null;
    if (this.readyTvs === 0 || this.queue.length === 0) {
      this.current = null;
      this.phase = 'idle';
      return;
    }
    this.current = this.queue.shift();
    this.phase = 'intro';
    this.introEndsAt = this.now() + this.introMs;
    this.introTimer = this.timers.setTimeout(() => {
      this.introTimer = null;
      if (this.phase === 'intro') {
        this.#startPlaying();
        this.#changed();
      }
    }, this.introMs);
  }

  #startPlaying() {
    this.timers.clearTimeout(this.introTimer);
    this.introTimer = null;
    this.introEndsAt = null;
    this.phase = 'playing';
  }

  #changed() {
    this.emit('change');
  }
}
