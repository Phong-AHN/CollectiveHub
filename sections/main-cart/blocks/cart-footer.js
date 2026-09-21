defineModule('theme-main-cart-footer', () => {
    class ThemeMainCartFooter extends VisibleElement {
        get #themeCartFixedCheckoutElement() {
            return this.querySelector('theme-cart-fixed-checkout');
        }
        constructor() {
            super();
            this.#init();
            this.addEventListener('custom:visible', () => this.#fixedCheckoutHide(), { once: false });
            this.addEventListener('custom:hidden', () => this.#fixedCheckoutShow(), { once: false });
        }
        #init() {
            if (this.visible) {
                this.#fixedCheckoutHide();
            }
            else {
                this.#fixedCheckoutShow();
            }
        }
        #fixedCheckoutShow() {
            this.#themeCartFixedCheckoutElement.classList.add('cart-fixed-checkout--visible');
        }
        #fixedCheckoutHide() {
            this.#themeCartFixedCheckoutElement.classList.remove('cart-fixed-checkout--visible');
        }
    }
    window.customElements.define('theme-main-cart-footer', ThemeMainCartFooter);
});
