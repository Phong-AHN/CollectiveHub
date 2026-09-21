defineModule('theme-shopping-video-product-card-group', () => {
    class ShoppingVideoProductCardGroup extends VisibleElement {
        get showExpandButton() {
            return this.getDatasetValue('showExpandButton', 'boolean');
        }
        get productCardExpand() {
            return this.getDatasetValue('productCardExpand', 'boolean');
        }
        toggleButton;
        #groupClass = 'shopping-video__product-card-group';
        #toggleButtonClass = 'shopping-video__product-card-operate-wrapper-toggle';
        mounted() {
            if (this.showExpandButton) {
                const toggleButton = this.querySelector(`.${this.#toggleButtonClass}`);
                if (!toggleButton) {
                    throw new Error('[theme-shopping-video-operate-toggle]: toggle button does not exist!');
                }
                this.toggleButton = toggleButton;
                toggleButton.addEventListener('click', () => {
                    this.toggleExpand();
                });
            }
            if (this.productCardExpand) {
                this.addExpand();
            }
        }
        unmounted() {
            this.toggleButton?.removeEventListener('click', this.toggleExpand);
        }
        toggleExpand() {
            this.toggleButton?.classList.toggle(`${this.#toggleButtonClass}--expand`);
            this.classList.toggle(`${this.#groupClass}--expand`);
        }
        addExpand() {
            this.toggleButton?.classList.add(`${this.#toggleButtonClass}--expand`);
            this.classList.add(`${this.#groupClass}--expand`);
        }
    }
    customElements.define('theme-shopping-video-product-card-group', ShoppingVideoProductCardGroup);
});
