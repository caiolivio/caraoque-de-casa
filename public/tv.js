// Tela da TV: obedece o estado do servidor e avisa quando o vídeo termina ou falha.
(() => {
  const socket = io();
  const $ = (id) => document.getElementById(id);

  let state = null;
  let player = null;
  let playerReady = false;
  let started = new URLSearchParams(location.search).has('autostart');
  let loadedItemId = null; // item cujo vídeo está carregado no player
  let cuedItemId = null;
  let countdownTimer = null;
  let introEndsAt = 0;
  let stallTimer = null;

  socket.on('branding', (info) => window.applyBranding(info));

  // ---- Início (o navegador só libera som depois de uma interação) ----
  function start() {
    if (started && $('start').hidden) return;
    started = true;
    $('start').hidden = true;
    document.documentElement.requestFullscreen?.().catch(() => {});
    socket.emit('tv:ready');
    render();
  }
  if (started) $('start').hidden = true;
  $('start').addEventListener('click', start);

  document.addEventListener('keydown', (e) => {
    if (!started) return start();
    if (e.code === 'Space') {
      e.preventDefault();
      socket.emit('host:togglePause');
    } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'n') {
      socket.emit('host:skip');
    } else if (e.key.toLowerCase() === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    }
  });

  socket.on('connect', () => {
    if (started) socket.emit('tv:ready');
  });

  socket.on('state', (s) => {
    state = s;
    introEndsAt = Date.now() + s.introRemainingMs;
    render();
  });

  socket.on('toast', ({ message }) => showToast(message));

  socket.on('tv:command', ({ type }) => {
    if (type === 'restart' && playerReady && loadedItemId) {
      player.seekTo(0, true);
      player.playVideo();
    }
  });

  // ---- Player do YouTube ----
  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        origin: location.origin,
      },
      events: {
        onReady: () => {
          playerReady = true;
          render();
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) clearTimeout(stallTimer);
          if (e.data === YT.PlayerState.ENDED && loadedItemId) {
            socket.emit('tv:ended', { itemId: loadedItemId });
          }
        },
        onError: (e) => {
          const itemId = loadedItemId ?? cuedItemId;
          if (itemId) socket.emit('tv:error', { itemId, code: e.data });
        },
      },
    });
  };

  // ---- Renderização ----
  function render() {
    if (!state) return;
    const { phase, current, queue } = state;

    $('screen-idle').hidden = phase !== 'idle';
    $('screen-intro').hidden = phase !== 'intro';
    $('hud').hidden = !(phase === 'playing' || phase === 'paused');
    $('paused').hidden = phase !== 'paused';
    $('player-wrap').classList.toggle('visible', phase === 'playing' || phase === 'paused');

    if (phase === 'idle') {
      $('idle-status').textContent = !started
        ? ''
        : queue.length
          ? 'Preparando a próxima música…'
          : 'A fila está vazia. Quem começa?';
      stopVideo();
    }

    if (phase === 'intro' && current) {
      $('intro-singer').textContent = `${current.singer.emoji} ${current.singer.name}`;
      $('intro-singer').style.color = current.singer.color;
      $('intro-title').textContent = current.title;
      startCountdown();
      if (playerReady && cuedItemId !== current.id) {
        stopVideo();
        player.cueVideoById(current.videoId);
        cuedItemId = current.id;
      }
    } else {
      stopCountdown();
    }

    if ((phase === 'playing' || phase === 'paused') && current) {
      const badge = $('hud-singer');
      badge.textContent = `${current.singer.emoji} ${current.singer.name}`;
      badge.style.borderColor = current.singer.color;
      renderUpNext(queue);

      if (playerReady && started) {
        if (loadedItemId !== current.id) {
          player.loadVideoById(current.videoId);
          player.setVolume(state.volume);
          loadedItemId = current.id;
          cuedItemId = current.id;
          watchForStall();
        } else if (phase === 'playing' && player.getPlayerState() === YT.PlayerState.PAUSED) {
          player.playVideo();
        }
        if (phase === 'paused') player.pauseVideo();
      }
    }

    if (playerReady) player.setVolume(state.volume);
  }

  function renderUpNext(queue) {
    const box = $('hud-next');
    box.replaceChildren();
    if (!queue.length) return;
    const title = document.createElement('div');
    title.className = 'next-title';
    title.textContent = 'A seguir';
    box.append(title);
    for (const item of queue.slice(0, 3)) {
      const row = document.createElement('div');
      row.className = 'next-row';
      const who = document.createElement('strong');
      who.textContent = `${item.singer.emoji} ${item.singer.name}`;
      who.style.color = item.singer.color;
      const what = document.createElement('span');
      what.textContent = item.title;
      row.append(who, what);
      box.append(row);
    }
    if (queue.length > 3) {
      const more = document.createElement('div');
      more.className = 'next-more';
      more.textContent = `+${queue.length - 3} na fila`;
      box.append(more);
    }
  }

  function stopVideo() {
    if (playerReady && (loadedItemId || cuedItemId)) player.stopVideo();
    loadedItemId = null;
    cuedItemId = null;
    clearTimeout(stallTimer);
  }

  // Se o vídeo não começar (autoplay bloqueado pelo navegador), pede um clique.
  function watchForStall() {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      const s = player.getPlayerState();
      if (state?.phase === 'playing' && s !== YT.PlayerState.PLAYING && s !== YT.PlayerState.BUFFERING) {
        showToast('O navegador bloqueou o som. Clique na tela para tocar.');
        const unlock = () => {
          player.playVideo();
          document.removeEventListener('click', unlock);
        };
        document.addEventListener('click', unlock);
      }
    }, 8000);
  }

  function startCountdown() {
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((introEndsAt - Date.now()) / 1000));
      $('intro-count').textContent = seconds || '🎶';
    };
    tick();
    countdownTimer ??= setInterval(tick, 250);
  }

  function stopCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  let toastTimer = null;
  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 6000);
  }
})();
