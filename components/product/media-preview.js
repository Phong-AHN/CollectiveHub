defineModule('theme-product-media-preview', () => {
    const ZOOM_IN_CLASS = 'zoom-in';
    const IMAGE_SELECTOR = '.product-media-preview__image';
    const DRAG_INITED_ATTR = 'dragEventInited';
    const ZOOM_SCALE = 2;
    class ProductMediaPreview extends Modal {
        mediaCarousel;
        mediaElements = [];
        #imageElements = [];
        #abortController;
        get desktopZoomType() {
            return this.getDatasetValue('desktopZoomType', 'string');
        }
        get mobileZoomType() {
            return this.getDatasetValue('mobileZoomType', 'string');
        }
        get zoomType() {
            const isMobile = themeUtils.isMobileScreen();
            return isMobile ? this.mobileZoomType : this.desktopZoomType;
        }
        get isSliderMode() {
            return ['lens', 'slider'].includes(this.zoomType);
        }
        constructor() {
            super();
            this.mediaCarousel = this.querySelector('theme-carousel');
            this.mediaElements = Array.from(this.querySelectorAll('.product-media-preview__media'));
            this.#imageElements = Array.from(this.querySelectorAll(IMAGE_SELECTOR));
            this.#bindEvents();
        }
        #bindEvents() {
            this.#abortController = new AbortController();
            const { signal } = this.#abortController;
            this.mediaCarousel.addEventListener('carousel:change', this.#handleCarouselChange.bind(this), { signal });
            this.mediaCarousel.addEventListener('carousel:before:move', this.#resetAllImageZoom.bind(this), { signal });
            if (this.contentElement) {
                themeUtils.addDoubleClickListener(this.contentElement, this.#handleDoubleClick.bind(this), {
                    passive: true,
                    capture: true,
                    signal,
                });
            }
        }
        async preview(mediaId) {
            const action = super.open();
            const targetMediaElement = this.#findMediaElement(mediaId);
            if (targetMediaElement) {
                this.#activateMedia(targetMediaElement);
                this.#activeImageZoomStatus(targetMediaElement);
                this.#autoPlayVideo(targetMediaElement, true);
            }
            await action;
        }
        async close() {
            this.#pauseAllVideos();
            await super.close();
            this.#resetAllImageZoom();
            this.emit('product-media-preview:closed');
        }
        disconnectedCallback() {
            this.#abortController?.abort();
            super.disconnectedCallback?.();
        }
        #findMediaElement(mediaId) {
            return this.mediaElements.find((ele) => ele.dataset.mediaId === mediaId);
        }
        #findImageElement(parentElement) {
            return parentElement.querySelector(IMAGE_SELECTOR);
        }
        #activateMedia(mediaElement) {
            mediaElement.classList.add('is-active');
            mediaElement.scrollIntoView({ behavior: 'instant' });
        }
        #pauseAllVideos() {
            this.mediaCarousel
                .querySelectorAll('theme-video-media')
                .forEach((videoMedia) => videoMedia.pause());
        }
        #handleDoubleClick(event) {
            if (!this.isSliderMode)
                return;
            const imageElement = event.target?.closest(IMAGE_SELECTOR);
            if (imageElement) {
                this.#toggleImageZoom(imageElement);
            }
        }
        #toggleImageZoom(imageElement, force) {
            const shouldZoomIn = force ?? !imageElement.classList.contains(ZOOM_IN_CLASS);
            this.#resetImageOffset(imageElement);
            imageElement.classList.toggle(ZOOM_IN_CLASS, shouldZoomIn);
            if (shouldZoomIn) {
                this.#enableImageDrag(imageElement);
            }
        }
        #resetImageOffset(imageElement) {
            imageElement.style.setProperty('--offset-x', '0px');
            imageElement.style.setProperty('--offset-y', '0px');
        }
        #enableImageDrag(image) {
            if (image.dataset[DRAG_INITED_ATTR] === 'true')
                return;
            const dragController = this.#createDragController(image);
            this.#attachDragEvents(image, dragController);
            image.dataset[DRAG_INITED_ATTR] = 'true';
        }
        #createDragController(image) {
            const bounds = {
                minX: 0,
                maxX: 0,
                minY: 0,
                maxY: 0,
            };
            let isDragging = false;
            let startPos = { x: 0, y: 0 };
            let offsetPos = { x: 0, y: 0 };
            const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
            return {
                start: (clientX, clientY) => {
                    if (isDragging || !image.classList.contains(ZOOM_IN_CLASS))
                        return false;
                    isDragging = true;
                    const { offsetWidth: width, offsetHeight: height } = image;
                    const moveRangeWidth = width * ZOOM_SCALE;
                    const moveRangeHeight = height * ZOOM_SCALE;
                    Object.assign(bounds, {
                        minX: (-1 * (moveRangeWidth - width)) / 2,
                        maxX: (moveRangeWidth - width) / 2,
                        minY: (-1 * (moveRangeHeight - height)) / 2,
                        maxY: (moveRangeHeight - height) / 2,
                    });
                    startPos = { x: clientX, y: clientY };
                    offsetPos = {
                        x: parseFloat(image.style.getPropertyValue('--offset-x')) || 0,
                        y: parseFloat(image.style.getPropertyValue('--offset-y')) || 0,
                    };
                    return true;
                },
                move: (clientX, clientY) => {
                    if (!isDragging)
                        return;
                    const deltaX = (clientX - startPos.x) * 1.2;
                    const deltaY = (clientY - startPos.y) * 1.2;
                    const newX = clamp(offsetPos.x + deltaX, bounds.minX, bounds.maxX);
                    const newY = clamp(offsetPos.y + deltaY, bounds.minY, bounds.maxY);
                    image.style.setProperty('--offset-x', `${newX}px`);
                    image.style.setProperty('--offset-y', `${newY}px`);
                },
                end: () => {
                    isDragging = false;
                },
                get isDragging() {
                    return isDragging;
                },
            };
        }
        #attachDragEvents(image, controller) {
            image.addEventListener('touchstart', (e) => {
                if (controller.start(e.touches[0].clientX, e.touches[0].clientY)) {
                    e.preventDefault();
                }
            }, { passive: false });
            image.addEventListener('touchmove', (e) => {
                controller.move(e.touches[0].clientX, e.touches[0].clientY);
                if (controller.isDragging)
                    e.preventDefault();
            }, { passive: false });
            image.addEventListener('touchend', () => controller.end());
            image.addEventListener('touchcancel', () => controller.end());
            image.addEventListener('mousedown', (e) => {
                if (controller.start(e.clientX, e.clientY)) {
                    e.preventDefault();
                }
            });
            image.addEventListener('mousemove', (e) => {
                controller.move(e.clientX, e.clientY);
            });
            image.addEventListener('mouseup', () => controller.end());
            image.addEventListener('mouseleave', () => controller.end());
        }
        #handleCarouselChange(event) {
            if (!this.isOpen || !this.isSliderMode)
                return;
            const { currentIndex, currentSlide } = event.detail;
            this.#resetAllImageZoom();
            this.#activeImageZoomStatus(currentSlide);
            this.#pauseAllVideos();
            this.#autoPlayVideo(currentSlide);
            this.emit('product-media-preview:change', {
                index: currentIndex,
                mediaId: currentSlide.dataset.mediaId,
            });
        }
        #activeImageZoomStatus(mediaElement) {
            const imageElement = this.#findImageElement(mediaElement);
            if (imageElement && this.zoomType === 'lens') {
                this.#toggleImageZoom(imageElement, true);
            }
        }
        async #autoPlayVideo(mediaElement, forcePlay = false) {
            const shouldAutoplay = forcePlay || this.getDatasetValue.call(mediaElement, 'videoAutoplay', 'boolean');
            if (shouldAutoplay) {
                await new Promise((resolve) => {
                    requestAnimationFrame(() => resolve(null));
                });
                const videoElement = mediaElement.querySelector('theme-video-media');
                videoElement?.play();
            }
        }
        #resetAllImageZoom() {
            this.#imageElements.forEach((img) => this.#toggleImageZoom(img, false));
        }
    }
    customElements.define('theme-product-media-preview', ProductMediaPreview);
});
