// Página de administração: PIN, listas de músicas e aparência (foto de fundo e logo).
(() => {
  const $ = (id) => document.getElementById(id);
  const socket = io();

  let pin = null;
  try {
    pin = JSON.parse(localStorage.getItem('karaoke:pin'));
  } catch {}

  let playlists = [];
  const searches = {}; // por lista: { query, status, results }

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    el.append(...children.flat().filter((c) => c != null && c !== false));
    return el;
  }

  async function api(method, path, body, contentType) {
    const headers = {};
    if (pin) headers['x-host-pin'] = pin;
    let payload;
    if (body instanceof Blob) {
      payload = body;
      headers['Content-Type'] = contentType || 'application/octet-stream';
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, { method, headers, body: payload });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) showPinForm();
    if (!res.ok) throw new Error(data.error || 'Algo deu errado.');
    return data;
  }

  const run = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      toast(err.message);
    }
  };

  // ---- Acesso ----
  function showPinForm() {
    $('pin-form').hidden = false;
    $('panel').hidden = true;
  }

  async function check() {
    try {
      const info = await api('GET', '/api/admin/check');
      $('pin-form').hidden = true;
      $('panel').hidden = false;
      if (info.pin) {
        $('access').hidden = false;
        $('pin-value').textContent = info.pin;
        $('tv-url').textContent = info.tvUrl;
        $('join-url').textContent = info.joinUrl;
      }
      const { playlists: lists } = await (await fetch('/api/playlists')).json();
      playlists = lists;
      renderLists();
    } catch {
      showPinForm();
    }
  }

  $('pin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    pin = $('pin-input').value.trim();
    try {
      localStorage.setItem('karaoke:pin', JSON.stringify(pin));
    } catch {}
    $('pin-input').value = '';
    check().then(() => {
      if ($('panel').hidden) toast('PIN errado.');
    });
  });

  // ---- Listas ----
  $('new-list').addEventListener('submit', run(async (e) => {
    e.preventDefault();
    const name = $('new-list-name').value.trim();
    if (!name) return;
    await api('POST', '/api/admin/playlists', { name });
    $('new-list-name').value = '';
    toast(`Lista “${name}” criada.`);
  }));

  socket.on('playlists', (lists) => {
    playlists = lists;
    if (!$('panel').hidden) renderLists();
  });

  const listPath = (id) => `/api/admin/playlists/${encodeURIComponent(id)}`;

  function renderLists() {
    // Guarda o que estava sendo digitado para não perder ao redesenhar.
    const typing = document.activeElement?.dataset?.searchFor;
    $('lists').replaceChildren(...playlists.map((p, i) => listCard(p, i)));
    if (typing) document.querySelector(`[data-search-for="${CSS.escape(typing)}"]`)?.focus();
  }

  function listCard(p, index) {
    const search = (searches[p.id] ??= { query: '', status: '', results: [] });
    const inList = new Set(p.items.map((i) => i.videoId));

    const input = h('input', {
      type: 'search',
      placeholder: 'Buscar no YouTube ou colar link',
      'data-search-for': p.id,
      value: search.query,
      oninput: (e) => (search.query = e.target.value),
    });

    return h('div', { class: 'list-card' },
      h('div', { class: 'list-head' },
        h('h3', {}, `⭐ ${p.name}`, h('span', { class: 'muted small' }, ` · ${p.items.length} ${p.items.length === 1 ? 'música' : 'músicas'}`)),
        h('div', { class: 'row tight' },
          h('button', { type: 'button', title: 'Subir lista', disabled: index === 0, onclick: run(() => api('POST', `${listPath(p.id)}/move`, { where: 'up' })) }, '↑'),
          h('button', { type: 'button', title: 'Descer lista', disabled: index === playlists.length - 1, onclick: run(() => api('POST', `${listPath(p.id)}/move`, { where: 'down' })) }, '↓'),
          h('button', {
            type: 'button',
            onclick: run(async () => {
              const name = prompt('Novo nome da lista:', p.name);
              if (name?.trim()) await api('PATCH', listPath(p.id), { name });
            }),
          }, 'Renomear'),
          h('button', {
            type: 'button',
            class: 'danger',
            onclick: run(async () => {
              if (confirm(`Excluir a lista “${p.name}”? As músicas não saem do YouTube, só da lista.`)) {
                await api('DELETE', listPath(p.id));
              }
            }),
          }, 'Excluir'),
        ),
      ),
      p.items.length
        ? h('ul', { class: 'list' }, p.items.map((item, i) =>
            h('li', { class: 'item' },
              h('span', { class: 'pos' }, String(i + 1)),
              thumb(item),
              h('div', { class: 'info' },
                h('div', { class: 'title' }, item.title),
                h('div', { class: 'sub' }, [item.channel, item.duration].filter(Boolean).join(' · ')),
              ),
              h('div', { class: 'actions' },
                h('button', { type: 'button', title: 'Subir', disabled: i === 0, onclick: run(() => api('POST', `${listPath(p.id)}/items/${item.videoId}/move`, { where: 'up' })) }, '↑'),
                h('button', { type: 'button', title: 'Descer', disabled: i === p.items.length - 1, onclick: run(() => api('POST', `${listPath(p.id)}/items/${item.videoId}/move`, { where: 'down' })) }, '↓'),
                h('button', { type: 'button', class: 'danger', title: 'Tirar da lista', onclick: run(() => api('DELETE', `${listPath(p.id)}/items/${item.videoId}`)) }, '✕'),
              ),
            ),
          ))
        : h('p', { class: 'muted small' }, 'Lista vazia. Busque abaixo para adicionar músicas.'),
      h('form', {
        class: 'row add-form',
        onsubmit: run(async (e) => {
          e.preventDefault();
          const q = search.query.trim();
          if (!q) return;
          search.status = 'Buscando…';
          search.results = [];
          renderLists();
          try {
            const res = await fetch(`/api/search?${new URLSearchParams({ q, karaoke: '0' })}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            search.results = data.results;
            search.status = data.results.length ? '' : 'Nada encontrado.';
          } catch (err) {
            search.status = err.message || 'A busca falhou.';
          }
          renderLists();
        }),
      }, input, h('button', { type: 'submit', class: 'primary' }, 'Buscar')),
      search.status ? h('p', { class: 'muted small' }, search.status) : null,
      search.results.length
        ? h('ul', { class: 'list results' }, search.results.map((v) =>
            h('li', { class: 'item' },
              thumb(v),
              h('div', { class: 'info' },
                h('div', { class: 'title' }, v.title),
                h('div', { class: 'sub' }, [v.channel, v.duration].filter(Boolean).join(' · ')),
              ),
              inList.has(v.videoId)
                ? h('button', { type: 'button', class: 'add done', disabled: true }, '✓ Na lista')
                : h('button', { type: 'button', class: 'add primary', onclick: run(() => api('POST', `${listPath(p.id)}/items`, { video: v })) }, '+ Lista'),
            ),
          ))
        : null,
      search.results.length
        ? h('button', { type: 'button', class: 'link', onclick: () => { search.results = []; search.status = ''; renderLists(); } }, 'Fechar resultados')
        : null,
    );
  }

  function thumb(v) {
    return h('div', { class: 'thumb' },
      h('img', { src: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, alt: '', loading: 'lazy' }),
    );
  }

  // ---- Aparência ----
  function renderMedia(info) {
    const { fundo, logo } = info?.media ?? {};
    const bg = document.querySelector('.preview-bg');
    bg.style.backgroundImage = fundo ? `url("${fundo}")` : '';
    bg.textContent = fundo ? '' : 'Sem foto (usando o degradê padrão)';
    const lg = document.querySelector('.preview-logo');
    lg.replaceChildren(logo ? h('img', { src: logo, alt: 'Logo' }) : 'Sem logo (mostrando o nome “Life is a Huli”)');
    const { video } = info?.media ?? {};
    const pv = document.querySelector('.preview-video');
    if (video) {
      if (pv.querySelector('video')?.getAttribute('src') !== video) {
        const v = h('video', { src: video, muted: '', loop: '', autoplay: '', playsinline: '' });
        v.muted = true;
        pv.replaceChildren(v);
      }
    } else {
      pv.replaceChildren('Sem vídeo (usando a foto ou o degradê)');
    }
    document.querySelector('[data-kind="video"] .remove').disabled = !video;
    document.querySelector('[data-kind="fundo"] .remove').disabled = !fundo;
    document.querySelector('[data-kind="logo"] .remove').disabled = !logo;
  }

  document.querySelectorAll('.media').forEach((box) => {
    const kind = box.dataset.kind;
    box.querySelector('input[type=file]').addEventListener('change', run(async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const limit = kind === 'video' ? 100 : 15;
      if (file.size > limit * 1024 * 1024) throw new Error(`Arquivo grande demais (máximo ${limit} MB).`);
      toast('Enviando…');
      await api('PUT', `/api/admin/media/${kind}`, file, file.type);
      const done = { fundo: 'Foto de fundo atualizada.', logo: 'Logo atualizado.', video: 'Vídeo de fundo atualizado.' };
      toast(`${done[kind]} A TV já mudou.`);
    }));
    box.querySelector('.remove').addEventListener('click', run(async () => {
      if (confirm('Remover esta imagem?')) await api('DELETE', `/api/admin/media/${kind}`);
    }));
  });

  socket.on('branding', (info) => {
    window.applyBranding(info);
    renderMedia(info);
  });
  fetch('/api/info').then((r) => r.json()).then(renderMedia);

  let toastTimer = null;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  check();
})();
