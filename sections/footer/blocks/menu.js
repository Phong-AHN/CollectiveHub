defineModule('theme-footer-announcement-bar-sticky', () => {
    class ThemeFooterMenu extends BaseElement {
        #menuTitle = null;
        #menuContent = null;
        constructor() {
            super();
            this.#menuTitle = this.querySelector('.footer__menu-title');
            this.#menuContent = this.querySelector('.footer__menu-content');
            if (!this.#menuTitle) {
                throw new Error('ThemeFooterMenu: menuTitle is not found');
            }
            if (!this.#menuContent) {
                throw new Error('ThemeFooterMenu: menuContent is not found');
            }
            this.#menuTitle.addEventListener('click', () => this.#bindTitleClickHandler(), false);
        }
        #bindTitleClickHandler() {
            if (themeUtils.isMobileScreen()) {
                this.#menuToggle();
            }
        }
        #menuToggle() {
            const isClosed = this.getAttribute('open') == null;
            const doAnimate = () => {
                const animate = [
                    { height: 0, opacity: 0 },
                    {
                        height: `${this.#menuContent?.getBoundingClientRect().height}px`,
                        opacity: 1,
                    },
                ];
                if (!isClosed) {
                    animate.reverse();
                }
                return this.#menuContent?.animate(animate, {
                    iterations: 1,
                    duration: 200,
                    easing: 'ease',
                });
            };
            if (isClosed) {
                this.toggleAttribute('open');
                doAnimate();
            }
            else {
                const animate = doAnimate();
                if (animate) {
                    animate.onfinish = () => {
                        this.toggleAttribute('open');
                    };
                }
            }
        }
    }
    window.customElements.define('theme-footer-menu', ThemeFooterMenu);
});
