defineModule('theme-product-media-gallery', () => {
    class ProductMediaGallery extends VisibleElement {
        #mediaCarousel;
        #thumbnailCarousel;
        #stickyMediaWrapper;
        #mediaPreviewer;
        constructor() {
            super();
            this.#mediaCarousel = this.querySelector('.media-gallery__content');
            this.#thumbnailCarousel = this.querySelector('.media-gallery__thumbnails');
            this.#mediaPreviewer = this.querySelector('theme-product-media-preview');
            this.#stickyMediaWrapper = this.querySelector('.media-gallery__sticky-wrapper');
            this.#mediaCarousel.addEventListener('carousel:change', this.#mediaCarouselChangeHandler);
            this.#mediaCarousel.addEventListener('click', this.#mediaCarouseClickHandler.bind(this));
            this.#thumbnailCarousel?.addEventListener('carousel:change', (event) => event.stopPropagation());
            this.#thumbnailCarousel?.addEventListener('click', this.#thumbnailCarouselClickHandler.bind(this));
            this.#mediaPreviewer?.addEventListener('product-media-preview:change', this.#mediaPreviewerChangeHandler);
            this.#mediaPreviewer?.addEventListener('product-media-preview:closed', () => {
                this.#playVideo(this.#mediaCarousel.slides[this.#mediaCarousel.currentIndex].dataset.mediaId);
            });
            this.addEventListener('custom:visible', () => {
                this.dataset.init = 'true';
            }, { capture: true, once: true });
        }
        get #disabledPreview() {
            const disabledPreview = this.getDatasetValue('disabledPreview', 'boolean');
            return themeUtils.isMobileScreen()
                ? this.getDatasetValue('mobileDisabledPreview', 'boolean') || disabledPreview
                : this.getDatasetValue('desktopDisabledPreview', 'boolean') || disabledPreview;
        }
        get #shouldHideOtherVariants() {
            return this.getDatasetValue('hideOtherVariants', 'boolean');
        }
        get #autoPlayVideo() {
            return this.getDatasetValue('videoAutoplay', 'boolean');
        }
        activeMedia(mediaId, forceUpdateList = false) {
            if (forceUpdateList) {
                this.#updateMediaList(mediaId);
            }
            this.#selectThumbnail(mediaId);
            this.#selectMedia(mediaId);
            this.#updateCarouselHeight(mediaId);
            this.#stickyMedia(mediaId);
        }
        #playVideo = themeUtils.debounce((mediaId) => {
            const mediaElement = this.#mediaCarousel.slides.find((slide) => slide.dataset.mediaId === mediaId);
            if (!mediaElement)
                return;
            const videoElement = mediaElement.querySelector('theme-video-media');
            videoElement?.play();
        }, 300);
        #mediaCarouselChangeHandler = themeUtils.debounce((event) => {
            const { detail: { currentSlide }, } = event;
            const { mediaId } = currentSlide.dataset;
            if (!mediaId) {
                return;
            }
            if (!this.#mediaPreviewer?.isOpen && this.#autoPlayVideo) {
                this.#playVideo(mediaId);
            }
            this.#selectThumbnail(mediaId);
            this.#updateCarouselHeight(mediaId);
        }, 100);
        #mediaCarouseClickHandler(event) {
            const clickElement = event.target;
            const clickMedia = clickElement.closest('.media-gallery__item');
            const clickButton = clickElement.closest('button');
            const mediaId = clickMedia?.dataset.mediaId;
            if (!clickButton && clickMedia && mediaId && this.#mediaPreviewer && !this.#disabledPreview) {
                window.ThemeVideoMedia?.pauseAll();
                this.#mediaPreviewer.preview(mediaId);
            }
        }
        #thumbnailCarouselClickHandler(event) {
            const clickElement = event.target;
            const clickThumbnailElement = clickElement.closest('button.media-gallery__thumbnail');
            if (clickThumbnailElement) {
                const { mediaId } = clickThumbnailElement.dataset;
                if (!mediaId) {
                    return;
                }
                this.activeMedia(mediaId);
            }
        }
        #mediaPreviewerChangeHandler = themeUtils.debounce((event) => {
            const { detail: { mediaId }, } = event;
            this.activeMedia(mediaId);
        }, 100);
        #updateMediaList(mediaId) {
            if (!this.#shouldHideOtherVariants)
                return;
            const allMediaElements = Array.from(this.#mediaCarousel.track.children);
            const allMediaThumbnailElements = Array.from(this.#thumbnailCarousel?.track.children ?? []);
            const allElement = [
                ...allMediaElements,
                ...allMediaThumbnailElements,
                ...(this.#mediaPreviewer?.mediaElements ?? []),
            ];
            allElement.forEach((element) => {
                const elementMediaId = element.dataset.mediaId;
                const isVariantMedia = element.dataset.variantMedia === 'true';
                const isHide = isVariantMedia && elementMediaId !== mediaId;
                element.classList.toggle('hidden', !!isHide);
            });
            this.#mediaCarousel.reset();
            this.#thumbnailCarousel?.reset();
            this.#mediaPreviewer?.mediaCarousel?.reset();
        }
        #selectThumbnail(mediaId) {
            if (!this.#thumbnailCarousel) {
                return;
            }
            this.#thumbnailCarousel.slides.forEach((thumbnail) => thumbnail.classList.toggle('is-select', thumbnail.dataset.mediaId === mediaId));
            const index = this.#thumbnailCarousel.slides.findIndex((slide) => slide.dataset.mediaId === mediaId);
            if (index != null && index >= 0) {
                this.#thumbnailCarousel.goToVisible(index);
            }
        }
        #selectMedia(mediaId) {
            const index = this.#mediaCarousel.slides.findIndex((slide) => slide.dataset.mediaId === mediaId);
            if (index >= 0) {
                this.#mediaCarousel.goToVisible(index);
            }
        }
        #updateCarouselHeight(mediaId) {
            if (themeUtils.isMobileScreen()) {
                return;
            }
            const mediaSlide = this.#mediaCarousel.slides.find((slide) => slide.dataset.mediaId === mediaId);
            this.#mediaCarousel.style.setProperty('--current-media-aspect-ratio', mediaSlide?.dataset.aspectRatio ?? '0.65');
        }
        #stickyMedia(mediaId) {
            if (!this.#stickyMediaWrapper) {
                return;
            }
            let mediaElement;
            const slides = Array.from(this.#mediaCarousel.track.children);
            slides.forEach((slide) => {
                const isSelect = slide.dataset.mediaId === mediaId;
                slide.classList.toggle('is-select', isSelect);
                if (isSelect) {
                    mediaElement = slide;
                }
            });
            if (!mediaElement) {
                return;
            }
            this.#stickyMediaWrapper.firstElementChild?.replaceWith(mediaElement.cloneNode(true));
        }
    }
    customElements.define('theme-product-media-gallery', ProductMediaGallery);
});
