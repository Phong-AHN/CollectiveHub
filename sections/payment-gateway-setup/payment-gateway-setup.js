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

  class ThemePaymentGatewaySetup extends BaseElement {
    controller;
    handleSubmit;
    handleGatewayChange;
    hideTimer;

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
      // so never auto-hide it there.
      if (this.dataset.designMode === 'true') {
        this.dataset.state = 'form';
        return;
      }

      this.#checkConfigured();
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

      const passcode = field('passcode');
      const payload = { gateway, passcode };

      for (const name of REQUIRED_FIELDS[gateway] || []) {
        const value = field(name);
        if (!value) {
          this.#message(this.dataset.requiredText, 'error');
          return;
        }
        payload[name] = value;
      }
      if (!passcode) {
        this.#message(this.dataset.requiredText, 'error');
        this.querySelector('[name="passcode"]')?.focus();
        return;
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

    async #checkConfigured() {
      if (this.dataset.hideWhenConfigured !== 'true') {
        this.dataset.state = 'form';
        return;
      }

      if (readFlag()) {
        this.#hide();
        return;
      }

      this.controller = new AbortController();

      try {
        const response = await fetch(this.#endpoint(), { signal: this.controller.signal });
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);

        const status = await response.json();
        if (status && status.configured) {
          writeFlag();
          this.#hide();
          return;
        }

        this.dataset.state = 'form';
      } catch (error) {
        if (error.name === 'AbortError') return;
        // Fail open: if the endpoint is unreachable the client can still set up.
        console.error('[theme-payment-gateway-setup]', error);
        this.dataset.state = 'form';
      }
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
  }

  customElements.define('theme-payment-gateway-setup', ThemePaymentGatewaySetup);
});
