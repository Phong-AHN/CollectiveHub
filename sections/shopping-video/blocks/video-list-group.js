defineModule('theme-shopping-video-video-list-group', () => {
    const VIDEO_GROUP_SELECTOR = '.shopping-video__product-video-group';
    const VIDEO_TAG_SELECTOR = 'theme-video-media';
    const VIDEO_AUTOPLAY_SELECTOR = '.shopping-video__video-wrapper-autoplay';
    const VIDEO_TEXT_GROUP_SELECTOR = '.shopping-video__video-text-group-wrapper';
    const VIDEO_GROUP_WITHOUT_TRANSITION = 'shopping-video__product-video-group--without-transition';
    const VIDEO_TEXT_GROUP_FULL_HEIGHT_CLASS = 'shopping-video__video-text-group-wrapper--full-height';
    class VideoListGroup extends VisibleElement {
        carousel;
        track;
        videoGroups = [];
        mediaGroups = [];
        pagers = [];
        indicators = {
            current: null,
            total: null,
        };
        #resizeObserver;
        #activeClass = 'is-active';
        #zoomClass = 'zoom';
        #debouncePreviousHandler = themeUtils.debounce(this.#controllerClickHandler.bind(this, false), 150);
        #debounceNextHandler = themeUtils.debounce(this.#controllerClickHandler.bind(this, true), 150);
        get slides() {
            return this.carousel.slides;
        }
        get canScroll() {
            const { scrollWidth, scrollLeft, clientWidth } = this.track;
            return scrollWidth - scrollLeft !== clientWidth;
        }
        get currentIndex() {
            return this.carousel.currentIndex;
        }
        set currentIndex(value) {
            this.carousel.currentIndex = value;
        }
        get physicalIndex() {
            return this.carousel.physicalIndex;
        }
        set physicalIndex(value) {
            this.carousel.physicalIndex = value;
        }
        get totalPage() {
            return this.carousel.totalPage;
        }
        set totalPage(value) {
            this.carousel.totalPage = value;
        }
        get physicalTotalPage() {
            return this.carousel.physicalTotalPage;
        }
        set physicalTotalPage(value) {
            this.carousel.physicalTotalPage = value;
        }
        constructor() {
            super();
            this.carousel = this.querySelector('theme-carousel');
            if (!this.carousel) {
                throw new Error('[theme-shopping-video-video-list-group]: carousel does not exist!');
            }
            this.carousel.addEventListener('carousel:render', this.#init.bind(this));
        }
        #init() {
            this.track = this.carousel.querySelector('.carousel__track');
            if (!this.track) {
                throw new Error('[theme-shopping-video-video-list-group]: carousel track does not exist!');
            }
            this.carousel.addEventListener('carousel:change', this.#updateView.bind(this));
            this.carousel.addEventListener('carousel:before:loop:reset', this.#handleCarouselBeforeLoopReset.bind(this));
            this.#initMediaGroups();
            this.#initPagination();
            this.#initArrows();
            this.#initPageInfo();
            this.#updateView();
            this.#initSlides();
        }
        #handleCarouselBeforeLoopReset(event) {
            const { targetIndex, physicalIndex, previousPhysicalIndex, slides } = event.detail;
            const indexOffset = previousPhysicalIndex - physicalIndex;
            const previousActiveIndex = targetIndex + indexOffset;
            const previousActiveSlide = slides[previousActiveIndex];
            const previousActiveVideoGroup = this.videoGroups[previousActiveIndex];
            if (!previousActiveVideoGroup)
                return;
            previousActiveVideoGroup.classList.add(VIDEO_GROUP_WITHOUT_TRANSITION);
            previousActiveSlide.classList.add(this.#zoomClass);
            requestAnimationFrame(() => {
                previousActiveSlide.classList.remove(this.#zoomClass);
                previousActiveVideoGroup.classList.remove(VIDEO_GROUP_WITHOUT_TRANSITION);
            });
        }
        #initMediaGroups() {
            this.videoGroups = Array.from(this.track.querySelectorAll(VIDEO_GROUP_SELECTOR));
            this.mediaGroups = Array.from(this.track.querySelectorAll(VIDEO_TAG_SELECTOR));
        }
        #initPagination() {
            this.pagers = Array.from(this.carousel.querySelectorAll('button[name="pager"]'));
            this.pagers.forEach((pager) => pager.addEventListener('click', this.bind(this.#pagerClickHandler)));
            this.indicators.current = this.carousel.queryOwnSelector('span[name="current"]');
            this.indicators.total = this.carousel.queryOwnSelector('span[name="total"]');
        }
        #initArrows() {
            const arrowsPlugin = this.carousel.plugins.arrows;
            arrowsPlugin.handlers.previous = (event) => {
                event.preventDefault();
                const target = event.currentTarget;
                this.#debouncePreviousHandler(target);
            };
            arrowsPlugin.handlers.next = (event) => {
                event.preventDefault();
                const target = event.currentTarget;
                this.#debounceNextHandler(target);
            };
        }
        #initPageInfo() {
            this.physicalTotalPage = this.carousel.slides.length;
            this.totalPage =
                this.carousel.dispatchToPlugin('loop', 'getOriginSlideLength') ?? this.physicalTotalPage;
        }
        #updateIndex(index) {
            this.currentIndex = index;
            this.physicalIndex = index;
        }
        #updateVideos() {
            this.#pauseAllVideos();
            this.#playVideo(this.physicalIndex);
        }
        #initSlides() {
            const slides = this.track.querySelectorAll('li');
            slides.forEach((slide, index) => {
                slide.addEventListener('click', () => {
                    if (this.canScroll) {
                        this.carousel.goTo(index, true, slide);
                        return;
                    }
                    this.#updateIndex(index);
                    this.#updateView();
                }, { capture: true });
            });
        }
        #pauseAllVideos() {
            this.mediaGroups.forEach((themeVideoMedia) => {
                themeVideoMedia.pause();
            });
        }
        #playVideo(index) {
            const videoGroup = this.videoGroups[index];
            if (!videoGroup)
                return;
            if (videoGroup.querySelector(VIDEO_AUTOPLAY_SELECTOR)?.getAttribute('data-autoplay') === 'true') {
                const themeVideoMedia = this.mediaGroups[index];
                if (!themeVideoMedia)
                    return;
                themeVideoMedia.play();
            }
        }
        #updateView() {
            this.#updateCarouselView();
            this.#updateVideos();
        }
        #updateCarouselView() {
            const { currentIndex, physicalIndex, totalPage } = this;
            if (!this.canScroll) {
                this.slides.forEach((slide, index) => slide.classList.toggle(this.#activeClass, currentIndex === index));
            }
            this.pagers.forEach((pager) => {
                const activated = currentIndex === Number(pager.dataset.index);
                pager.classList[activated ? 'add' : 'remove'](this.#activeClass);
            });
            if (this.indicators.current) {
                this.indicators.current.textContent = String(currentIndex + 1);
            }
            if (this.indicators.total) {
                this.indicators.total.textContent = String(totalPage);
            }
            this.videoGroups.forEach((videoGroup, index) => {
                videoGroup
                    .querySelector(VIDEO_TEXT_GROUP_SELECTOR)
                    ?.classList.toggle(VIDEO_TEXT_GROUP_FULL_HEIGHT_CLASS, physicalIndex !== index);
            });
        }
        #controllerClickHandler(direction, targetButton) {
            const { carousel } = this;
            const { physicalTotalPage: totalPage, physicalIndex: currentIndex } = carousel;
            const step = Number(targetButton.dataset.step || 1) * (direction ? 1 : -1);
            const maxIndex = totalPage - 1;
            const minIndex = 0;
            const limitRange = currentIndex !== minIndex && currentIndex !== maxIndex;
            const targetIndex = limitRange ? Math.min(Math.max(currentIndex + step, minIndex), maxIndex) : currentIndex + step;
            const realityTargetIndex = (targetIndex + totalPage) % totalPage;
            if (this.canScroll) {
                const targetSlide = this.carousel.slides[realityTargetIndex];
                carousel.goTo(realityTargetIndex, false, targetSlide);
                return;
            }
            this.#updateIndex(realityTargetIndex);
            this.#updateView();
        }
        #pagerClickHandler(event) {
            const pager = event.currentTarget;
            const index = Number(pager.dataset.index);
            if (!Number.isNaN(index)) {
                event.preventDefault();
                if (!this.canScroll) {
                    this.#updateIndex(index);
                    this.#updateView();
                }
            }
        }
        disconnectedCallback() {
            super.disconnectedCallback();
            this.carousel.removeEventListener('carousel:render', this.#init.bind(this));
            if (this.#resizeObserver) {
                this.#resizeObserver.disconnect();
            }
        }
    }
    customElements.define('video-list-group', VideoListGroup);
});
