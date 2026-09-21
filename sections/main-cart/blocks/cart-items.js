defineModule('theme-main-cart-items', () => {
    class ThemeMainCartItems extends CartItems {
        constructor() {
            super();
            this.addEventListener('change', themeUtils.debounce(async (event) => {
                const { detail } = event || {};
                await this.quantityChange({ event, ...detail });
            }, 300));
            if (window.Shopline.i18nInit) {
                window.Shopline.i18nInit();
            }
        }
    }
    window.customElements.define('theme-main-cart-items', ThemeMainCartItems);
});
