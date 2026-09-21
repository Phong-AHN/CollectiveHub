defineModule('theme-text-columns-with-image-slider', () => {
    class ThemeTextColumnsWithImageSlider extends BaseElement {
        static SLIDER_SELECTER = '[data-role="slider"]';
        static SLIDE_SELECTER = '[data-role="slide"]';
        static INDICATOR_SELECTER = '[data-role="indicator"]';
        static PREV_SELECTER = '[data-role="prev"]';
        static NEXT_SELECTER = '[data-role="next"]';
        #getSlides() {
            return this.querySelectorAll(ThemeTextColumnsWithImageSlider.SLIDE_SELECTER);
        }
        #getCurrentIndex(slides = this.#getSlides()) {
            const slider = this.querySelector(ThemeTextColumnsWithImageSlider.SLIDER_SELECTER);
            if (!slider) {
                return 0;
            }
            let closest = 0;
            let minDistance = Infinity;
            const containerCenter = slider.scrollLeft + slider.offsetWidth / 2;
            slides.forEach((slide, i) => {
                const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
                const distance = Math.abs(containerCenter - slideCenter);
                if (distance < minDistance) {
                    minDistance = distance;
                    closest = i;
                }
            });
            return closest;
        }
        #renderIndicator(slides = this.#getSlides(), index = this.#getCurrentIndex(slides)) {
            const element = this.querySelector(ThemeTextColumnsWithImageSlider.INDICATOR_SELECTER);
            if (!element) {
                return;
            }
            element.innerHTML = `${index + 1}/${slides.length}`;
        }
        #scrollendHandler = () => {
            this.#renderIndicator();
        };
        #prevHandler = (event) => {
            const targets = event.composedPath();
            if (!this.#isMatchingTarget(targets, ThemeTextColumnsWithImageSlider.PREV_SELECTER)) {
                return;
            }
            this.prev();
        };
        #nextHandler = (event) => {
            const targets = event.composedPath();
            if (!this.#isMatchingTarget(targets, ThemeTextColumnsWithImageSlider.NEXT_SELECTER)) {
                return;
            }
            this.next();
        };
        #isMatchingTarget(targets, selector) {
            return targets.some((target) => {
                if (!(target instanceof HTMLElement)) {
                    return false;
                }
                return target.matches(selector);
            });
        }
        mounted() {
            this.addEventListener('click', this.#prevHandler);
            this.addEventListener('click', this.#nextHandler);
            this.addEventListener('wheel', this.#scrollendHandler);
            this.addEventListener('touchend', this.#scrollendHandler);
        }
        unmounted() {
            this.removeEventListener('click', this.#prevHandler);
            this.removeEventListener('click', this.#nextHandler);
            this.removeEventListener('wheel', this.#scrollendHandler);
            this.removeEventListener('touchend', this.#scrollendHandler);
        }
        get currentIndex() {
            return this.#getCurrentIndex();
        }
        updateIndex(index) {
            const slides = this.#getSlides();
            if (index < 0) {
                index = slides.length - 1;
            }
            else if (index >= slides.length) {
                index = 0;
            }
            slides[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            this.#renderIndicator(this.#getSlides(), index);
        }
        prev() {
            this.updateIndex(this.currentIndex - 1);
        }
        next() {
            this.updateIndex(this.currentIndex + 1);
        }
    }
    customElements.define('theme-text-columns-with-image-slider', ThemeTextColumnsWithImageSlider);
});
