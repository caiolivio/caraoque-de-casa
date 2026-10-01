import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Guarda fila, histórico e volume num arquivo JSON, para sobreviver a um reinício do PC.
export function createStore(file) {
  let timer = null;
  let pending = null;

  const flush = () => {
    timer = null;
    if (!pending) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify(pending, null, 2));
      renameSync(`${file}.tmp`, file);
    } catch (err) {
      console.error(`[dados] Não consegui salvar ${file}: ${err.message}`);
    }
    pending = null;
  };

  return {
    load() {
      try {
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        return undefined;
      }
    },
    save(data) {
      pending = data;
      timer ??= setTimeout(flush, 500);
    },
    flush() {
      clearTimeout(timer);
      flush();
    },
  };
}
