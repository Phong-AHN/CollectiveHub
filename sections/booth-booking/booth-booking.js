defineModule('theme-booth-booking', () => {
  const LOADER_URL = 'https://unpkg.com/@expofp/floorplan';

  const normalizeUrl = (value) => {
    const url = String(value || '').trim();
    if (!/^https?:\/\//i.test(url)) return '';
    return url.replace(/\/+$/, '');
  };

  const withConsent = (url, consent) => {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('consent', consent);
      return parsed.toString();
    } catch (error) {
      return url;
    }
  };

  const manifestUrl = (url) => {
    try {
      const parsed = new URL(url);
      parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/manifest.json`;
      return parsed.toString();
    } catch (error) {
      return `${url}/manifest.json`;
    }
  };

  class ThemeBoothBooking extends BaseElement {
    url = '';
    loaded = false;
    observer;
    floorplan;
    handleLoadClick;

    get canvasEl() {
      return this.querySelector('[data-role="canvas"]');
    }

    get statusEl() {
      return this.querySelector('[data-role="status"]');
    }

    get triggerEl() {
      return this.querySelector('[data-role="load"]');
    }

    get fallbackEl() {
      return this.querySelector('[data-role="fallback"]');
    }

    mounted() {
      this.url = normalizeUrl(this.dataset.url);

      if (!this.url) {
        this.#setState('error');
        this.#showFallback();
        return;
      }

      if (this.dataset.loadMode === 'click' && this.triggerEl) {
        this.#setState('idle');
        this.handleLoadClick = () => this.load();
        this.triggerEl.addEventListener('click', this.handleLoadClick);
        return;
      }

      this.#observe();
    }

    unmounted() {
      this.observer?.disconnect();
      this.observer = undefined;

      if (this.handleLoadClick) {
        this.triggerEl?.removeEventListener('click', this.handleLoadClick);
        this.handleLoadClick = undefined;
      }

      this.floorplan?.destroy?.();
      this.floorplan = undefined;

      if (this.canvasEl) this.canvasEl.innerHTML = '';
      this.loaded = false;
    }

    async load() {
      if (this.loaded || !this.canvasEl) return;
      this.loaded = true;
      this.#setState('loading');

      try {
        if (this.dataset.embedMode === 'script') {
          await this.#loadScript();
        } else {
          this.#loadIframe();
        }
        this.#setState('ready');
      } catch (error) {
        console.error('[theme-booth-booking]', error);
        // The module loader can be blocked (network, CSP, ad blockers) - the
        // iframe embed still works in those cases, so try it before giving up.
        if (this.dataset.embedMode === 'script') {
          try {
            this.canvasEl.innerHTML = '';
            this.#loadIframe();
            this.#setState('ready');
            return;
          } catch (iframeError) {
            console.error('[theme-booth-booking]', iframeError);
          }
        }
        this.#setState('error');
        this.#showFallback();
      }
    }

    #observe() {
      if (!('IntersectionObserver' in window)) {
        this.load();
        return;
      }

      this.observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          this.observer?.disconnect();
          this.observer = undefined;
          this.load();
        },
        { rootMargin: '300px 0px' },
      );

      this.observer.observe(this);
    }

    #loadIframe() {
      const iframe = document.createElement('iframe');
      iframe.src = withConsent(this.url, this.dataset.consent || 'denied');
      iframe.title = this.dataset.title || 'Floor plan';
      iframe.loading = 'lazy';
      iframe.allow = 'clipboard-read; clipboard-write; fullscreen';
      iframe.setAttribute('allowfullscreen', '');
      this.canvasEl.appendChild(iframe);
    }

    async #loadScript() {
      const { load } = await import(/* webpackIgnore: true */ LOADER_URL);

      this.floorplan = await load(
        { $ref: manifestUrl(this.url) },
        {
          element: `#${this.canvasEl.id}`,
          consent: this.dataset.consent || 'denied',
        },
      );
    }

    #setState(state) {
      this.dataset.state = state;

      if (state === 'error' && this.statusEl) {
        this.statusEl.textContent = this.statusEl.dataset.errorText || this.statusEl.textContent;
      }
    }

    #showFallback() {
      if (this.fallbackEl) this.fallbackEl.hidden = false;
    }
  }

  customElements.define('theme-booth-booking', ThemeBoothBooking);
});
