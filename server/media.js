import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Arquivos enviados pelo anfitrião: foto de fundo, logo e vídeo de fundo da TV.
export const MEDIA_KINDS = ['fundo', 'logo', 'video'];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

// Vídeo: MP4/MOV (caixa "ftyp") ou WebM (cabeçalho EBML).
export function detectVideoType(buf) {
  if (buf.length < 12) return null;
  if (buf.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return null;
}

// Reconhece o formato pelos primeiros bytes (não confia no que o navegador diz).
export function detectImageType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function createMedia(dir) {
  const metaFile = join(dir, 'midia.json');
  let meta = {};
  try {
    meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  } catch {}

  const saveMeta = () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  };

  return {
    info() {
      const out = {};
      for (const kind of MEDIA_KINDS) {
        out[kind] = meta[kind] && existsSync(join(dir, kind)) ? `/media/${kind}?v=${meta[kind].version}` : null;
      }
      return out;
    },
    get(kind) {
      if (!MEDIA_KINDS.includes(kind) || !meta[kind]) return null;
      const file = join(dir, kind);
      return existsSync(file) ? { file, type: meta[kind].type } : null;
    },
    save(kind, buf) {
      let type;
      if (kind === 'video') {
        type = detectVideoType(buf);
        if (!type) throw new Error('Envie um vídeo MP4 ou WebM.');
        if (buf.length > MAX_VIDEO_BYTES) throw new Error('Vídeo grande demais (máximo 100 MB).');
      } else {
        type = detectImageType(buf);
        if (!type) throw new Error('Envie uma imagem JPG, PNG ou WebP.');
        if (buf.length > MAX_IMAGE_BYTES) throw new Error('Imagem grande demais (máximo 15 MB).');
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, kind), buf);
      meta[kind] = { type, version: Date.now() };
      saveMeta();
    },
    remove(kind) {
      rmSync(join(dir, kind), { force: true });
      delete meta[kind];
      saveMeta();
    },
  };
}
