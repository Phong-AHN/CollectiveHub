defineModule('theme-booth-checkout', () => {
  // ExpoFP hands the visitor over with the booth on the query string and then
  // stops being involved: no reservation exists yet and the booth still reads
  // Available on the floor plan. Everything from here is ours to drive.
  const REQUIRED = ['company', 'contactName', 'email'];

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const money = (value, currency) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return String(value || '');
    try {
      return new Intl.NumberFormat(document.documentElement.lang || 'en', {
        style: 'currency',
        currency: currency || 'USD',
      }).format(amount);
    } catch (error) {
      return `${currency || ''} ${amount.toFixed(2)}`.trim();
    }
  };

  class ThemeBoothCheckout extends BaseElement {
    params;
    booth;
    handleSubmit;

    get formEl() {
      return this.querySelector('[data-role="form"]');
    }

    get messageEl() {
      return this.querySelector('[data-role="message"]');
    }

    get linesEl() {
      return this.querySelector('[data-role="lines"]');
    }

    mounted() {
      this.params = new URLSearchParams(window.location.search);
      this.#renderDebug();

      // Coming back from the payment provider.
      const status = this.params.get('status');
      if (status === 'success') {
        this.dataset.state = 'paid';
        this.#message(this.dataset.successText, 'success');
        return;
      }
      if (status === 'pending') {
        // Money taken, confirmation still settling - do not invite a second payment.
        this.dataset.state = 'paid';
        this.#message(this.dataset.pendingText, 'info');
        return;
      }
      if (status === 'unavailable') {
        // Approved too late: the booth went to someone else and nothing was
        // charged. Send them back to the floor plan rather than to the form.
        this.dataset.state = 'empty';
        const el = this.querySelector('[data-role="empty-text"]');
        if (el) el.textContent = this.dataset.unavailableText;
        return;
      }

      this.booth = this.#readBooth();

      if (!this.booth.hasAny) {
        this.dataset.state = 'empty';
        const el = this.querySelector('[data-role="empty-text"]');
        if (el) el.textContent = this.dataset.missingText;
        return;
      }

      this.#renderSummary();
      this.dataset.state = 'ready';

      if (status === 'cancel') this.#message(this.dataset.cancelText, 'info');
      if (status === 'error') this.#message(this.dataset.errorText, 'error');

      this.handleSubmit = (event) => {
        event.preventDefault();
        this.submit();
      };
      this.formEl?.addEventListener('submit', this.handleSubmit);
    }

    unmounted() {
      this.formEl?.removeEventListener('submit', this.handleSubmit);
    }

    async submit() {
      if (this.dataset.state === 'submitting') return;

      const exhibitor = this.#readForm();
      if (!exhibitor) return;

      if (!this.dataset.apiBase) {
        this.#message(this.dataset.errorText, 'error');
        console.error('[theme-booth-checkout] no API base URL configured on the section');
        return;
      }

      this.dataset.state = 'submitting';
      this.#message('', null);

      try {
        const endpoint = `${this.dataset.apiBase.replace(/\/+$/, '')}/checkout/start`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            booth: this.booth.values,
            // Forward everything ExpoFP sent, so the backend keeps whatever we
            // did not map into a named field.
            source: Object.fromEntries(this.params.entries()),
            exhibitor,
            returnUrl: this.#returnUrl(),
          }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const error = new Error(`Request failed with ${response.status}`);
          error.code = payload && payload.error;
          // Operator-facing cause (e.g. missing_env:EXPOFP_API_TOKEN) - logged, not shown.
          error.reason = payload && payload.reason;
          throw error;
        }
        if (!payload || !payload.url) throw new Error('No payment URL returned');

        // The backend has put the booth on hold and opened a payment session.
        window.location.assign(payload.url);
      } catch (error) {
        console.error('[theme-booth-checkout]', error.code || '', error.reason || '', error);
        this.dataset.state = 'ready';
        // Someone else is paying for (or has bought) this booth: say so, rather
        // than inviting a retry that cannot succeed.
        if (error.code === 'booth_unavailable') this.#message(this.dataset.unavailableText, 'error');
        else if (error.code === 'booth_unknown') this.#message(this.dataset.missingText, 'error');
        else this.#message(this.dataset.errorText, 'error');
      }
    }

    /**
     * This page, booth parameters included, so a cancelled or failed payment
     * lands back on the same booth ready to retry - not on an empty page.
     * Any old status is dropped; the backend adds the new one.
     */
    #returnUrl() {
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.hash = '';
      return url.toString();
    }

    #readBooth() {
      const pick = (key) => {
        const name = this.dataset[key];
        if (!name) return '';
        return (this.params.get(name) || '').trim();
      };

      const values = {
        booth: pick('paramBooth'),
        type: pick('paramType'),
        size: pick('paramSize'),
        price: pick('paramPrice'),
        currency: pick('paramCurrency') || this.dataset.currency || 'USD',
      };

      return {
        values,
        hasAny: Boolean(values.booth || values.type || values.size || values.price),
      };
    }

    #renderSummary() {
      const el = this.linesEl;
      if (!el) return;

      const { booth, type, size, price, currency } = this.booth.values;
      const rows = [
        [this.dataset.paramBooth, booth],
        [this.dataset.paramType, type],
        [this.dataset.paramSize, size],
      ].filter(([, value]) => value);

      el.innerHTML = '';
      for (const [label, value] of rows) {
        const dt = document.createElement('dt');
        dt.className = 'body4';
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.className = 'body3';
        dd.textContent = value;
        el.append(dt, dd);
      }

      const total = this.querySelector('[data-role="total"]');
      const totalValue = this.querySelector('[data-role="total-value"]');
      if (price && total && totalValue) {
        totalValue.textContent = money(price, currency);
        total.hidden = false;
      }
    }

    #readForm() {
      const form = this.formEl;
      if (!form) return null;

      const data = {};
      let invalid = null;

      for (const input of form.querySelectorAll('input[name]')) {
        const value = input.value.trim();
        data[input.name] = value;

        const needed = REQUIRED.includes(input.name);
        const badEmail = input.name === 'email' && value && !EMAIL.test(value);
        const bad = (needed && !value) || badEmail;

        input.closest('.field')?.classList.toggle('is-invalid', Boolean(bad));
        if (bad && !invalid) invalid = input;
      }

      if (invalid) {
        this.#message(this.dataset.requiredText, 'error');
        invalid.focus();
        return null;
      }

      return data;
    }

    #renderDebug() {
      if (this.dataset.debug !== 'true') return;

      const box = this.querySelector('[data-role="debug"]');
      const out = this.querySelector('[data-role="debug-output"]');
      if (!box || !out) return;

      const entries = Array.from(this.params.entries());
      out.textContent = entries.length
        ? entries.map(([k, v]) => `${k} = ${v}`).join('\n')
        : '(no query parameters)';
      box.hidden = false;
    }

    #message(text, type) {
      const el = this.messageEl;
      if (!el) return;

      if (!text) {
        el.hidden = true;
        el.textContent = '';
        el.removeAttribute('data-type');
        return;
      }

      el.textContent = text;
      el.dataset.type = type || 'error';
      el.hidden = false;
    }
  }

  customElements.define('theme-booth-checkout', ThemeBoothCheckout);
});
