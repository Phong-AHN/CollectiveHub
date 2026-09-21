defineModule('theme-quick-add-modal', () => {
    class QuickAddModal extends Modal {
        #productUrl;
        #contentDesktopElement;
        #contentMobileElement;
        #summaryElement;
        get variantId() {
            return this.dataset.variantId || '';
        }
        set variantId(id) {
            this.dataset.variantId = id;
        }
        get disabled() {
            return !!this.#summaryElement?.getAttribute('disabled');
        }
        set disabled(force) {
            if (!this.#summaryElement) {
                return;
            }
            if (force) {
                this.#summaryElement.setAttribute('disabled', 'true');
            }
            else {
                this.#summaryElement.removeAttribute('disabled');
            }
        }
        set error(message) {
            if (!message) {
                return;
            }
            window.Shopline.utils.toast.open({
                duration: 2000,
                content: message,
            });
        }
        constructor() {
            super();
            this.#productUrl = this.getAttribute('product-url');
            this.#contentDesktopElement = this.querySelector('.quick-add-modal__modal-content-desktop');
            this.#contentMobileElement = this.querySelector('.quick-add-modal__modal-content-mobile');
            this.#summaryElement = this.querySelector('summary');
            themeEventCenter.addListener(EnumThemeEvent.VariantAdded, (event) => {
                if (event.target &&
                    (this.#contentDesktopElement.contains(event.target) || this.#contentMobileElement.contains(event.target))) {
                    this.close();
                }
            });
        }
        async open() {
            try {
                this.#summaryElement.classList.add('loading');
                const response = await themeUtils.fetchWithCache(this.#productUrl);
                const htmlText = await response.text();
                const domParser = new DOMParser();
                const responseHTML = domParser.parseFromString(htmlText, 'text/html');
                this.#insertHTML(responseHTML);
                if (window.Shopline && window.Shopline.PaymentButton) {
                    window.Shopline.PaymentButton.init();
                }
                await super.open();
            }
            catch (error) {
                console.error(error);
            }
            finally {
                this.#summaryElement.classList.remove('loading');
            }
        }
        async close() {
            window.ThemeVideoMedia?.pauseAll();
            await super.close();
        }
        async updateVariant(variant) {
            this.error = '';
            this.variantId = variant?.id ?? '';
            if (!variant) {
                this.#updateSubmitButtonStatus(true, await window.Shopline.t('products.general.unavailable'));
                return;
            }
            if (!variant.available) {
                this.#updateSubmitButtonStatus(true, await window.Shopline.t('products.general.sold_out'));
                return;
            }
            this.#updateSubmitButtonStatus(false);
        }
        async #updateSubmitButtonStatus(disabled, text) {
            this.disabled = disabled;
            const submitButtonTextElement = this.#summaryElement?.querySelector('span');
            const statusText = text ?? (await window.Shopline.t('products.product_list.add_to_cart'));
            if (submitButtonTextElement && statusText) {
                submitButtonTextElement.textContent = statusText;
            }
        }
        #insertHTML(responseHTML) {
            responseHTML?.querySelectorAll(`style[${window.Shopline.styleSelector.local}]`).forEach((style) => {
                document.body.append(style);
            });
            const productHTML = responseHTML.querySelector('theme-product-detail');
            this.#disabledFeature(productHTML);
            this.#renameFormId(productHTML);
            const productDesktopHTML = this.#processDesktopHTML(productHTML);
            this.#contentDesktopElement.innerHTML = productDesktopHTML.outerHTML;
            const productMobileHTML = this.#processMobileHTML(productHTML);
            this.#contentMobileElement.innerHTML = productMobileHTML.outerHTML;
            themeUtils.execDomScript(this.#contentDesktopElement);
        }
        #disabledFeature(dom) {
            dom.setAttribute('data-update-url', 'false');
            const mediaGallery = dom.querySelector('theme-product-media-gallery');
            mediaGallery?.setAttribute('data-disabled-preview', 'true');
        }
        #processDesktopHTML(productHTML) {
            const productDesktopHTML = productHTML.cloneNode(true);
            if (themeUtils.isMobileScreen()) {
                productDesktopHTML.dataset.disableProductViewed = 'true';
            }
            return productDesktopHTML;
        }
        #processMobileHTML(productHTML) {
            const productMobileHTML = productHTML.cloneNode(true);
            if (!themeUtils.isMobileScreen()) {
                productMobileHTML.dataset.disableProductViewed = 'true';
            }
            const contentMobileElements = [
                'theme-product-media-gallery',
                '.product-detail__title',
                '.product-detail__price',
                'theme-variant-radio-picker',
                'theme-variant-select-picker',
                '.block-product-buy-button-group',
                'theme-input-number',
                'theme-product-form',
            ];
            const contentMobileHTML = contentMobileElements.map((selector) => {
                const elements = Array.from(productMobileHTML.querySelectorAll(selector));
                return elements.map((element) => {
                    if (selector === 'theme-product-media-gallery') {
                        element?.setAttribute('data-mobile-layout', 'fullscreen');
                        element?.setAttribute('data-video-autoplay', 'false');
                    }
                    const outerHTML = element?.outerHTML;
                    element?.remove();
                    return outerHTML;
                });
            });
            productMobileHTML.innerHTML = contentMobileHTML.join('');
            productMobileHTML.querySelectorAll('.variant-picker__option input').forEach((input) => {
                const inputElement = input;
                inputElement.name = inputElement.name + '-mobile';
            });
            return productMobileHTML;
        }
        #renameFormId(dom) {
            const formId = 'product-form-template--product__main-product-info';
            const newFormId = `product-form-template--${themeUtils.generateUUID()}`;
            const form = dom.querySelector(`#${formId}`);
            const formInputs = dom.querySelectorAll(`[form="${formId}"]`);
            form?.setAttribute('id', newFormId);
            formInputs.forEach((input) => input.setAttribute('form', newFormId));
        }
    }
    customElements.define('theme-quick-add-modal', QuickAddModal);
});
