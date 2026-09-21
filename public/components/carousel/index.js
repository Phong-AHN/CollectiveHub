defineModule('theme-carousel', () => {
    const ACTIVE_CLASS = 'is-active';
    const TRACK_CLASS = 'carousel__track';
    class CarouselPlugin {
        carousel;
        #bindMethodMap = new WeakMap();
        constructor(carousel) {
            this.carousel = carousel;
            if (this.render) {
                carousel.addEventListener('carousel:internal:render', this.render.bind(this));
            }
            if (this.update) {
                carousel.addEventListener('carousel:change', this.update.bind(this));
            }
            if (this.destory) {
                carousel.addEventListener('carousel:destory', this.destory.bind(this));
            }
        }
        render() { }
        update() { }
        destory() { }
        bind(method) {
            if (this.#bindMethodMap.has(method))
                return this.#bindMethodMap.get(method);
            const result = method.bind(this);
            this.#bindMethodMap.set(method, result);
            return result;
        }
    }
    class CarouselPaginationPlugin extends CarouselPlugin {
        pagers = [];
        indicators = {
            current: null,
            total: null,
        };
        render() {
            const { carousel } = this;
            this.indicators.current = carousel.queryOwnSelector('span[name="current"]');
            this.indicators.total = carousel.queryOwnSelector('span[name="total"]');
            this.pagers = Array.from(carousel.queryOwnSelectorAll('button[name="pager"]'));
            this.pagers.forEach((pager) => pager.addEventListener('click', this.bind(this.#pagerClickHandler)));
            this.update();
        }
        update() {
            const { pagers, carousel, indicators } = this;
            const { currentIndex, totalPage } = carousel;
            pagers.forEach((pager) => {
                const activated = String(currentIndex) === pager.dataset.index;
                pager.classList[activated ? 'add' : 'remove'](ACTIVE_CLASS);
            });
            if (indicators.current) {
                indicators.current.textContent = String(currentIndex + 1);
            }
            if (indicators.total) {
                indicators.total.textContent = String(totalPage);
            }
        }
        #pagerClickHandler(event) {
            const pager = event.currentTarget;
            const index = Number(pager.dataset.index);
            if (!Number.isNaN(index)) {
                event.preventDefault();
                this.carousel.goTo(index);
            }
        }
    }
    class CarouselAutoplayPlugin extends CarouselPlugin {
        #playTimer;
        get enable() {
            return this.carousel.dataset.autoplay === 'true';
        }
        get speed() {
            return Number(this.carousel.dataset.autoplaySpeed || 8) * 1000;
        }
        get isLastPage() {
            const { carousel } = this;
            return carousel.loop ? false : carousel.currentIndex === carousel.totalPage - 1;
        }
        render() {
            this.update();
        }
        update() {
            if (this.enable) {
                this.play();
            }
        }
        play() {
            if (this.isLastPage)
                return;
            const { carousel } = this;
            clearTimeout(this.#playTimer);
            this.#playTimer = setTimeout(() => {
                const targetIndex = carousel.physicalIndex + 1;
                const targetSlide = carousel.slides[targetIndex];
                carousel.goTo(targetIndex, false, targetSlide);
            }, this.speed);
        }
        pause() {
            clearTimeout(this.#playTimer);
        }
    }
    class CarouselArrowsPlugin extends CarouselPlugin {
        controller = {
            prev: null,
            next: null,
        };
        handlers = {};
        #debouncePreviousHandler = themeUtils.debounce(this.#controllerClickHandler.bind(this, false), 150);
        #debounceNextHandler = themeUtils.debounce(this.#controllerClickHandler.bind(this, true), 150);
        render() {
            const { carousel, controller, handlers } = this;
            controller.prev = carousel.queryOwnSelector('button[name="previous"]');
            controller.next = carousel.queryOwnSelector('button[name="next"]');
            if (controller.prev) {
                handlers.previous =
                    handlers.previous ||
                        ((event) => {
                            event.preventDefault();
                            const target = event.currentTarget;
                            this.#debouncePreviousHandler(target);
                        });
                controller.prev.addEventListener('click', handlers.previous);
            }
            if (controller.next) {
                handlers.next =
                    handlers.next ||
                        ((event) => {
                            event.preventDefault();
                            const target = event.currentTarget;
                            this.#debounceNextHandler(target);
                        });
                controller.next.addEventListener('click', handlers.next);
            }
            this.update();
        }
        update() {
            const { carousel, controller } = this;
            if (carousel.loop) {
                return;
            }
            this.#disableController(controller.prev, carousel.currentIndex === 0);
            this.#disableController(controller.next, carousel.currentIndex + 1 === carousel.totalPage);
        }
        #controllerClickHandler(direction, targetButton) {
            const { carousel } = this;
            const { physicalTotalPage: totalPage, physicalIndex: currentIndex, loop } = carousel;
            const step = Number(targetButton.dataset.step || 1) * (direction ? 1 : -1);
            const maxIndex = totalPage - 1;
            const minIndex = 0;
            const limitRange = !loop || (currentIndex !== minIndex && currentIndex !== maxIndex);
            const targetIndex = limitRange ? Math.min(Math.max(currentIndex + step, minIndex), maxIndex) : currentIndex + step;
            const realityTargetIndex = (targetIndex + totalPage) % totalPage;
            const targetSlide = this.carousel.slides[realityTargetIndex];
            carousel.goTo(realityTargetIndex, false, targetSlide);
        }
        #disableController(controller, disabled) {
            if (!controller) {
                return;
            }
            if (disabled) {
                controller.setAttribute('disabled', 'disabled');
            }
            else {
                controller.removeAttribute('disabled');
            }
        }
    }
    class CarouselLoopPlugin extends CarouselPlugin {
        #originTrackSizes = null;
        #effectTrackClientSizeDiff = 0;
        #intersectionObserver;
        #hasResetLoopTask = false;
        #track_scroll_behavior_auto_class = 'carousel__track-scroll-behavior--auto';
        #track_scroll_snap_type_none_class = 'carousel__track-scroll-snap-type--none';
        get physicalIndex() {
            return this.carousel.physicalIndex;
        }
        set physicalIndex(value) {
            this.carousel.physicalIndex = value;
        }
        set currentIndex(value) {
            this.carousel.currentIndex = value;
        }
        get originTotalPage() {
            return this.slides.filter((slide) => !slide.getAttribute('data-cloned')).length;
        }
        get totalPage() {
            return this.carousel.totalPage;
        }
        get track() {
            return this.carousel.track;
        }
        get slides() {
            return this.carousel.slides;
        }
        set slides(value) {
            this.carousel.slides = value;
        }
        get firstOriginSlideIndex() {
            return Math.max(this.carousel.slides.findIndex((slide) => !slide.getAttribute('data-cloned')), 0);
        }
        get cloneCount() {
            return Math.floor(Number(this.carousel.dataset.cloneCount)) || 2;
        }
        render() {
            if (this.slides.length <= 1) {
                return;
            }
            const trackSizes = this.carousel.getElementSizes(this.track);
            const baseTrackScrollSize = this.#originTrackSizes === null ? trackSizes.scrollSize : this.#originTrackSizes.scrollSize;
            if (baseTrackScrollSize <= trackSizes.clientSize - this.#effectTrackClientSizeDiff) {
                this.#removeLoopNode();
                return;
            }
            this.#effectTrackClientSizeDiff = 0;
            if (this.track.querySelector('[data-cloned]')) {
                return;
            }
            this.track.classList.add(this.#track_scroll_snap_type_none_class);
            this.#operateLoopNode();
            this.#goToInitSlide();
            requestAnimationFrame(() => {
                this.track.classList.remove(this.#track_scroll_snap_type_none_class);
            });
        }
        update(event) {
            if (!this.#hasResetLoopTask || !event?.detail) {
                return;
            }
            const { physicalIndex } = event.detail;
            const slideMapIndex = Number(this.slides[physicalIndex].getAttribute('data-clone-index')) || 0;
            const targetIndex = this.firstOriginSlideIndex + slideMapIndex;
            this.carousel.emit('carousel:before:loop:reset', {
                ...event.detail,
                targetIndex,
                slides: this.slides,
            });
            const targetSlide = this.slides[targetIndex];
            this.#scrollToSlideWithAutoBehavior(targetIndex, targetSlide);
            this.currentIndex = slideMapIndex;
            this.physicalIndex = targetIndex;
            this.#hasResetLoopTask = false;
        }
        getGoToSlide(targetIndex) {
            let leftPoint = this.physicalIndex;
            let rightPoint = this.physicalIndex;
            for (let i = 0; i < this.slides.length; i++) {
                const leftOriginIndex = this.getOriginIndex(leftPoint);
                const rightOriginIndex = this.getOriginIndex(rightPoint);
                if (leftOriginIndex === targetIndex) {
                    return this.slides[leftPoint];
                }
                if (rightOriginIndex === targetIndex) {
                    return this.slides[rightPoint];
                }
                leftPoint = Math.max(leftPoint - 1, 0);
                rightPoint = Math.min(rightPoint + 1, this.slides.length - 1);
            }
            return this.slides[(targetIndex + this.originTotalPage) % this.originTotalPage];
        }
        getOriginIndex(index) {
            if (!this.#hasClonedElement()) {
                return index;
            }
            const { carousel } = this;
            return Number(carousel.slides[index].getAttribute('data-clone-index') ?? index - this.firstOriginSlideIndex);
        }
        getInitIndex(initIndex) {
            if (!this.#hasClonedElement()) {
                return initIndex;
            }
            return this.firstOriginSlideIndex + initIndex;
        }
        getOriginTotalPage() {
            return this.originTotalPage;
        }
        getOriginSlideLength() {
            return this.slides.filter((slide) => !slide.getAttribute('data-cloned')).length;
        }
        getOriginTrackSizes() {
            return this.#originTrackSizes;
        }
        #goToInitSlide() {
            const initIndex = this.firstOriginSlideIndex + this.physicalIndex;
            const initSlide = this.slides[initIndex];
            this.#scrollToSlideWithAutoBehavior(initIndex, initSlide);
        }
        #scrollToSlideWithAutoBehavior(targetIndex, targetSlide) {
            this.carousel.track.classList.add(this.#track_scroll_behavior_auto_class);
            this.carousel.goTo(targetIndex, true, targetSlide);
            requestAnimationFrame(() => {
                this.carousel.track.classList.remove(this.#track_scroll_behavior_auto_class);
            });
        }
        #operateLoopNode() {
            const trackSizes = this.carousel.getElementSizes(this.track);
            this.#originTrackSizes = trackSizes;
            const cloneMode = this.slides.some((slide) => this.carousel.getElementSizes(slide).clientSize < trackSizes.clientSize)
                ? 'group'
                : 'single';
            const [beforeCloneSlides, afterCloneSlides] = this.#getEdgeSlides(cloneMode, this.cloneCount);
            this.track.prepend(...beforeCloneSlides);
            this.track.append(...afterCloneSlides);
            const clonedTrackSizes = this.carousel.getElementSizes(this.track);
            this.#effectTrackClientSizeDiff = clonedTrackSizes.clientSize - this.#originTrackSizes.clientSize;
            this.carousel.slides = Array.from(this.track.children).filter((slide) => slide.clientWidth > 0);
            this.#intersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    this.#hasResetLoopTask = entry.isIntersecting;
                });
            });
            const firstCloneSlide = beforeCloneSlides[0];
            const lastCloneSlide = afterCloneSlides[afterCloneSlides.length - 1];
            this.#intersectionObserver.observe(firstCloneSlide);
            this.#intersectionObserver.observe(lastCloneSlide);
        }
        #getEdgeSlides(mode, count) {
            const cloneCount = Math.max(count, 2);
            return mode === 'single' ? this.#getSingleModeSlides(cloneCount) : this.#getGroupModeSlides(cloneCount);
        }
        #getSingleModeSlides(cloneCount) {
            const slidesLength = this.slides.length;
            const beforeSlides = this.slides
                .slice(slidesLength - cloneCount)
                .map((slide, index) => this.#cloneSlide(slide, slidesLength - cloneCount + index));
            const afterSlides = this.slides.slice(0, cloneCount).map((slide, index) => this.#cloneSlide(slide, index));
            return [beforeSlides, afterSlides];
        }
        #getGroupModeSlides(cloneCount) {
            const beforeSlides = [];
            const afterSlides = [];
            const halfCount = cloneCount;
            for (let i = 0; i < cloneCount * 2; i++) {
                const isBeforeHalf = i < halfCount;
                const targetArray = isBeforeHalf ? beforeSlides : afterSlides;
                for (let j = 0; j < this.slides.length; j++) {
                    targetArray.push(this.#cloneSlide(this.slides[j], j));
                }
            }
            return [beforeSlides, afterSlides];
        }
        #cloneSlide(slide, index) {
            const clonedSlide = slide.cloneNode(true);
            clonedSlide.setAttribute('data-cloned', 'true');
            clonedSlide.setAttribute('data-clone-index', String(index));
            clonedSlide.classList.remove(ACTIVE_CLASS);
            this.#removeNodeEffectAttr(clonedSlide, 'data-shopline-editor-block');
            return clonedSlide;
        }
        #removeLoopNode() {
            this.carousel.track.querySelectorAll('[data-cloned]').forEach((node) => node.remove());
        }
        #removeNodeEffectAttr(node, effectAttr) {
            const stack = [node];
            while (stack.length) {
                const current = stack.pop();
                if (current) {
                    current.removeAttribute(effectAttr);
                    const children = Array.from(current.children);
                    stack.push(...children);
                }
            }
        }
        #hasClonedElement() {
            return this.slides.some((slide) => slide.getAttribute('data-cloned') === 'true');
        }
    }
    class Carousel extends VisibleElement {
        track;
        slides = [];
        totalPage = 0;
        plugins;
        physicalIndex = 0;
        physicalTotalPage = 0;
        #resizeObserver;
        get currentIndex() {
            return Number(this.dataset.currentIndex) || 0;
        }
        set currentIndex(value) {
            this.dataset.currentIndex = String(value);
            this.style.setProperty('--current-index', String(value));
        }
        get loop() {
            return this.getDatasetValue('loop', 'boolean');
        }
        get restorePosition() {
            return this.getDatasetValue('restorePosition', 'boolean');
        }
        get direction() {
            const { desktopDirection, mobileDirection, direction = 'horizontal' } = this.dataset;
            if (desktopDirection || mobileDirection) {
                const isMobile = themeUtils.isMobileScreen();
                return (isMobile ? mobileDirection : desktopDirection) || direction;
            }
            return direction;
        }
        get scrollSnapAlign() {
            return this.getDatasetValue('scrollSnapAlign', 'string') || 'start';
        }
        constructor() {
            super();
            this.track = this.queryOwnSelector(`.${TRACK_CLASS}`);
            if (!this.track) {
                throw new Error('[theme-carousel]: carousel track does not exist!');
            }
            this.plugins = {
                ...(this.loop && { loop: new CarouselLoopPlugin(this) }),
                autoplay: new CarouselAutoplayPlugin(this),
                arrows: new CarouselArrowsPlugin(this),
                pagination: new CarouselPaginationPlugin(this),
            };
            this.addEventListener('custom:visible', () => {
                this.#init();
                const resizeHandler = themeUtils.throttle(this.bind(this.#init), 100);
                this.#resizeObserver = new ResizeObserver(resizeHandler);
                this.#resizeObserver.observe(this.track);
                const scrollHandler = themeUtils.debounce(this.bind(this.#slideUpdate), 100);
                this.track.addEventListener('scroll', scrollHandler);
            }, { once: true });
        }
        disconnectedCallback() {
            super.disconnectedCallback();
            this.emit('carousel:destory');
            if (this.#resizeObserver) {
                this.#resizeObserver.disconnect();
            }
        }
        goTo(index, force, slide) {
            if (index === this.currentIndex && !force)
                return;
            this.emit('carousel:before:move', {
                currentIndex: this.currentIndex,
            });
            let targetSlide = slide ?? this.slides[index];
            if (!slide && this.loop) {
                targetSlide = this.dispatchToPlugin('loop', 'getGoToSlide', index);
            }
            if (targetSlide) {
                const trackSizes = this.getElementSizes(this.track);
                let scrollOffset = 0;
                const targetSlideSizes = this.getElementSizes(targetSlide);
                if (this.scrollSnapAlign === 'center') {
                    scrollOffset = targetSlideSizes.offsetStart - trackSizes.clientSize / 2 + targetSlideSizes.clientSize / 2;
                }
                else if (this.scrollSnapAlign === 'start') {
                    scrollOffset = targetSlideSizes.offsetStart;
                }
                else if (this.scrollSnapAlign === 'end') {
                    scrollOffset = targetSlideSizes.offsetStart + targetSlideSizes.clientSize - trackSizes.clientSize;
                }
                this.track.scrollTo(this.direction === 'vertical' ? { top: scrollOffset } : { left: scrollOffset });
            }
        }
        goToVisible(index) {
            const { track, slides, loop } = this;
            const targetSlide = loop ? this.dispatchToPlugin('loop', 'getGoToSlide', index) : slides[index];
            if (targetSlide) {
                const trackSizes = this.getElementSizes(track);
                const isVisible = this.#isVisibleSlide(trackSizes, targetSlide);
                if (!isVisible) {
                    this.goTo(index);
                }
            }
        }
        reset() {
            if (this.visible) {
                this.#init();
            }
            else {
                this.addEventListener('custom:visible', this.bind(this.#init), { once: true });
            }
        }
        getElementSizes(element) {
            if (this.direction === 'vertical') {
                return {
                    clientSize: element.clientHeight,
                    scrollSize: element.scrollHeight,
                    scrollStart: element.scrollTop,
                    offsetStart: element.offsetTop,
                };
            }
            return {
                clientSize: element.clientWidth,
                scrollSize: element.scrollWidth,
                scrollStart: element.scrollLeft,
                offsetStart: element.offsetLeft,
            };
        }
        dispatchToPlugin(pluginName, eventName, data) {
            const plugin = this.plugins[pluginName];
            if (!plugin || typeof plugin[eventName] !== 'function')
                return null;
            return plugin[eventName](data);
        }
        #init() {
            this.slides = Array.from(this.track.children).filter((slide) => slide.clientWidth > 0);
            this.#initPageInfo();
            if (this.restorePosition) {
                this.goTo(this.currentIndex, true);
            }
            this.addEventListener('carousel:change', this.bind(this.#updateView));
            this.emit('carousel:internal:render', undefined, {
                bubbles: false,
            });
            this.emit('carousel:render', undefined, {
                bubbles: false,
            });
        }
        #initPageInfo() {
            this.currentIndex = this.#getInitIndex();
            this.totalPage = this.#getTotalPage();
            this.physicalIndex = this.currentIndex;
            this.physicalTotalPage = this.totalPage;
            if (this.loop) {
                this.physicalIndex = this.dispatchToPlugin('loop', 'getInitIndex', this.currentIndex);
                const originSlideLength = this.dispatchToPlugin('loop', 'getOriginSlideLength');
                this.physicalTotalPage = this.slides.length - (originSlideLength - this.totalPage);
            }
        }
        #updateView() {
            this.slides.forEach((slide, index) => slide.classList.toggle(ACTIVE_CLASS, index === this.physicalIndex));
        }
        #slideUpdate() {
            const { currentIndex: previousIndex, slides } = this;
            const activeIndex = this.#getCalculatedActiveIndex();
            if (activeIndex < 0 || activeIndex >= this.physicalTotalPage) {
                return;
            }
            const activeSlide = slides[activeIndex];
            let eventDetail = {
                currentIndex: activeIndex,
                currentSlide: activeSlide,
                previousIndex,
            };
            let logicIndex = activeIndex;
            if (this.loop) {
                logicIndex = this.dispatchToPlugin('loop', 'getOriginIndex', activeIndex);
                eventDetail = {
                    ...eventDetail,
                    currentIndex: logicIndex,
                    physicalIndex: activeIndex,
                    previousPhysicalIndex: this.physicalIndex,
                };
            }
            this.currentIndex = logicIndex;
            this.physicalIndex = activeIndex;
            this.#updateView();
            this.emit('carousel:change', eventDetail, {
                bubbles: false,
            });
        }
        #getCalculatedActiveIndex() {
            const trackSizes = this.getElementSizes(this.track);
            let currentIndex = -1;
            if (this.scrollSnapAlign === 'start') {
                currentIndex = this.#getFirstVisibleSlideIndex(trackSizes);
            }
            else if (this.scrollSnapAlign === 'end') {
                currentIndex = this.#getLastVisibleSlideIndex(trackSizes);
            }
            else if (this.scrollSnapAlign === 'center') {
                currentIndex = this.#getCenterVisibleSlideIndex(trackSizes);
            }
            return currentIndex < 0 ? 0 : currentIndex;
        }
        #getFirstVisibleSlideIndex(trackSizes) {
            return this.slides.findIndex((slide) => this.#isVisibleSlide(trackSizes, slide));
        }
        #getLastVisibleSlideIndex(trackSizes) {
            return this.slides.findLastIndex((slide) => this.#isVisibleSlide(trackSizes, slide));
        }
        #getCenterVisibleSlideIndex(trackSizes) {
            return this.slides.findIndex((slide) => {
                const slideSizes = this.getElementSizes(slide);
                return (Math.abs(trackSizes.clientSize / 2 + trackSizes.scrollStart - slideSizes.offsetStart) <= slideSizes.clientSize);
            });
        }
        #getInitIndex() {
            let index = this.slides.findIndex((slide) => slide.classList.contains(ACTIVE_CLASS));
            if (this.loop) {
                index = this.dispatchToPlugin('loop', 'getOriginIndex', Math.max(index, 0));
            }
            return index < 0 ? 0 : index;
        }
        #isVisibleSlide(trackSizes, slide) {
            const slideSizes = this.getElementSizes(slide);
            const isAfterTrackLeft = slideSizes.offsetStart - trackSizes.scrollStart >= -1;
            const isBeforeTrackRight = trackSizes.scrollStart + trackSizes.clientSize - (slideSizes.offsetStart + slideSizes.clientSize) >= -1;
            return slideSizes.clientSize > 0 && isAfterTrackLeft && isBeforeTrackRight;
        }
        #getTotalPage() {
            const { track, slides, loop } = this;
            const slideLength = slides.length;
            if (slideLength <= 1) {
                return slideLength;
            }
            const trackSizes = this.getElementSizes(track);
            let slideWithInScreenNum = 1;
            for (let i = slideLength - 2; i >= 0; i -= 1) {
                const slide = slides[i];
                const slideSizes = this.getElementSizes(slide);
                if (trackSizes.scrollSize - slideSizes.offsetStart < trackSizes.clientSize + 1) {
                    slideWithInScreenNum += 1;
                }
                else {
                    break;
                }
            }
            const baseTotalPage = loop
                ? this.dispatchToPlugin('loop', 'getOriginSlideLength')
                : slideLength;
            return baseTotalPage - slideWithInScreenNum + 1;
        }
    }
    customElements.define('theme-carousel', Carousel);
});
