defineModule('main-collection-products', () => {
    class MainCollectionProducts extends BaseElement {
        constructor() {
            super();
            this.addEventListener('multi-column-switcher:click', (event) => {
                const customEvent = event;
                const { mobileColumns } = customEvent.detail;
                const listEl = this.querySelector('.main-collection__list');
                listEl?.style.setProperty('--mobile-columns', mobileColumns);
            });
        }
    }
    window.customElements.define('theme-main-collection-products', MainCollectionProducts);
});
