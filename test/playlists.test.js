import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Playlists } from '../server/playlists.js';
import { KaraokeError } from '../server/karaoke.js';
import { detectImageType } from '../server/media.js';

const video = (n) => ({ videoId: `video${String(n).padStart(6, '0')}`, title: `Música ${n}` });

test('começa com a lista Life is a Huli', () => {
  const p = new Playlists();
  assert.deepEqual(p.list().map((l) => l.name), ['Life is a Huli']);
});

test('cria listas com id único, renomeia e exclui', () => {
  const p = new Playlists();
  const a = p.create('Anos 80');
  const b = p.create('Anos 80');
  assert.equal(a.id, 'anos-80');
  assert.equal(b.id, 'anos-80-2');
  p.rename(a.id, 'Anos 80 ✨');
  assert.equal(p.list()[1].name, 'Anos 80 ✨');
  p.remove(b.id);
  assert.equal(p.list().length, 2);
  assert.throws(() => p.create('   '), KaraokeError);
  assert.throws(() => p.rename('nao-existe', 'x'), KaraokeError);
});

test('adiciona, ordena e remove músicas sem repetir', () => {
  const p = new Playlists();
  const id = 'life-is-a-huli';
  p.addItem(id, video(1));
  p.addItem(id, video(2));
  p.addItem(id, video(3));
  assert.throws(() => p.addItem(id, video(1)), KaraokeError);
  p.moveItem(id, video(3).videoId, 'top');
  p.moveItem(id, video(1).videoId, 'down');
  assert.deepEqual(p.list()[0].items.map((i) => i.title), ['Música 3', 'Música 2', 'Música 1']);
  p.removeItem(id, video(2).videoId);
  assert.equal(p.list()[0].items.length, 2);
});

test('reordena as listas', () => {
  const p = new Playlists();
  p.create('Rock');
  p.moveList('rock', 'up');
  assert.deepEqual(p.list().map((l) => l.id), ['rock', 'life-is-a-huli']);
});

test('salva e carrega', () => {
  const p = new Playlists();
  p.addItem('life-is-a-huli', video(1));
  const again = new Playlists(JSON.parse(JSON.stringify(p)));
  assert.equal(again.list()[0].items[0].title, 'Música 1');
});

test('reconhece imagens pelo conteúdo', () => {
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(detectImageType(Buffer.from('89504e470d0a1a0a0000000d', 'hex')), 'image/png');
  assert.equal(detectImageType(Buffer.from('RIFF0000WEBPVP8 ')), 'image/webp');
  assert.equal(detectImageType(Buffer.from('<svg onload=alert(1)>')), null);
});

test('reconhece vídeos pelo conteúdo', async () => {
  const { detectVideoType } = await import('../server/media.js');
  assert.equal(detectVideoType(Buffer.from('000000206674797069736f6d00000200', 'hex')), 'video/mp4');
  assert.equal(detectVideoType(Buffer.from('1a45dfa3a3428680428101425ff7', 'hex')), 'video/webm');
  assert.equal(detectVideoType(Buffer.from('<html>nada aqui</html>')), null);
});
