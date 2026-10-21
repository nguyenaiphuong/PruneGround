(() => {
  const nav = document.querySelector('.site-nav');
  const menuButton = document.querySelector('.menu-button');
  const navLinks = document.querySelector('.nav-links');

  const syncNav = () => nav?.classList.toggle('scrolled', window.scrollY > 16);
  syncNav();
  window.addEventListener('scroll', syncNav, { passive: true });

  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    navLinks?.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
  });

  navLinks?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menuButton?.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('open');
      document.body.classList.remove('menu-open');
    });
  });

  const revealItems = document.querySelectorAll('.reveal');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  revealItems.forEach((item) => {
    item.style.setProperty('--delay', `${item.dataset.delay || 0}ms`);
  });

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -45px' });

    revealItems.forEach((item) => revealObserver.observe(item));
  }

  const resultTabs = [...document.querySelectorAll('[data-result-tab]')];
  resultTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const selected = tab.dataset.resultTab;
      resultTabs.forEach((candidate) => {
        const active = candidate === tab;
        candidate.setAttribute('aria-selected', String(active));
        candidate.tabIndex = active ? 0 : -1;
      });

      document.querySelectorAll('.result-panel').forEach((panel) => {
        panel.hidden = panel.id !== `panel-${selected}`;
      });
    });

    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const current = resultTabs.indexOf(tab);
      const next = resultTabs[(current + offset + resultTabs.length) % resultTabs.length];
      next.focus();
      next.click();
    });
  });

  const copyButton = document.querySelector('#copy-bibtex');
  const bibtex = document.querySelector('#bibtex');
  const copyStatus = document.querySelector('#copy-status');

  copyButton?.addEventListener('click', async () => {
    const value = bibtex?.textContent.trim() || '';
    try {
      await navigator.clipboard.writeText(value);
      copyButton.textContent = 'Copied';
      if (copyStatus) copyStatus.textContent = 'BibTeX copied to clipboard.';
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(bibtex);
      selection.removeAllRanges();
      selection.addRange(range);
      if (copyStatus) copyStatus.textContent = 'BibTeX selected — press Ctrl/Cmd+C to copy.';
    }

    window.setTimeout(() => {
      copyButton.textContent = 'Copy';
      if (copyStatus) copyStatus.textContent = '';
    }, 2400);
  });

  const lightbox = document.querySelector('#lightbox');
  const lightboxImage = document.querySelector('#lightbox-image');
  const lightboxClose = document.querySelector('.lightbox-close');

  document.querySelectorAll('[data-lightbox]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (!lightbox || !lightboxImage) return;
      lightboxImage.src = trigger.dataset.lightbox;
      lightboxImage.alt = trigger.querySelector('img')?.alt || 'Expanded research figure';
      lightbox.showModal();
    });
  });

  lightboxClose?.addEventListener('click', () => lightbox?.close());
  lightbox?.addEventListener('click', (event) => {
    if (event.target === lightbox) lightbox.close();
  });
})();
