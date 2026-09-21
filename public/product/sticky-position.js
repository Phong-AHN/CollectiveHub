defineModule('theme-buy-buttons', () => {
    const STICKY_CLASS = 'is-sticky';
    let globalStickyIndex = 0;
    class StickyPosition extends VisibleElement {
        #stickyIndex = ++globalStickyIndex;
        #placeholder;
        #resizeObserver;
        get isSticky() {
            return this.classList.contains(STICKY_CLASS);
        }
        get enforce() {
            return this.getDatasetValue('enforce', 'boolean');
        }
        get stickyContentHeightCssVar() {
            return `--theme-sticky-content-height-${this.#stickyIndex}`;
        }
        constructor() {
            super();
            this.dataset.rootMargin = '0px 0px 0px 0px';
            this.style.setProperty('--content-height', `var(${this.stickyContentHeightCssVar}, 0px)`);
            this.style.setProperty('--fixed-bottom', this.#stickyIndex > 1
                ? `calc(${new Array(this.#stickyIndex - 1)
                    .fill(0)
                    .map((_, idx) => `var(--theme-sticky-content-height-${idx + 1}, 0px)`)
                    .join(' + ')})`
                : `0px`);
            this.#resizeObserver = new ResizeObserver(themeUtils.debounce((entries) => {
                const entry = entries[0];
                if (this.isSticky) {
                    this.#updateStickyContentHeight(entry.borderBoxSize[0].blockSize);
                }
            }, 100));
            if (this.firstElementChild)
                this.#resizeObserver.observe(this.firstElementChild);
        }
        connectedCallback() {
            super.connectedCallback();
            if (this.enforce) {
                this.#setSticky();
                return;
            }
            this.addEventListener('custom:visible', () => {
                this.#removeSticky();
            });
            this.addEventListener('custom:hidden', (event) => {
                const entry = event.detail;
                if (entry.boundingClientRect.bottom < 0) {
                    this.#setSticky();
                }
            });
        }
        disconnectedCallback() {
            super.disconnectedCallback();
            this.#placeholder?.parentElement?.removeChild(this.#placeholder);
            this.#updateStickyContentHeight(0);
            this.#resizeObserver?.disconnect();
        }
        #updateStickyContentHeight(height) {
            document.body.style.setProperty(this.stickyContentHeightCssVar, `${height}px`);
        }
        #setSticky() {
            const placeholder = this.#getPlaceholderForFooter();
            if (placeholder) {
                placeholder.style.display = 'block';
            }
            this.style.minHeight = `${this.clientHeight || 0}px`;
            this.classList.add(STICKY_CLASS);
            this.#updateStickyContentHeight(this.firstElementChild?.clientHeight || 0);
        }
        #removeSticky() {
            const placeholder = this.#getPlaceholderForFooter();
            placeholder.style.display = 'none';
            this.style.minHeight = '';
            this.classList.remove(STICKY_CLASS);
            this.#updateStickyContentHeight(0);
        }
        #getPlaceholderForFooter() {
            if (this.#placeholder)
                return this.#placeholder;
            const placeholder = document.createElement('div');
            placeholder.className = this.dataset.placeholderClass || '';
            placeholder.style.width = '100%';
            placeholder.style.display = 'none';
            placeholder.style.height = `var(${this.stickyContentHeightCssVar}, 0px)`;
            this.#placeholder = placeholder;
            document.body.appendChild(placeholder);
            return placeholder;
        }
    }
    customElements.define('theme-sticky-position', StickyPosition);
});
