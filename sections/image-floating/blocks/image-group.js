defineModule('theme-image-floating', () => {
    class ImageGroup extends BaseElement {
        static FLOATING_WRAPPER_CLASS = '.section-image-floating-wrapper';
        static MOBILE_DURATION_KEY = 'data-mobile-duration';
        static SLIDE_ITEM_CLASS = '.image-floating__slide-item';
        static DELAY_RESUME_INTERVAL = 2000;
        static SLIDE_MOVE_THRESHOLD = 40;
        #slideImageItems = [];
        #mobileDuration = 3;
        #screenUnsubscribe = null;
        #mouseenterHandler = (event) => this.#onItemMouseEnter(event);
        #mobileTimer = null;
        #resumeTimer = null;
        #mobileIndex = 0;
        #mobilePaused = false;
        #touchStartX = 0;
        #isTouching = false;
        mounted() {
            this.#slideImageItems = Array.from(this.querySelectorAll(ImageGroup.SLIDE_ITEM_CLASS));
            const section = document.querySelector(ImageGroup.FLOATING_WRAPPER_CLASS);
            const attr = section?.getAttribute(ImageGroup.MOBILE_DURATION_KEY) ?? 0;
            this.#mobileDuration = Number(attr) > 0 ? Number(attr) : 3;
            this.#screenUnsubscribe = detectingScreen(({ isMobileScreen }) => {
                if (isMobileScreen) {
                    this.#initMobile();
                }
                else {
                    this.#initDesktop();
                }
            }, true);
        }
        unmounted() {
            this.#destroyDesktop();
            this.#destroyMobile();
            this.#screenUnsubscribe?.destroy();
            this.#screenUnsubscribe = null;
        }
        switchTo(index) {
            const slideItem = this.#slideImageItems[index];
            if (!slideItem)
                return;
            if (themeUtils.isMobileScreen()) {
                this.#showMobileImage(index);
            }
            else {
                this.#resetItemActive();
                this.#setItemActive(slideItem, true);
            }
        }
        #initDesktop() {
            this.#destroyMobile();
            this.#slideImageItems.forEach((item) => {
                item.addEventListener('mouseenter', this.#mouseenterHandler);
            });
        }
        #destroyDesktop() {
            this.#slideImageItems.forEach((item) => {
                item.removeEventListener('mouseenter', this.#mouseenterHandler);
            });
            this.#resetItemActive();
        }
        #onItemMouseEnter(event) {
            const target = event.currentTarget;
            this.#resetItemActive();
            this.#setItemActive(target, true);
        }
        #resetItemActive() {
            this.#slideImageItems.forEach((item) => this.#setItemActive(item, false));
        }
        #setItemActive(item, active) {
            item.classList.toggle('active', active);
        }
        #initMobile() {
            this.#destroyDesktop();
            this.#mobileIndex = 0;
            this.#startMobileCarousel();
            this.#bindTouchEvents();
        }
        #destroyMobile() {
            this.#stopMobileCarousel();
            this.#slideImageItems.forEach((item) => {
                item.classList.remove('active', 'fade-in', 'fade-out');
            });
            this.#unbindTouchEvents();
        }
        #startMobileCarousel() {
            if (this.#mobileTimer)
                return;
            this.#mobilePaused = false;
            this.#showMobileImage(this.#mobileIndex);
            this.#mobileTimer = setInterval(() => {
                if (!this.#mobilePaused && this.#slideImageItems.length > 0) {
                    this.#mobileIndex = (this.#mobileIndex + 1) % this.#slideImageItems.length;
                    this.#showMobileImage(this.#mobileIndex);
                }
            }, this.#mobileDuration * 1000);
        }
        #bindTouchEvents() {
            this.#slideImageItems.forEach((item) => {
                item.addEventListener('pointerdown', this.#onPointerDown);
                item.addEventListener('pointerup', this.#onPointerUp);
                item.addEventListener('dragstart', this.#preventDragStart);
            });
        }
        #unbindTouchEvents() {
            this.#slideImageItems.forEach((item) => {
                item.removeEventListener('pointerdown', this.#onPointerDown);
                item.removeEventListener('pointerup', this.#onPointerUp);
                item.removeEventListener('dragstart', this.#preventDragStart);
            });
        }
        #preventDragStart(e) {
            e.preventDefault();
        }
        #onPointerDown = (e) => {
            this.#touchStartX = e.clientX;
            this.#isTouching = true;
            this.#mobilePaused = true;
            if (this.#resumeTimer) {
                clearTimeout(this.#resumeTimer);
                this.#resumeTimer = null;
            }
            e.target.setPointerCapture(e.pointerId);
        };
        #onPointerUp = (e) => {
            if (!this.#isTouching)
                return;
            this.#isTouching = false;
            const deltaX = e.clientX - this.#touchStartX;
            if (Math.abs(deltaX) > ImageGroup.SLIDE_MOVE_THRESHOLD) {
                if (deltaX > 0) {
                    this.#showMobilePrev();
                }
                else {
                    this.#showMobileNext();
                }
            }
            if (this.#resumeTimer) {
                clearTimeout(this.#resumeTimer);
            }
            this.#resumeTimer = setTimeout(() => {
                this.#mobilePaused = false;
                this.#resumeTimer = null;
            }, ImageGroup.DELAY_RESUME_INTERVAL);
        };
        #showMobilePrev() {
            if (!this.#slideImageItems.length)
                return;
            this.#mobileIndex = (this.#mobileIndex - 1 + this.#slideImageItems.length) % this.#slideImageItems.length;
            this.#showMobileImage(this.#mobileIndex);
        }
        #showMobileNext() {
            if (!this.#slideImageItems.length)
                return;
            this.#mobileIndex = (this.#mobileIndex + 1) % this.#slideImageItems.length;
            this.#showMobileImage(this.#mobileIndex);
        }
        #showMobileImage(index) {
            this.#slideImageItems.forEach((item, i) => {
                if (i === index) {
                    item.classList.add('active', 'fade-in');
                    item.classList.remove('fade-out');
                }
                else {
                    item.classList.remove('active', 'fade-in');
                    item.classList.add('fade-out');
                }
            });
        }
        #stopMobileCarousel() {
            if (this.#mobileTimer) {
                clearInterval(this.#mobileTimer);
                this.#mobileTimer = null;
            }
        }
    }
    window.customElements.define('theme-image-group', ImageGroup);
});
