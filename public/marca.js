// Marca "Life is a Huli": aplica a foto de fundo, o logo e o vídeo de fundo enviados na administração.
// Elementos com [data-brand] mostram o logo (ou o nome, se não houver logo).
// Só a TV tem [data-bg-video]: o vídeo de fundo não aparece nos celulares.
window.applyBranding = (info) => {
  const { fundo, logo, video } = info?.media ?? {};
  const root = document.documentElement;

  const videoBox = document.querySelector('[data-bg-video]');
  if (videoBox) {
    const current = videoBox.querySelector('video');
    if (!video) {
      videoBox.replaceChildren();
    } else if (current?.getAttribute('src') !== video) {
      const v = document.createElement('video');
      Object.assign(v, { src: video, muted: true, loop: true, autoplay: true, playsInline: true });
      v.setAttribute('muted', '');
      videoBox.replaceChildren(v);
      v.play().catch(() => {});
    }
    root.classList.toggle('has-video', !!video);
  }

  if (fundo) root.style.setProperty('--bg-image', `url("${fundo}")`);
  else root.style.removeProperty('--bg-image');
  root.classList.toggle('has-bg', !!fundo);

  document.querySelectorAll('[data-brand]').forEach((el) => {
    if (logo) {
      const img = document.createElement('img');
      img.src = logo;
      img.alt = 'Life is a Huli';
      img.className = 'brand-logo';
      el.replaceChildren(img);
    } else {
      const span = document.createElement('span');
      span.className = 'brand-text';
      span.textContent = 'Life is a Huli';
      el.replaceChildren(span);
    }
  });
  document.querySelectorAll('[data-join-url]').forEach((el) => (el.textContent = info?.joinUrl ?? ''));
};

fetch('/api/info')
  .then((r) => r.json())
  .then(window.applyBranding)
  .catch(() => window.applyBranding(null));
