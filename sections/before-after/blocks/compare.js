defineModule('theme-before-after-compare', () => {
    class BeforeAfterCompare extends BaseElement {
        #container;
        #splitCursor;
        #offsetX;
        #currentX;
        #initialX;
        #dragging;
        resizeObserver;
        constructor() {
            super();
            this.#splitCursor = this.querySelector('.before-after__cursor');
            this.#container = this.querySelector('.before-after__compare-image-group');
            this.#offsetX = 0;
            this.#currentX = 0;
            this.#initialX = 0;
            this.#dragging = false;
            this.addEventListener('pointerdown', this.#onPointerDown.bind(this));
            this.addEventListener('pointermove', this.#onPointerMove.bind(this));
            this.closest('theme-before-after')?.addEventListener('pointerup', this.#onPointerUp.bind(this));
            this.resizeObserver = new ResizeObserver(themeUtils.debounce(() => {
                this.#recalculateOffset();
            }, 100));
        }
        mounted() {
            this.resizeObserver.observe(document.body);
        }
        unmounted() {
            this.resizeObserver.disconnect();
        }
        get minOffset() {
            return -this.#splitCursor.offsetLeft - (document.dir === 'rtl' ? this.#splitCursor.clientWidth : 0);
        }
        get maxOffset() {
            if (this.#splitCursor.offsetParent) {
                return this.#splitCursor.offsetParent.clientWidth + this.minOffset;
            }
            return 0;
        }
        #onPointerDown(event) {
            if (event.target === this || this.#splitCursor.contains(event.target)) {
                this.#initialX = event.clientX - this.#offsetX;
                this.#dragging = true;
            }
        }
        #onPointerMove(event) {
            if (!this.#dragging) {
                return;
            }
            this.#currentX = Math.min(Math.max(event.clientX - this.#initialX, this.minOffset), this.maxOffset);
            this.#offsetX = this.#currentX;
            this.#container.style.setProperty('--clip-path-offset', `${this.#currentX.toFixed(1)}px`);
        }
        #onPointerUp() {
            this.#dragging = false;
        }
        #recalculateOffset() {
            this.#container.style.setProperty('--clip-path-offset', `${Math.min(Math.max(this.minOffset, Number(this.#currentX.toFixed(1))), this.maxOffset)}px`);
        }
    }
    window.customElements.define('theme-before-after-compare', BeforeAfterCompare);
});
