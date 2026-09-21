class MediaPromotionArrowHandler {
    element;
    carousel;
    constructor(element) {
        this.element = element;
        this.carousel = element.querySelector('theme-carousel');
        if (!this.carousel) {
            return;
        }
        this.carousel.addEventListener('carousel:render', () => {
            this.bindArrowEvents();
            this.updateArrowStates();
        }, { once: true });
        this.carousel.addEventListener('carousel:change', () => {
            this.updateArrowStates();
        });
        if (this.carousel.dataset.currentIndex !== undefined) {
            this.bindArrowEvents();
            this.updateArrowStates();
        }
    }
    bindArrowEvents() {
        const mediaContainers = this.element.querySelectorAll('.media-container');
        mediaContainers.forEach((mediaContainer) => {
            const arrowContainer = mediaContainer.querySelector('.media-container__pager--arrows');
            if (!arrowContainer)
                return;
            const prevButtons = arrowContainer.querySelectorAll('button[name="previous"]');
            const nextButtons = arrowContainer.querySelectorAll('button[name="next"]');
            prevButtons.forEach((element) => {
                const button = element;
                if (!button.hasAttribute('data-media-promotion-arrow-bound')) {
                    button.setAttribute('data-media-promotion-arrow-bound', 'true');
                    button.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.goToPrevious();
                    });
                }
            });
            nextButtons.forEach((element) => {
                const button = element;
                if (!button.hasAttribute('data-media-promotion-arrow-bound')) {
                    button.setAttribute('data-media-promotion-arrow-bound', 'true');
                    button.addEventListener('click', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.goToNext();
                    });
                }
            });
        });
    }
    updateArrowStates() {
        if (!this.carousel)
            return;
        const { currentIndex, totalPage: totalPages, loop } = this.carousel;
        const mediaContainers = this.element.querySelectorAll('.media-container');
        mediaContainers.forEach((mediaContainer) => {
            const arrowContainer = mediaContainer.querySelector('.media-container__pager--arrows');
            if (!arrowContainer)
                return;
            const prevButtons = arrowContainer.querySelectorAll('button[name="previous"]');
            const nextButtons = arrowContainer.querySelectorAll('button[name="next"]');
            const isFirstPage = !loop && currentIndex === 0;
            const isLastPage = !loop && currentIndex + 1 === totalPages;
            prevButtons.forEach((button) => {
                if (isFirstPage) {
                    button.setAttribute('disabled', 'disabled');
                }
                else {
                    button.removeAttribute('disabled');
                }
            });
            nextButtons.forEach((button) => {
                if (isLastPage) {
                    button.setAttribute('disabled', 'disabled');
                }
                else {
                    button.removeAttribute('disabled');
                }
            });
        });
    }
    goToPrevious() {
        if (!this.carousel)
            return;
        const { currentIndex, totalPage: totalPages, loop } = this.carousel;
        if (!loop && currentIndex === 0)
            return;
        const step = -1;
        const maxIndex = totalPages - 1;
        const minIndex = 0;
        let targetIndex;
        if (loop) {
            targetIndex = (currentIndex + step + totalPages) % totalPages;
        }
        else {
            const limitRange = currentIndex !== minIndex && currentIndex !== maxIndex;
            targetIndex = limitRange ? Math.max(currentIndex + step, minIndex) : currentIndex + step;
            targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));
        }
        this.carousel.goTo(targetIndex);
    }
    goToNext() {
        if (!this.carousel)
            return;
        const { currentIndex, totalPage: totalPages, loop } = this.carousel;
        if (!loop && currentIndex + 1 === totalPages)
            return;
        const step = 1;
        const maxIndex = totalPages - 1;
        const minIndex = 0;
        let targetIndex;
        if (loop) {
            targetIndex = (currentIndex + step) % totalPages;
        }
        else {
            const limitRange = currentIndex !== minIndex && currentIndex !== maxIndex;
            targetIndex = limitRange ? Math.min(currentIndex + step, maxIndex) : currentIndex + step;
            targetIndex = Math.max(0, Math.min(targetIndex, maxIndex));
        }
        this.carousel.goTo(targetIndex);
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const mediaPromotionElements = document.querySelectorAll('.media-promotion');
    mediaPromotionElements.forEach((element) => {
        new MediaPromotionArrowHandler(element);
    });
});
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node;
                if (element.classList && element.classList.contains('media-promotion')) {
                    new MediaPromotionArrowHandler(element);
                }
                if (element.querySelectorAll) {
                    const mediaPromotionElements = element.querySelectorAll('.media-promotion');
                    mediaPromotionElements.forEach((promotionElement) => {
                        new MediaPromotionArrowHandler(promotionElement);
                    });
                }
            }
        });
    });
});
observer.observe(document.body, {
    childList: true,
    subtree: true,
});
