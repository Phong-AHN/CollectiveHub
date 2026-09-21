defineModule('theme-dialog', () => {
    const lockScrollDialogs = new Set();
    class Dialog extends VisibleElement {
        #dialog;
        #trigger;
        #closeButton;
        get isDisabled() {
            return this.#trigger.hasAttribute('disabled') ?? false;
        }
        set isDisabled(flag) {
            if (flag) {
                this.#trigger.setAttribute('disabled', 'true');
            }
            else {
                this.#trigger.removeAttribute('disabled');
            }
        }
        get isOpen() {
            return this.#dialog.hasAttribute('open') ?? false;
        }
        get #maskClosable() {
            return this.getDatasetValue('maskClosable', 'boolean');
        }
        get #escToExit() {
            return this.getDatasetValue('escToExit', 'boolean');
        }
        constructor() {
            super();
            this.#dialog = this.queryOwnSelector('dialog');
            this.#trigger = this.queryOwnSelector('[name="trigger"]');
            this.#closeButton = this.queryOwnSelector('button[name="close"]');
            if (!this.#dialog) {
                throw new Error('[theme-dialog]: child structure exception, missing dialog tag.');
            }
            if (!this.#trigger) {
                throw new Error('[theme-dialog]: child structure exception, missing trigger button.');
            }
            this.#trigger.addEventListener('click', this.bind(this.#triggerClickHandler));
            this.#closeButton.addEventListener('click', this.bind(this.close));
            if (this.#maskClosable) {
                this.#dialog.addEventListener('click', this.bind(this.#backDropClose));
            }
        }
        #triggerClickHandler(event) {
            event.preventDefault();
            event.stopPropagation();
            if (this.isDisabled) {
                return;
            }
            if (this.isOpen) {
                this.close();
            }
            else {
                this.open();
            }
        }
        async open() {
            if (this.isOpen || !this.emit('dialog:open')) {
                return;
            }
            this.#dialog.showModal();
            this.#dialog.addEventListener('cancel', this.bind(this.#cancelHandler));
            this.#lockScroll();
            this.#doAutoFocus();
            await this.#doAnimate();
        }
        async close() {
            if (!this.isOpen || !this.emit('dialog:close')) {
                return;
            }
            await this.#doAnimate(true);
            this.#dialog.close();
            this.#dialog.removeEventListener('cancel', this.bind(this.#cancelHandler));
            this.#unlockScroll();
            this.#trigger.focus();
        }
        #cancelHandler(event) {
            event.preventDefault();
            if (this.#escToExit) {
                this.close();
            }
        }
        #backDropClose(event) {
            const dialogRect = this.#dialog.getBoundingClientRect();
            if (event.clientX < dialogRect.left ||
                event.clientX > dialogRect.right ||
                event.clientY < dialogRect.top ||
                event.clientY > dialogRect.bottom) {
                this.close();
            }
        }
        #lockScroll() {
            if (this.dataset.lockScroll !== 'false') {
                themeUtils.lockScroll();
                lockScrollDialogs.add(this);
            }
        }
        #unlockScroll() {
            if (this.dataset.lockScroll !== 'false') {
                lockScrollDialogs.delete(this);
                if (lockScrollDialogs.size === 0) {
                    themeUtils.unlockScroll();
                }
            }
        }
        #doAutoFocus() {
            const focusTarget = this.#dialog.querySelector('input[autofocus]:not([type="hidden"])');
            if (focusTarget) {
                focusTarget.focus();
            }
        }
        #doAnimate(isClose = false) {
            const contentElement = this.#dialog;
            if (!contentElement) {
                return Promise.resolve();
            }
            let timer;
            return new Promise((resolve) => {
                const onAnimationend = (event) => {
                    if (event && event.target !== contentElement) {
                        return;
                    }
                    contentElement.style.animationDirection = '';
                    contentElement.style.animationName = '';
                    clearTimeout(timer);
                    resolve(this);
                };
                requestAnimationFrame(() => {
                    if (isClose) {
                        contentElement.style.animationDirection = 'reverse';
                    }
                    contentElement.style.animationName = `var(--modal-animation-name, animation-fade-in-center)`;
                    contentElement.addEventListener('animationend', onAnimationend, { once: true });
                    timer = setTimeout(onAnimationend, 300);
                });
            });
        }
    }
    customElements.define('theme-dialog', Dialog);
    window.Dialog = Dialog;
});
