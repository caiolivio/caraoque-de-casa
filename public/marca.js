// Marca "Life is a Huli": aplica a foto de fundo e o logo enviados na administração.
// Elementos com [data-brand] mostram o logo (ou o nome, se não houver logo).
window.applyBranding = (info) => {
  const { fundo, logo } = info?.media ?? {};
  const root = document.documentElement;
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
