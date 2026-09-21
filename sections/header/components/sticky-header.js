defineModule('theme-sticky-header', () => {
    class ThemeStickyHeader extends BaseElement {
        static STICKY_CLASS = 'theme-sticky-header--sticky';
        static STICKY_COLLAPSE_CLASS = 'theme-sticky-header--sticky-collapse';
        static BEFORE_STICKY_ELEMENTS = [
            {
                selector: 'theme-announcement-bar-sticky[data-sticky-mode="desktop"]',
                enable: () => !themeUtils.isMobileScreen(),
            },
            {
                selector: 'theme-announcement-bar-sticky[data-sticky-mode="mobile"]',
                enable: () => themeUtils.isMobileScreen(),
            },
            'theme-announcement-bar-sticky[data-sticky-mode="always"]',
            '[before-header-sticky]',
        ];
        static AFTER_STICKY_ELEMENTS = ['[after-header-sticky]'];
        #section = this.closest('.section');
        #lastScrollTop = 0;
        #visible = false;
        #observer = new IntersectionObserver(([entry]) => {
            this.#visible = entry.isIntersecting;
        });
        #beforeOffsetTop = 0;
        #offsetTop = 0;
        get #isSticky() {
            return this.#section.classList.contains(ThemeStickyHeader.STICKY_CLASS);
        }
        get #isCollapse() {
            return !this.#section.classList.contains(ThemeStickyHeader.STICKY_COLLAPSE_CLASS);
        }
        #calcBeforeOffsetTop() {
            return ThemeStickyHeader.BEFORE_STICKY_ELEMENTS.filter((config) => typeof config === 'string' ? true : config.enable())
                .map((config) => (typeof config === 'string' ? config : config.selector))
                .reduce((total, selector) => {
                const elements = document.querySelectorAll(selector);
                elements.forEach((element) => {
                    const position = element.compareDocumentPosition(this.#section);
                    if (position === Node.DOCUMENT_POSITION_PRECEDING) {
                        return;
                    }
                    const rect = element.getBoundingClientRect();
                    total += rect.height;
                });
                return total;
            }, 0);
        }
        #calcOffsetTop(beforeOffsetTop = this.#calcBeforeOffsetTop()) {
            return this.clientHeight + beforeOffsetTop;
        }
        #toggleSticky(sticky = !this.#isSticky) {
            if (sticky) {
                this.#beforeOffsetTop = this.#calcBeforeOffsetTop();
                this.style.setProperty('--theme-sticky-header-top', `${this.#beforeOffsetTop}px`);
                this.#section.classList.add(ThemeStickyHeader.STICKY_CLASS);
                this.#offsetTop = this.#calcOffsetTop(this.#beforeOffsetTop);
                return;
            }
            this.#section.classList.remove(ThemeStickyHeader.STICKY_CLASS);
        }
        #toggleCollapse(isCollapse = !this.#isCollapse) {
            if (isCollapse) {
                this.#section.classList.add(ThemeStickyHeader.STICKY_COLLAPSE_CLASS);
                return;
            }
            this.#section.classList.remove(ThemeStickyHeader.STICKY_COLLAPSE_CLASS);
        }
        #stickyOnScrollUpHandler = () => {
            const { scrollTop } = document.documentElement;
            const lastScrollTop = this.#lastScrollTop || 0;
            this.#lastScrollTop = scrollTop;
            if (scrollTop === 0) {
                requestAnimationFrame(() => {
                    this.#toggleCollapse(false);
                    this.#toggleSticky(false);
                    this.#assignCSSVars();
                });
                return;
            }
            if (scrollTop < lastScrollTop) {
                requestAnimationFrame(() => {
                    this.#toggleCollapse(false);
                    if (!this.#visible) {
                        this.#toggleSticky(true);
                    }
                    this.#assignCSSVars();
                });
                return;
            }
            if (scrollTop > lastScrollTop) {
                this.#beforeOffsetTop = this.#calcBeforeOffsetTop();
                this.#assignCSSVars(this.#beforeOffsetTop);
                if (this.#isSticky) {
                    requestAnimationFrame(() => {
                        this.#toggleCollapse(true);
                    });
                }
            }
        };
        #alwaysStickyHandler = () => {
            const { scrollTop } = document.documentElement;
            if (scrollTop === 0) {
                requestAnimationFrame(() => {
                    this.#toggleSticky(false);
                    this.#assignCSSVars(this.#beforeOffsetTop);
                });
                return;
            }
            if (!this.#visible) {
                requestAnimationFrame(() => {
                    this.#toggleSticky(true);
                    this.#assignCSSVars();
                });
            }
        };
        #alwayStaticHandler = () => {
            this.#beforeOffsetTop = this.#calcBeforeOffsetTop();
            this.#assignCSSVars(this.#beforeOffsetTop);
        };
        #resetOffsetHandler = () => {
            if (this.#visible) {
                requestAnimationFrame(() => {
                    this.#beforeOffsetTop = this.#calcBeforeOffsetTop();
                    this.style.setProperty('--theme-sticky-header-top', `${this.#beforeOffsetTop}px`);
                    this.#offsetTop = this.#calcOffsetTop(this.#beforeOffsetTop);
                    this.#assignCSSVars(this.#offsetTop);
                });
                return;
            }
            requestAnimationFrame(() => {
                this.#beforeOffsetTop = this.#calcBeforeOffsetTop();
                this.#assignCSSVars(this.#beforeOffsetTop);
            });
        };
        #assignCSSVars(offsetTop = this.#offsetTop) {
            ThemeStickyHeader.AFTER_STICKY_ELEMENTS.reduce((total, selector) => {
                const query = document.querySelectorAll(selector);
                const elements = Array.from(query);
                return elements.reduce((nestTotal, element) => {
                    const position = element.compareDocumentPosition(this.#section);
                    if (position === Node.DOCUMENT_POSITION_FOLLOWING) {
                        return nestTotal;
                    }
                    if (element instanceof HTMLElement) {
                        element.style.setProperty('--theme-sticky-offset', `${nestTotal - 1}px`);
                    }
                    const rect = element.getBoundingClientRect();
                    return nestTotal + rect.height;
                }, total);
            }, offsetTop);
        }
        mounted() {
            const mode = this.dataset.stickyMode;
            switch (mode) {
                case 'sticky_on_scroll_up':
                    window.addEventListener('scroll', this.#stickyOnScrollUpHandler, false);
                    break;
                case 'always_sticky':
                    window.addEventListener('scroll', this.#alwaysStickyHandler, false);
                    break;
                case 'none':
                default:
                    window.addEventListener('scroll', this.#alwayStaticHandler, false);
                    return;
            }
            window.addEventListener('resize', this.#resetOffsetHandler, false);
            this.#observer.observe(this);
        }
        unmounted() {
            this.#observer.unobserve(this);
            window.removeEventListener('scroll', this.#stickyOnScrollUpHandler, false);
            window.removeEventListener('scroll', this.#alwaysStickyHandler, false);
            window.removeEventListener('scroll', this.#alwayStaticHandler, false);
            window.removeEventListener('resize', this.#resetOffsetHandler, false);
        }
    }
    customElements.define('theme-sticky-header', ThemeStickyHeader);
});
