defineModule('theme-payment-gateway-setup', () => {
  const STORAGE_KEY = 'theme:payment-gateway-configured';

  const REQUIRED_FIELDS = {
    paypal: ['paypalClientId', 'paypalClientSecret'],
    stripe: ['stripeSecretKey'],
  };

  const readFlag = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (error) {
      return false;
    }
  };

  const writeFlag = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (error) {
      /* private mode or blocked storage - the remote check still covers us */
    }
  };

  const clearFlag = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* nothing to clear if storage is blocked */
    }
  };

  class ThemePaymentGatewaySetup extends BaseElement {
    controller;
    handleSubmit;
    handleGatewayChange;
    hideTimer;
    // Only asked for when the service is set up to require one.
    passcodeNeeded = false;

    get root() {
      return this.closest('.payment-gateway-setup');
    }

    get formEl() {
      return this.querySelector('[data-role="form"]');
    }

    get messageEl() {
      return this.querySelector('[data-role="message"]');
    }

    get submitEl() {
      return this.querySelector('[data-role="submit"]');
    }

    get passcodeFieldsEl() {
      return this.querySelector('[data-role="fields-passcode"]');
    }

    get gatewayEls() {
      return Array.from(this.querySelectorAll('[data-role="gateway"]'));
    }

    get gateway() {
      const checked = this.gatewayEls.find((input) => input.checked);
      return checked ? checked.value : this.dataset.gateway || 'paypal';
    }

    mounted() {
      this.handleGatewayChange = () => this.#syncGateway();
      this.gatewayEls.forEach((input) => input.addEventListener('change', this.handleGatewayChange));

      this.handleSubmit = (event) => {
        event.preventDefault();
        this.save();
      };
      this.formEl?.addEventListener('submit', this.handleSubmit);

      this.#syncGateway();

      // In the theme editor the merchant needs to see and style the section,
      // so never auto-hide it there - and every field is worth showing.
      if (this.dataset.designMode === 'true') {
        this.#showPasscode(true);
        this.dataset.state = 'form';
        return;
      }

      this.#loadStatus();
    }

    unmounted() {
      this.gatewayEls.forEach((input) => input.removeEventListener('change', this.handleGatewayChange));
      this.formEl?.removeEventListener('submit', this.handleSubmit);
      this.controller?.abort();
      this.controller = undefined;
      clearTimeout(this.hideTimer);
    }

    async save() {
      if (this.dataset.state === 'saving') return;

      if (this.dataset.designMode === 'true') {
        this.#message(this.dataset.designModeText, 'error');
        return;
      }

      const gateway = this.gateway;
      const field = (name) => this.querySelector(`[name="${name}"]`)?.value.trim() || '';

      const payload = { gateway };

      for (const name of REQUIRED_FIELDS[gateway] || []) {
        const value = field(name);
        if (!value) {
          this.#message(this.dataset.requiredText, 'error');
          return;
        }
        payload[name] = value;
      }

      if (this.passcodeNeeded) {
        const passcode = field('passcode');
        if (!passcode) {
          this.#message(this.dataset.requiredText, 'error');
          this.querySelector('[name="passcode"]')?.focus();
          return;
        }
        payload.passcode = passcode;
      }

      // Stripe checkout is created on the server, which needs the secret key.
      // A publishable key (pk_) is the easy mistake, and this section hides
      // itself after the first save - so catch it before anything is sent.
      if (gateway === 'stripe' && !/^(sk|rk)_(test|live)_/.test(payload.stripeSecretKey)) {
        this.#message(this.dataset.stripeKeyText, 'error');
        this.querySelector('[name="stripeSecretKey"]')?.focus();
        return;
      }

      this.dataset.state = 'saving';
      this.#message('', null);

      try {
        const response = await fetch(this.#endpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const problem = await response.json().catch(() => null);
          const error = new Error(`Request failed with ${response.status}`);
          error.code = problem && problem.error;
          throw error;
        }

        writeFlag();
        this.formEl?.reset();
        this.dataset.state = 'form';
        this.#message(this.dataset.successText, 'success');

        if (this.dataset.hideWhenConfigured === 'true') {
          this.hideTimer = setTimeout(() => this.#hide(), 1800);
        }
      } catch (error) {
        console.error('[theme-payment-gateway-setup]', error.code || '', error);
        this.dataset.state = 'form';
        if (error.code === 'passcode_wrong' || error.code === 'too_many_attempts') {
          // A code was turned on after this page loaded: ask for it now.
          this.#showPasscode(true);
          this.#message(this.dataset.passcodeErrorText, 'error');
          this.querySelector('[name="passcode"]')?.focus();
        } else if (error.code === 'stripe_publishable_key' || error.code === 'stripe_key_invalid') {
          this.#message(this.dataset.stripeKeyText, 'error');
        } else {
          this.#message(this.dataset.errorText, 'error');
        }
      }
    }

    /** The service holds the keys now - this is where they go. */
    #endpoint() {
      const base = (this.dataset.apiBase || '').trim().replace(/\/+$/, '');
      if (!base) throw new Error('This section has no checkout API address set');
      return `${base}/gateway/keys`;
    }

    /**
     * Asks the service what it needs before showing the form: whether keys are
     * already saved, and whether saving takes a setup code.
     */
    async #loadStatus() {
      const hideWhenConfigured = this.dataset.hideWhenConfigured === 'true';
      const seenConfigured = hideWhenConfigured && readFlag();

      // Hide straight away when this browser has seen the shop configured, so a
      // live shop never flashes the form - but still ask, because the keys can
      // be taken away again and the flag must not outlive them.
      if (seenConfigured) this.#hide();

      this.controller = new AbortController();

      try {
        const response = await fetch(this.#endpoint(), { signal: this.controller.signal });
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);

        const status = await response.json();
        const configured = Boolean(status && status.configured);

        if (configured && hideWhenConfigured) {
          writeFlag();
          this.#hide();
          return;
        }
        if (!configured) clearFlag();

        this.#showPasscode(Boolean(status && status.passcodeRequired));
        this.#show();
      } catch (error) {
        if (error.name === 'AbortError') return;
        // Fail open: if the endpoint is unreachable the client can still set up
        // - unless this browser already knows the shop is configured, in which
        // case the section stays hidden rather than reappearing on a live shop.
        // A setup code, if one is needed, is asked for after the first refusal.
        console.error('[theme-payment-gateway-setup]', error);
        if (!seenConfigured) this.dataset.state = 'form';
      }
    }

    /** Hidden fields stay out of validation, autofill and the payload. */
    #showPasscode(needed) {
      this.passcodeNeeded = needed;
      const fields = this.passcodeFieldsEl;
      if (!fields) return;
      fields.hidden = !needed;
      const input = fields.querySelector('input');
      if (input) input.disabled = !needed;
    }

    #syncGateway() {
      const gateway = this.gateway;
      this.dataset.gateway = gateway;

      for (const name of ['paypal', 'stripe']) {
        const fields = this.querySelector(`[data-role="fields-${name}"]`);
        if (!fields) continue;

        const active = name === gateway;
        fields.hidden = !active;
        // Disabled inputs stay out of validation, autofill and the payload.
        fields.querySelectorAll('[data-role="input"]').forEach((input) => {
          input.disabled = !active;
        });
      }
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

    #hide() {
      this.dataset.state = 'hidden';
      if (this.root) this.root.hidden = true;
    }

    #show() {
      this.dataset.state = 'form';
      if (this.root) this.root.hidden = false;
    }
  }

  customElements.define('theme-payment-gateway-setup', ThemePaymentGatewaySetup);
});
