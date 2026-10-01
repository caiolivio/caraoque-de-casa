import { EventEmitter } from 'node:events';
import { KaraokeError, sanitizeVideo } from './karaoke.js';

// Listas de músicas montadas pelo anfitrião (ex.: "Life is a Huli").
// Emite 'change' a cada alteração.

export const DEFAULT_PLAYLISTS = [{ id: 'life-is-a-huli', name: 'Life is a Huli', items: [] }];

const MAX_NAME = 40;
const MAX_ITEMS = 500;

function slugify(name) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'lista'
  );
}

function cleanName(name) {
  const n = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  if (!n) throw new KaraokeError('Dê um nome para a lista.');
  return n;
}

export class Playlists extends EventEmitter {
  constructor(initial) {
    super();
    const lists = Array.isArray(initial?.playlists) ? initial.playlists : structuredClone(DEFAULT_PLAYLISTS);
    this.playlists = lists.map((p) => ({ id: String(p.id), name: String(p.name), items: Array.isArray(p.items) ? p.items : [] }));
  }

  list() {
    return this.playlists;
  }

  #get(id) {
    const p = this.playlists.find((x) => x.id === id);
    if (!p) throw new KaraokeError('Lista não encontrada.');
    return p;
  }

  create(name) {
    const n = cleanName(name);
    const base = slugify(n);
    let id = base;
    for (let i = 2; this.playlists.some((p) => p.id === id); i++) id = `${base}-${i}`;
    const playlist = { id, name: n, items: [] };
    this.playlists.push(playlist);
    this.#changed();
    return playlist;
  }

  rename(id, name) {
    this.#get(id).name = cleanName(name);
    this.#changed();
  }

  remove(id) {
    this.#get(id);
    this.playlists = this.playlists.filter((p) => p.id !== id);
    this.#changed();
  }

  /** Muda a posição da lista nos botões do celular. */
  moveList(id, where) {
    const index = this.playlists.findIndex((p) => p.id === id);
    if (index === -1) throw new KaraokeError('Lista não encontrada.');
    const target = where === 'up' ? index - 1 : where === 'down' ? index + 1 : index;
    if (target < 0 || target >= this.playlists.length || target === index) return;
    const [p] = this.playlists.splice(index, 1);
    this.playlists.splice(target, 0, p);
    this.#changed();
  }

  addItem(id, video) {
    const p = this.#get(id);
    const { videoId, title, channel, duration } = sanitizeVideo(video);
    if (p.items.some((i) => i.videoId === videoId)) throw new KaraokeError('Essa música já está na lista.');
    if (p.items.length >= MAX_ITEMS) throw new KaraokeError('A lista está cheia.');
    p.items.push({ videoId, title, channel, duration });
    this.#changed();
  }

  removeItem(id, videoId) {
    const p = this.#get(id);
    p.items = p.items.filter((i) => i.videoId !== videoId);
    this.#changed();
  }

  moveItem(id, videoId, where) {
    const p = this.#get(id);
    const index = p.items.findIndex((i) => i.videoId === videoId);
    if (index === -1) return;
    const target = where === 'top' ? 0 : where === 'up' ? index - 1 : where === 'down' ? index + 1 : index;
    if (target < 0 || target >= p.items.length || target === index) return;
    const [item] = p.items.splice(index, 1);
    p.items.splice(target, 0, item);
    this.#changed();
  }

  toJSON() {
    return { playlists: this.playlists };
  }

  #changed() {
    this.emit('change');
  }
}
