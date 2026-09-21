defineModule('theme-main-cart', () => {
    class ThemeMainCart extends BaseElement {
        constructor() {
            super();
            Cart.registerInstance(this);
        }
        get #sectionNames() {
            return this.getRenderConfigs().map((item) => item.section);
        }
        open() { }
        replaceElement(newDocuments) {
            this.#sectionNames.forEach((sectionName) => {
                Cart.replaceHTML(this, newDocuments[sectionName], Cart.getSectionSelectors(sectionName, this.getRenderConfigs()));
            });
        }
        getRenderConfigs() {
            return [
                {
                    section: this.getDatasetValue('sectionId', 'string'),
                    selectors: ['.main-cart-items__content', '.main-cart-footer__inner'],
                },
            ];
        }
    }
    window.customElements.define('theme-main-cart', ThemeMainCart);
});
