defineModule('theme-before-after', () => {
    class BeforeAfter extends BaseElement {
        #textElementList;
        #paperNumber;
        beforeAfterCarousel;
        constructor() {
            super();
            this.beforeAfterCarousel = this.querySelector('theme-carousel');
            this.#paperNumber = this.querySelector('.before-after__pager--number-current');
            this.#textElementList = this.querySelectorAll('.before-after__compare-text .before-after__compare-text-item');
            this.beforeAfterCarousel.addEventListener('carousel:change', themeUtils.debounce(this.#carouselChangeHandler.bind(this), 200));
        }
        #carouselChangeHandler(event) {
            const { currentIndex } = event.detail;
            this.#textElementList?.forEach((el, ind) => {
                if (ind === currentIndex) {
                    el.classList.remove('hidden');
                }
                else {
                    el.classList.add('hidden');
                }
            });
            if (this.#paperNumber) {
                this.#paperNumber.innerText = currentIndex + 1;
            }
        }
    }
    window.customElements.define('theme-before-after', BeforeAfter);
});
