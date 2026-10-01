// Tela do celular: entrar com nome, buscar músicas, ver a fila e controles do anfitrião.
(() => {
  const socket = io();
  const $ = (id) => document.getElementById(id);

  const EMOJIS = ['🎤', '🎸', '🦄', '🐱', '🐶', '🦊', '🐼', '🐸', '🌟', '🔥', '🍕', '👑', '💃', '🕺', '🤘', '😎'];
  const COLORS = ['#ff4fa3', '#7c5cff', '#22d3ee', '#facc15', '#4ade80', '#fb923c', '#f87171', '#a78bfa'];

  const storage = {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    },
  };

  let me = storage.get('karaoke:me');
  let hostPin = storage.get('karaoke:pin');
  let isHost = false;
  let state = null;
  let lastResults = [];
  let lastTurnAlert = null;

  // crypto.randomUUID só existe em https; pelo IP da rede local a página é http.
  const randomId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  // Cria elementos sem innerHTML (títulos de vídeo nunca viram HTML).
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    el.append(...children.flat().filter((c) => c != null && c !== false));
    return el;
  }

  const emitAsync = (event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

  // ---- Entrar ----
  let chosenEmoji = me?.emoji ?? EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  function renderEmojiGrid() {
    $('emoji-grid').replaceChildren(
      ...EMOJIS.map((e) =>
        h('button', {
          type: 'button',
          class: e === chosenEmoji ? 'selected' : '',
          onclick: () => {
            chosenEmoji = e;
            renderEmojiGrid();
          },
        }, e),
      ),
    );
  }

  function showJoin() {
    $('join-name').value = me?.name ?? '';
    renderEmojiGrid();
    $('join').hidden = false;
    $('app').hidden = true;
    $('join-name').focus();
  }

  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('join-name').value.trim();
    if (!name) return;
    me = {
      id: me?.id ?? randomId(),
      name,
      emoji: chosenEmoji,
      color: me?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    storage.set('karaoke:me', me);
    showApp();
  });

  function showApp() {
    $('join').hidden = true;
    $('app').hidden = false;
    const btn = $('me');
    btn.textContent = `${me.emoji} ${me.name}`;
    btn.style.borderColor = me.color;
    render();
  }

  $('me').addEventListener('click', showJoin);

  // ---- Abas ----
  function showTab(name) {
    for (const tab of ['search', 'queue', 'host']) $(`tab-${tab}`).hidden = tab !== name;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    if (name === 'search') $('search-input').focus();
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ---- Busca ----
  $('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('search-input').value.trim();
    if (!q) return;
    $('search-input').blur();
    $('search-status').textContent = 'Buscando…';
    $('results').replaceChildren();
    try {
      const params = new URLSearchParams({ q, karaoke: $('karaoke-only').checked ? '1' : '0' });
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      lastResults = data.results;
      $('search-status').textContent = lastResults.length ? '' : 'Nada encontrado. Tente outro nome.';
      renderResults();
    } catch (err) {
      $('search-status').textContent = err.message || 'A busca falhou.';
    }
  });

  function inQueue(videoId) {
    if (!state) return false;
    return state.current?.videoId === videoId || state.queue.some((i) => i.videoId === videoId);
  }

  function renderResults() {
    $('results').replaceChildren(
      ...lastResults.map((v) => {
        const queued = inQueue(v.videoId);
        return h('li', { class: 'item' },
          thumb(v.videoId, v.duration),
          h('div', { class: 'info' },
            h('div', { class: 'title' }, v.title),
            h('div', { class: 'sub' }, v.channel),
          ),
          h('button', {
            type: 'button',
            class: queued ? 'add done' : 'add primary',
            disabled: queued,
            onclick: (e) => addToQueue(v, e.currentTarget),
          }, queued ? '✓ Na fila' : '+ Fila'),
        );
      }),
    );
  }

  async function addToQueue(video, button) {
    button.disabled = true;
    const res = await emitAsync('queue:add', { singer: me, video });
    if (res.error) {
      button.disabled = false;
      return toast(res.error);
    }
    toast(res.ahead === 0 ? 'Adicionada! Você é o próximo 🎤' : `Adicionada! ${plural(res.ahead, 'música', 'músicas')} antes da sua.`);
  }

  function thumb(videoId, duration) {
    return h('div', { class: 'thumb' },
      h('img', { src: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, alt: '', loading: 'lazy' }),
      duration ? h('span', { class: 'duration' }, duration) : null,
    );
  }

  // ---- Fila ----
  function renderQueue() {
    const { current, queue, phase, tvReady } = state;
    $('queue-count').textContent = queue.length ? String(queue.length) : '';

    // Resumo pessoal
    const mine = queue.findIndex((i) => i.singer.id === me?.id);
    const myCurrent = current?.singer.id === me?.id;
    $('my-summary').textContent = myCurrent
      ? '🎤 Agora é você!'
      : mine >= 0
        ? `Sua próxima música: ${plural(mine + (current ? 1 : 0), 'música', 'músicas')} antes`
        : 'Você ainda não tem música na fila.';

    // Tocando agora
    $('queue-current').replaceChildren(
      current
        ? h('div', { class: 'current' },
            h('div', { class: 'current-label' }, phase === 'intro' ? 'Já vai começar' : phase === 'paused' ? 'Pausado' : 'Tocando agora'),
            itemRow(current, { isCurrent: true }),
          )
        : !tvReady
          ? h('p', { class: 'muted center' }, 'Aguardando a TV ligar… (abra /tv no PC e clique para começar)')
          : '',
    );

    $('queue').replaceChildren(...queue.map((item, i) => itemRow(item, { index: i, total: queue.length })));
    $('queue-empty').hidden = queue.length > 0 || !!current;
  }

  function itemRow(item, { isCurrent = false, index = 0, total = 0 }) {
    const mine = item.singer.id === me?.id;
    const actions = [];
    if (isHost && !isCurrent) {
      actions.push(
        h('button', { type: 'button', title: 'Para o topo', disabled: index === 0, onclick: () => socket.emit('host:move', { itemId: item.id, where: 'top' }) }, '⤒'),
        h('button', { type: 'button', title: 'Subir', disabled: index === 0, onclick: () => socket.emit('host:move', { itemId: item.id, where: 'up' }) }, '↑'),
        h('button', { type: 'button', title: 'Descer', disabled: index === total - 1, onclick: () => socket.emit('host:move', { itemId: item.id, where: 'down' }) }, '↓'),
      );
    }
    if (isHost || mine) {
      actions.push(
        h('button', {
          type: 'button',
          class: 'danger',
          title: isCurrent ? 'Pular' : 'Remover',
          onclick: async () => {
            if (!confirm(isCurrent ? `Pular “${item.title}”?` : `Tirar “${item.title}” da fila?`)) return;
            const res = await emitAsync('queue:remove', { itemId: item.id, singerId: me.id });
            if (res.error) toast(res.error);
          },
        }, '✕'),
      );
    }
    return h('li', { class: `item${mine ? ' mine' : ''}` },
      isCurrent ? null : h('span', { class: 'pos' }, String(index + 1)),
      thumb(item.videoId, item.duration),
      h('div', { class: 'info' },
        h('div', { class: 'title' }, item.title),
        h('div', { class: 'sub singer', style: { color: item.singer.color } }, `${item.singer.emoji} ${item.singer.name}`),
      ),
      actions.length ? h('div', { class: 'actions' }, actions) : null,
    );
  }

  function renderNow() {
    const { current, phase } = state;
    $('now').textContent = current
      ? `${phase === 'intro' ? 'Já vai' : '▶'} ${current.singer.emoji} ${current.singer.name}`
      : '';

    const myTurn = current?.singer.id === me?.id && phase === 'intro';
    $('my-turn').hidden = !myTurn;
    if (myTurn && lastTurnAlert !== current.id) {
      lastTurnAlert = current.id;
      navigator.vibrate?.([200, 100, 200]);
    }
  }

  // ---- Anfitrião ----
  async function authHost(pin) {
    const res = await emitAsync('host:auth', { pin });
    isHost = !res.error;
    if (isHost) {
      hostPin = pin;
      storage.set('karaoke:pin', pin);
    } else if (pin === hostPin) {
      hostPin = null;
      storage.set('karaoke:pin', null);
    }
    renderHost();
    if (state) renderQueue();
    return res;
  }

  $('pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await authHost($('pin-input').value.trim());
    if (res.error) toast(res.error);
    else toast('Modo anfitrião ativado 🎛️');
    $('pin-input').value = '';
  });

  $('host-logout').addEventListener('click', () => {
    socket.emit('host:logout');
    isHost = false;
    hostPin = null;
    storage.set('karaoke:pin', null);
    renderHost();
    renderQueue();
  });

  const hostAction = (event, payload) => async () => {
    const res = await emitAsync(event, payload);
    if (res.error) toast(res.error);
  };
  $('host-pause').addEventListener('click', hostAction('host:togglePause'));
  $('host-skip').addEventListener('click', hostAction('host:skip'));
  $('host-restart').addEventListener('click', hostAction('host:restart'));
  $('host-volume').addEventListener('input', (e) => ($('host-volume-value').textContent = e.target.value));
  $('host-volume').addEventListener('change', (e) => socket.emit('host:volume', { volume: Number(e.target.value) }));

  function renderHost() {
    $('pin-form').hidden = isHost;
    $('host-panel').hidden = !isHost;
    if (!isHost || !state) return;
    $('host-pause').textContent = state.phase === 'paused' ? '▶️ Continuar' : state.phase === 'intro' ? '▶️ Começar já' : '⏸ Pausar';
    if (document.activeElement !== $('host-volume')) {
      $('host-volume').value = state.volume;
      $('host-volume-value').textContent = state.volume;
    }
  }

  // ---- Conexão ----
  socket.on('connect', () => {
    $('offline').hidden = true;
    if (hostPin) authHost(hostPin);
  });
  socket.on('disconnect', () => ($('offline').hidden = false));

  socket.on('state', (s) => {
    state = s;
    render();
  });

  socket.on('toast', ({ message, singerId }) => {
    if (!singerId || singerId === me?.id) toast(message);
  });

  function render() {
    if (!state || $('app').hidden) return;
    renderNow();
    renderQueue();
    renderHost();
    if (lastResults.length) renderResults();
  }

  // ---- Utilidades ----
  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  }

  let toastTimer = null;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  if (me) showApp();
  else showJoin();
})();
