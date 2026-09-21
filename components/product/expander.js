defineModule('theme-product-expander', () => {
    class ProductExpander extends VisibleElement {
        wrapper;
        trigger;
        resizeObserver;
        constructor() {
            super();
            const wrapper = this.querySelector('.product-expander__content');
            if (!wrapper) {
                throw new Error('[theme-product-expander]: child structure exception, missing content tag.');
            }
            this.wrapper = wrapper;
            this.trigger = this.querySelector('.product-expander__trigger');
            this.addEventListener('custom:visible', this.bind(this.#init), { once: true });
            this.trigger?.addEventListener('click', this.bind(this.toggle));
            this.resizeObserver = new ResizeObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.target === this.wrapper) {
                        this.#updateStatus();
                    }
                });
            });
        }
        disconnectedCallback() {
            this.resizeObserver?.disconnect();
        }
        get isOpen() {
            return this.classList.contains('is-open');
        }
        #init() {
            this.resizeObserver?.observe(this.wrapper);
        }
        #updateStatus() {
            if (this.isOpen)
                return;
            const isUnsetMaxHeight = this.style.getPropertyValue('--expander-max-height') === 'unset';
            if (isUnsetMaxHeight)
                return;
            const tolerance = 2;
            const isOverflowing = this.wrapper.scrollHeight > this.wrapper.clientHeight + tolerance;
            this.classList.toggle('is-active', isOverflowing);
        }
        toggle() {
            this.classList.toggle('is-open');
        }
    }
    customElements.define('theme-product-expander', ProductExpander);
});
