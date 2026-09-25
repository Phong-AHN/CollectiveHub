defineModule('theme-booth-admin', () => {
  const REQUIRED = ['booth', 'company', 'contactName', 'passcode'];

  class ThemeBoothAdmin extends BaseElement {
    handleSubmit;
    handleReload;
    handlePasscode;
    handleAgain;
    extrasController;
    boothsController;
    extras = [];
    booths = [];

    get formEl() {
      return this.querySelector('[data-role="form"]');
    }

    get messageEl() {
      return this.querySelector('[data-role="message"]');
    }

    get resultEl() {
      return this.querySelector('[data-role="result"]');
    }

    field(name) {
      return this.querySelector(`[name="${name}"]`);
    }

    value(name) {
      return this.field(name)?.value.trim() || '';
    }

    mounted() {
      this.handleSubmit = (event) => {
        event.preventDefault();
        this.book();
      };
      this.formEl?.addEventListener('submit', this.handleSubmit);

      this.handleReload = () => this.loadBooths({ refresh: true });
      this.querySelector('[data-role="reload"]')?.addEventListener('click', this.handleReload);

      // The list is behind the admin code, so it can only load once there is
      // one. Typing it is the natural moment to fetch.
      this.handlePasscode = () => {
        if (this.value('passcode') && !this.booths.length) this.loadBooths();
      };
      this.field('passcode')?.addEventListener('change', this.handlePasscode);
      this.field('passcode')?.addEventListener('blur', this.handlePasscode);

      this.handleAgain = () => this.#reset();
      this.querySelector('[data-role="again"]')?.addEventListener('click', this.handleAgain);

      this.#renderExtras([]);
    }

    unmounted() {
      this.formEl?.removeEventListener('submit', this.handleSubmit);
      this.querySelector('[data-role="reload"]')?.removeEventListener('click', this.handleReload);
      this.field('passcode')?.removeEventListener('change', this.handlePasscode);
      this.field('passcode')?.removeEventListener('blur', this.handlePasscode);
      this.querySelector('[data-role="again"]')?.removeEventListener('click', this.handleAgain);
      this.extrasController?.abort();
      this.boothsController?.abort();
    }

    /**
     * The floor plan as it stands: which booths are free, which are on hold
     * while someone pays, and which already belong to an exhibitor. Only the
     * free ones can be picked - the rest are shown so nobody wonders where
     * they went.
     */
    async loadBooths({ refresh = false } = {}) {
      const passcode = this.value('passcode');
      if (!passcode) {
        this.#message(this.dataset.requiredText, 'error');
        this.field('passcode')?.focus();
        return;
      }

      this.boothsController?.abort();
      this.boothsController = new AbortController();
      this.#note(this.dataset.boothsLoadingText);

      try {
        const response = await fetch(`${this.#endpoint('/admin/booths')}${refresh ? '?refresh=1' : ''}`, {
          headers: { 'X-Admin-Passcode': passcode },
          signal: this.boothsController.signal,
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const error = new Error(`Request failed with ${response.status}`);
          error.code = body?.error;
          error.reason = body?.reason || body?.detail;
          throw error;
        }

        this.booths = Array.isArray(body?.booths) ? body.booths : [];
        this.#renderBooths();
        const counts = body?.counts || {};
        this.#note(`${counts.available || 0} available · ${counts.on_hold || 0} on hold · ${counts.booked || 0} booked`);
        this.#message('', null);
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('[theme-booth-admin]', error.code || '', error);
        this.booths = [];
        this.#renderBooths();
        this.#note('');
        this.#message(error.code === 'passcode_wrong' || error.code === 'too_many_attempts'
          ? this.dataset.passcodeErrorText
          : this.dataset.boothsErrorText, 'error');
      }
    }

    #renderBooths() {
      const box = this.querySelector('[data-role="booths"]');
      if (!box) return;

      box.innerHTML = '';
      for (const booth of this.booths) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'booth-admin__booth';
        button.dataset.status = booth.status;
        button.dataset.booth = booth.name;

        const name = document.createElement('span');
        name.className = 'booth-admin__booth-name body3';
        name.textContent = booth.name;

        const note = document.createElement('span');
        note.className = 'booth-admin__booth-note body5';
        note.textContent = booth.status === 'booked' ? (booth.exhibitors[0] || this.dataset.statusBooked)
          : booth.status === 'on_hold' ? this.dataset.statusOnHold
            : booth.status === 'available' ? `${booth.price ?? ''}`
              : '—';

        button.append(name, note);
        button.title = [booth.name, booth.type, booth.size, booth.exhibitors.join(', ')]
          .filter(Boolean).join(' · ');

        if (booth.status === 'available') {
          button.addEventListener('click', () => this.#select(booth));
        } else {
          button.disabled = true;
        }

        box.append(button);
      }
    }

    #select(booth) {
      const field = this.field('booth');
      if (field) field.value = booth.name;

      for (const button of this.querySelectorAll('.booth-admin__booth')) {
        button.classList.toggle('is-selected', button.dataset.booth === booth.name);
      }

      const selected = this.querySelector('[data-role="selected"]');
      if (selected) {
        selected.textContent = [`Booth ${booth.name}`, booth.type, booth.size,
          booth.price != null ? `${booth.price}` : null].filter(Boolean).join(' · ');
        selected.hidden = false;
      }

      this.#loadExtras();
    }

    #note(text) {
      const note = this.querySelector('[data-role="picker-note"]');
      if (note) note.textContent = text || '';
    }

    async book() {
      if (this.dataset.state === 'working') return;

      if (this.dataset.designMode === 'true') {
        this.#message('Booking is disabled inside the theme editor preview.', 'error');
        return;
      }

      for (const name of REQUIRED) {
        if (!this.value(name)) {
          this.#message(this.dataset.requiredText, 'error');
          // The booth is picked, not typed - point at the list instead.
          if (name === 'booth') this.querySelector('[data-role="booths"]')?.scrollIntoView({ block: 'nearest' });
          else this.field(name)?.focus();
          return;
        }
      }

      const payload = {
        passcode: this.value('passcode'),
        booth: this.value('booth'),
        company: this.value('company'),
        contactName: this.value('contactName'),
        email: this.value('email'),
        phone: this.value('phone'),
        website: this.value('website'),
        bookedBy: this.value('bookedBy'),
        note: this.value('note'),
        extras: this.#selectedExtras(),
        sendEmails: this.querySelector('[data-role="send-emails"]')?.checked !== false,
      };

      this.dataset.state = 'working';
      this.#message(this.dataset.workingText, 'info');

      try {
        const response = await fetch(this.#endpoint('/admin/book'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          const error = new Error(`Request failed with ${response.status}`);
          error.code = body?.error;
          error.reason = body?.reason || body?.detail;
          throw error;
        }

        this.#showResult(body);
      } catch (error) {
        console.error('[theme-booth-admin]', error.code || '', error.reason || '', error);
        this.dataset.state = 'form';
        this.#message(this.#errorText(error), 'error');
      }
    }

    #errorText(error) {
      switch (error.code) {
        case 'passcode_wrong':
        case 'too_many_attempts':
          return this.dataset.passcodeErrorText;
        case 'booth_unknown':
          return this.dataset.unknownBoothText;
        case 'booth_unavailable':
          return this.dataset.unavailableText;
        case 'admin_passcode_missing':
          return 'No ADMIN_PASSCODE is set on the checkout service, so booking is switched off.';
        case 'booth_check_failed':
          return `The floor plan did not answer (${error.reason || 'unknown'}). Try again in a moment.`;
        case 'expofp_write_failed':
          return `The booth could not be assigned on the floor plan: ${error.reason || 'unknown error'}.`;
        default:
          return this.dataset.errorText;
      }
    }

    #showResult(body) {
      const lines = [
        ['Booth', body.booth],
        ['Exhibitor id', body.exhibitorId],
        ['Recorded amount', `${body.amount} ${body.currency}`],
        ['Add-ons', body.extras?.length ? body.extras.map((extra) => extra.name).join(', ') : 'none'],
        ['Confirmation to exhibitor', body.emails?.buyer],
        ['Notice to organiser', body.emails?.organiser],
        ['Order reference', body.checkoutId],
      ].filter(([, value]) => String(value ?? '').trim());

      const list = this.querySelector('[data-role="result-lines"]');
      if (list) {
        list.innerHTML = '';
        for (const [label, value] of lines) {
          const dt = document.createElement('dt');
          dt.className = 'body4';
          dt.textContent = label;
          const dd = document.createElement('dd');
          dd.className = 'body3';
          dd.textContent = value;
          list.append(dt, dd);
        }
      }

      const title = this.querySelector('[data-role="result-title"]');
      if (title) title.textContent = `Booth ${body.booth} is booked`;

      this.#message('', null);
      this.dataset.state = 'done';
      if (this.formEl) this.formEl.hidden = true;
      if (this.resultEl) this.resultEl.hidden = false;
    }

    #reset() {
      // Keep the admin code and the name: whoever is booking is still here.
      for (const name of ['booth', 'company', 'contactName', 'email', 'phone', 'website', 'note']) {
        const field = this.field(name);
        if (field) field.value = '';
      }
      this.#renderExtras([]);
      const selected = this.querySelector('[data-role="selected"]');
      if (selected) selected.hidden = true;
      this.dataset.state = 'form';
      if (this.formEl) this.formEl.hidden = false;
      if (this.resultEl) this.resultEl.hidden = true;
      // The booth just booked is no longer free: ask again rather than show a
      // list that is already wrong.
      this.loadBooths({ refresh: true });
    }

    #selectedExtras() {
      return Array.from(this.querySelectorAll('[data-role="extra"]:checked')).map((input) => input.value);
    }

    async #loadExtras() {
      const booth = this.value('booth');
      if (!booth) {
        this.#renderExtras([]);
        return;
      }

      this.extrasController?.abort();
      this.extrasController = new AbortController();

      try {
        const response = await fetch(`${this.#endpoint('/extras')}?booth=${encodeURIComponent(booth)}`,
          { signal: this.extrasController.signal });
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);

        const payload = await response.json();
        this.extras = Array.isArray(payload?.extras) ? payload.extras : [];
        this.#renderExtras(this.extras, payload.currency);
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('[theme-booth-admin]', error);
        this.#renderExtras([]);
      }
    }

    #renderExtras(extras, currency = 'USD') {
      const list = this.querySelector('[data-role="extras-list"]');
      if (!list) return;

      list.innerHTML = '';
      if (!extras.length) {
        const note = document.createElement('p');
        note.className = 'booth-admin__hint body5';
        note.textContent = this.dataset.noExtrasText;
        list.append(note);
        return;
      }

      for (const extra of extras) {
        const row = document.createElement('label');
        row.className = 'booth-admin__extra body3';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = extra.id;
        input.dataset.role = 'extra';

        const name = document.createElement('span');
        name.textContent = extra.name;

        const price = document.createElement('span');
        price.className = 'booth-admin__extra-price body4';
        price.textContent = `${extra.price} ${currency}`;

        row.append(input, name, price);
        list.append(row);
      }
    }

    #endpoint(path) {
      const base = (this.dataset.apiBase || '').trim().replace(/\/+$/, '');
      if (!base) throw new Error('This section has no checkout API address set');
      return `${base}${path}`;
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

  customElements.define('theme-booth-admin', ThemeBoothAdmin);
});
