class MediaPromotionProductCard {
    element;
    carousel;
    arrowContainer;
    resizeObserver = null;
    resizeObserverTarget = null;
    boundRenderHandler;
    boundChangeHandler;
    boundResizeHandler;
    mobileMediaQuery = null;
    constructor(element) {
        this.element = element;
        this.carousel = this.element.querySelector('.product-card__carousel');
        this.arrowContainer = this.carousel?.querySelector('.product-card__carousel-arrows') ?? null;
        this.boundRenderHandler = this.updateArrowPosition.bind(this);
        this.boundChangeHandler = this.updateArrowPosition.bind(this);
        this.boundResizeHandler = this.updateArrowPosition.bind(this);
        this.init();
    }
    init() {
        if (!this.carousel || !this.arrowContainer)
            return;
        if (this.element.hasAttribute('data-media-promotion-product-card-bound')) {
            return;
        }
        this.element.setAttribute('data-media-promotion-product-card-bound', 'true');
        this.carousel.addEventListener('carousel:render', this.boundRenderHandler, {
            once: false,
        });
        this.carousel.addEventListener('carousel:change', this.boundChangeHandler);
        if (!('ResizeObserver' in window)) {
            window.addEventListener('resize', this.boundResizeHandler, { passive: true });
        }
        if ('matchMedia' in window) {
            this.mobileMediaQuery = window.matchMedia('(max-width: 959px)');
            if ('addEventListener' in this.mobileMediaQuery) {
                this.mobileMediaQuery.addEventListener('change', this.boundResizeHandler);
            }
            else if ('addListener' in this.mobileMediaQuery) {
                this.mobileMediaQuery.addListener(this.boundResizeHandler);
            }
        }
        this.updateArrowPosition();
    }
    updateArrowPosition(event) {
        if (!this.carousel || !this.arrowContainer)
            return;
        const slideFromEvent = event?.detail
            ?.currentSlide;
        const activeSlide = slideFromEvent ??
            this.carousel.querySelector('.carousel__slide.is-active') ??
            this.carousel.querySelector('.carousel__slide');
        if (!activeSlide)
            return;
        const imageContainer = activeSlide.querySelector('.product-card__image-container');
        if (!imageContainer)
            return;
        const applyPosition = () => {
            const carouselRect = this.carousel.getBoundingClientRect();
            const imageRect = imageContainer.getBoundingClientRect();
            const center = imageRect.top - carouselRect.top + imageRect.height / 2;
            const { height } = imageRect;
            const gap = this.mobileMediaQuery?.matches ? 10 : 20;
            const insetStart = Math.max(imageRect.left - carouselRect.left + gap, gap);
            const insetEnd = Math.max(carouselRect.right - imageRect.right + gap, gap);
            this.arrowContainer.style.top = `${center}px`;
            this.arrowContainer.style.left = `${insetStart}px`;
            this.arrowContainer.style.right = `${insetEnd}px`;
            this.arrowContainer.style.height = `${height}px`;
            this.observeImage(imageContainer);
        };
        if ('requestAnimationFrame' in window) {
            requestAnimationFrame(applyPosition);
        }
        else {
            applyPosition();
        }
    }
    observeImage(image) {
        if (!('ResizeObserver' in window)) {
            return;
        }
        if (!this.resizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.updateArrowPosition();
            });
        }
        if (this.resizeObserverTarget === image) {
            return;
        }
        this.resizeObserver.disconnect();
        this.resizeObserver.observe(image);
        this.resizeObserverTarget = image;
    }
}
const initializeMediaPromotionProductCards = (root = document) => {
    const products = [];
    if (root instanceof HTMLElement && root.matches('theme-product-card-media-promotion')) {
        products.push(root);
    }
    products.push(...Array.from(root.querySelectorAll('theme-product-card-media-promotion')));
    products.forEach((product) => {
        new MediaPromotionProductCard(product);
    });
};
document.addEventListener('DOMContentLoaded', () => {
    initializeMediaPromotionProductCards();
});
const productCardObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement))
                return;
            initializeMediaPromotionProductCards(node);
        });
    });
});
productCardObserver.observe(document.body, {
    childList: true,
    subtree: true,
});
