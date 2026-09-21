defineModule('theme-header-nav-drawer', () => {
    class HeaderNavDrawer extends BaseElement {
        static SWITCH_NAME = '[data-role="header-nav-drawer-switch"]';
        static DISMISS_NAME = '[data-role="header-nav-drawer-dismiss"]';
        static DEFAULT_ANIMTE_DURATION = 200;
        #switchClickHandler = (event) => {
            const targets = event.composedPath();
            if (!this.#isMatchingTarget(targets, HeaderNavDrawer.SWITCH_NAME)) {
                return;
            }
            this.toggle();
        };
        #dismissClickHandler = (event) => {
            const targets = event.composedPath();
            if (!this.#isMatchingTarget(targets, HeaderNavDrawer.DISMISS_NAME)) {
                return;
            }
            this.close();
        };
        #subMenuClickHandler = (event) => {
            const path = event.composedPath();
            const summary = path.find((el) => el instanceof HTMLElement && el.tagName === 'SUMMARY');
            if (!summary || !this.contains(summary))
                return;
            const details = summary.closest('details');
            if (!details)
                return;
            event.preventDefault();
            const iconClicked = path.some((el) => el instanceof HTMLElement && el.matches('[data-role="nav-drawer-submenu-icon"]'));
            if (!iconClicked) {
                const linkEl = summary.querySelector('[data-role="nav-drawer-submenu-text"]');
                if (linkEl) {
                    window.location.assign(linkEl.href);
                    return;
                }
            }
            details.open = !details.open;
        };
        mounted() {
            document.addEventListener('click', this.#switchClickHandler);
            this.addEventListener('click', this.#dismissClickHandler);
            this.addEventListener('click', this.#subMenuClickHandler);
        }
        unmounted() {
            document.removeEventListener('click', this.#switchClickHandler);
            this.removeEventListener('click', this.#dismissClickHandler);
            this.removeEventListener('click', this.#subMenuClickHandler);
        }
        #isMatchingTarget(targets, selector) {
            return targets.some((target) => {
                if (!(target instanceof HTMLElement)) {
                    return false;
                }
                return target.matches(selector);
            });
        }
        #lockScreen(force) {
            document.body.classList.toggle('header-nav-drawer--lockscreen', !!force);
        }
        #show() {
            return new Promise((resolve) => {
                this.style.display = 'block';
                setTimeout(() => {
                    const isOpen = this.classList.toggle('open', true);
                    this.#lockScreen(isOpen);
                    resolve();
                }, HeaderNavDrawer.DEFAULT_ANIMTE_DURATION);
            });
        }
        #hide() {
            return new Promise((resolve) => {
                const isOpen = this.classList.toggle('open', false);
                this.#lockScreen(isOpen);
                setTimeout(() => {
                    this.style.display = 'none';
                    resolve();
                }, HeaderNavDrawer.DEFAULT_ANIMTE_DURATION);
            });
        }
        toggle(force) {
            const shouldShow = force || this.style.display !== 'block';
            return shouldShow ? this.#show() : this.#hide();
        }
        open() {
            return this.toggle(true);
        }
        close() {
            return this.toggle(false);
        }
    }
    window.customElements.define('theme-header-nav-drawer', HeaderNavDrawer);
});
