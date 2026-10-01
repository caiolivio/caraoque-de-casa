// Busca de vídeos no YouTube.
// Com YOUTUBE_API_KEY usa a API oficial (filtra vídeos que podem ser incorporados).
// Sem chave, lê a página de resultados do YouTube (pode quebrar se o YouTube mudar o HTML).
// Links colados (youtube.com/watch?v=..., youtu.be/...) são resolvidos direto.

const CACHE_MS = 30 * 60_000;
const MAX_RESULTS = 15;
const cache = new Map();
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export class SearchError extends Error {}

export function extractVideoId(text) {
  const match = text.trim().match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i,
  );
  return match ? match[1] : null;
}

export async function searchVideos(query, { apiKey, karaokeOnly = true } = {}) {
  const text = String(query ?? '').trim().slice(0, 150);
  if (!text) return [];

  const id = extractVideoId(text);
  if (id) return [await lookupVideo(id)];

  const q = karaokeOnly && !/karaok/i.test(text) ? `${text} karaoke` : text;
  const key = `${apiKey ? 'api' : 'web'}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;

  let results;
  if (apiKey) {
    try {
      results = await searchApi(q, apiKey);
    } catch (err) {
      console.warn(`[busca] API do YouTube falhou (${err.message}); tentando pela página do YouTube.`);
      results = await searchWeb(q);
    }
  } else {
    results = await searchWeb(q);
  }
  cache.set(key, { at: Date.now(), results });
  return results;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new SearchError(`HTTP ${res.status}`);
  return res.json();
}

async function lookupVideo(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const data = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    return { videoId, title: data.title, channel: data.author_name ?? '', duration: '' };
  } catch {
    // Vídeo privado, removido ou sem rede: devolve mesmo assim; a TV pula se não tocar.
    return { videoId, title: 'Vídeo do YouTube', channel: '', duration: '' };
  }
}

async function searchApi(q, apiKey) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: String(MAX_RESULTS),
    regionCode: 'BR',
    relevanceLanguage: 'pt',
    q,
    key: apiKey,
  });
  const search = await getJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const items = (search.items ?? []).filter((i) => i.id?.videoId);
  if (!items.length) return [];

  const ids = items.map((i) => i.id.videoId).join(',');
  const details = await getJson(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${apiKey}`,
  ).catch(() => ({ items: [] }));
  const durations = new Map((details.items ?? []).map((d) => [d.id, formatIsoDuration(d.contentDetails?.duration)]));

  return items.map((i) => ({
    videoId: i.id.videoId,
    title: decodeEntities(i.snippet?.title ?? ''),
    channel: decodeEntities(i.snippet?.channelTitle ?? ''),
    duration: durations.get(i.id.videoId) ?? '',
  }));
}

async function searchWeb(q) {
  const params = new URLSearchParams({ search_query: q, hl: 'pt-BR', gl: 'BR', sp: 'EgIQAQ==' }); // sp = só vídeos
  let html;
  try {
    const res = await fetch(`https://www.youtube.com/results?${params}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9', Cookie: 'CONSENT=YES+1' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    throw new SearchError(`Não consegui falar com o YouTube (${err.message}).`);
  }
  const results = parseSearchPage(html);
  if (!results) {
    throw new SearchError(
      'O YouTube mudou a página de busca. Configure YOUTUBE_API_KEY no arquivo .env ou cole o link do vídeo.',
    );
  }
  return results;
}

/** Extrai os vídeos do ytInitialData da página de resultados. Retorna null se o formato não for reconhecido. */
export function parseSearchPage(html) {
  const start = html.indexOf('ytInitialData = ');
  if (start === -1) return null;
  const jsonStart = html.indexOf('{', start);
  const jsonEnd = html.indexOf(';</script>', jsonStart);
  if (jsonStart === -1 || jsonEnd === -1) return null;
  let data;
  try {
    data = JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch {
    return null;
  }

  const results = [];
  const seen = new Set();
  const walk = (node) => {
    if (results.length >= MAX_RESULTS || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const v = node.videoRenderer;
    if (v?.videoId && !seen.has(v.videoId)) {
      seen.add(v.videoId);
      const duration = v.lengthText?.simpleText ?? '';
      if (duration) {
        // sem duração = transmissão ao vivo; não serve para karaokê
        results.push({
          videoId: v.videoId,
          title: runsText(v.title),
          channel: runsText(v.ownerText ?? v.longBylineText),
          duration,
        });
      }
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(data);
  return results;
}

function runsText(text) {
  if (!text) return '';
  if (typeof text.simpleText === 'string') return text.simpleText;
  return (text.runs ?? []).map((r) => r.text).join('');
}

export function formatIsoDuration(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return '';
  const [h, min, s] = [m[1], m[2], m[3]].map((x) => Number(x ?? 0));
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(min).padStart(2, '0')}:${ss}` : `${min}:${ss}`;
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
