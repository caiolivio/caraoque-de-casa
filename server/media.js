import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Imagens enviadas pelo anfitrião: foto de fundo e logo.
export const MEDIA_KINDS = ['fundo', 'logo'];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

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
      const type = detectImageType(buf);
      if (!type) throw new Error('Envie uma imagem JPG, PNG ou WebP.');
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
