defineModule('theme-product-media-hover-preview', () => {
    class ProductMediaHoverPreview extends VisibleElement {
        #isEntered = false;
        #imageWidth = 0;
        #imageHeight = 0;
        #containerWidth = 0;
        #containerHeight = 0;
        get src() {
            return this.getDatasetValue('src', 'string');
        }
        constructor() {
            super();
            this.addEventListener('custom:visible', () => {
                this.addEventListener('mouseenter', this.#handleMouseEnter.bind(this), { passive: true });
                this.addEventListener('mousemove', this.#handleMouseMove.bind(this), { passive: true });
                this.addEventListener('mouseleave', this.#handleMouseLeave.bind(this), { passive: true });
                if (this.src) {
                    this.#loadImageDimensions();
                }
            }, { once: true });
        }
        #loadImageDimensions() {
            const img = new Image();
            img.onload = () => {
                const rect = this.getBoundingClientRect();
                const minScale = 1.4;
                const aspectRatio = img.naturalWidth / img.naturalHeight;
                const containerAspectRatio = rect.width / rect.height;
                if (aspectRatio > containerAspectRatio) {
                    this.#imageHeight = Math.max(rect.height * minScale, img.naturalHeight);
                    this.#imageWidth = this.#imageHeight * aspectRatio;
                }
                else {
                    this.#imageWidth = Math.max(rect.width * minScale, img.naturalWidth);
                    this.#imageHeight = this.#imageWidth / aspectRatio;
                }
                this.style.setProperty('--original-image-width', `${this.#imageWidth}px`);
                this.style.setProperty('--original-image-height', `${this.#imageHeight}px`);
                this.style.setProperty('--original-image', `url("${this.src}")`);
            };
            img.src = this.src || '';
        }
        #handleMouseEnter() {
            if (themeUtils.isMobileScreen())
                return;
            const rect = this.getBoundingClientRect();
            this.#containerWidth = rect.width;
            this.#containerHeight = rect.height;
            this.#isEntered = true;
            this.style.setProperty('--offset-x', '0px');
            this.style.setProperty('--offset-y', '0px');
        }
        #handleMouseMove(event) {
            if (!this.#isEntered)
                return;
            const rect = this.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const percentX = x / this.#containerWidth;
            const percentY = y / this.#containerHeight;
            const offsetX = -(this.#imageWidth - this.#containerWidth) * percentX;
            const offsetY = -(this.#imageHeight - this.#containerHeight) * percentY;
            this.style.setProperty('--offset-x', `${offsetX}px`);
            this.style.setProperty('--offset-y', `${offsetY}px`);
        }
        #handleMouseLeave() {
            if (!this.#isEntered)
                return;
            this.#isEntered = false;
        }
    }
    customElements.define('theme-product-media-hover-preview', ProductMediaHoverPreview);
});
