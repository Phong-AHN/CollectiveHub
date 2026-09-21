defineModule('theme-product-detail', () => {
    class ProductDetail extends BaseElement {
        #isSyncing = false;
        quantityInputElements;
        variantPickerElements;
        buyFormElements;
        mediaGalleryElement;
        volumePricingElement;
        defaultVariant;
        get options() {
            return this.variantPickerElements?.[0]?.options ?? [];
        }
        set options(options) {
            this.#isSyncing = true;
            if (this.variantPickerElements) {
                this.variantPickerElements.forEach((picker) => {
                    picker.options = options;
                });
            }
            this.#isSyncing = false;
        }
        get currentVariant() {
            return this.variantPickerElements?.[0]?.currentVariant;
        }
        get quantity() {
            return this.quantityInputElements?.[0]?.value || 1;
        }
        set quantity(num) {
            this.#isSyncing = true;
            if (this.quantityInputElements) {
                this.quantityInputElements.forEach((input) => {
                    input.value = num;
                });
            }
            if (this.buyFormElements) {
                this.buyFormElements.forEach((form) => {
                    form.updateQuantity(num);
                });
            }
            this.#isSyncing = false;
        }
        get loading() {
            return this.buyFormElements?.[0]?.loading || false;
        }
        set loading(force) {
            if (this.buyFormElements) {
                this.buyFormElements.forEach((form) => {
                    form.loading = force;
                });
            }
        }
        get #themeEventInitDict() {
            const { currentVariant, defaultVariant, quantity } = this;
            const variant = currentVariant || defaultVariant;
            return {
                target: this,
                detail: {
                    productId: this.dataset.id,
                    productHandle: this.dataset.handle,
                    variantId: variant?.id,
                    quantity,
                    price: (variant?.price || 0) * quantity,
                    currency: window.Shopline.currency,
                },
            };
        }
        constructor() {
            super();
            this.variantPickerElements = Array.from(this.querySelectorAll('.product-detail__variant-picker'));
            this.quantityInputElements = Array.from(this.querySelectorAll('.quantity-selector__input'));
            this.buyFormElements = Array.from(this.querySelectorAll('theme-product-form'));
            this.mediaGalleryElement = this.querySelector('.product-detail__media-gallery');
            this.volumePricingElement = this.querySelector('.product-detail__volume-pricing');
            this.defaultVariant = this.#getDefaultVariantData();
            this.quantityInputElements?.forEach((input) => {
                input.addEventListener('change', this.#quantityChangeHandler.bind(this));
            });
            this.variantPickerElements?.forEach((picker) => {
                picker.addEventListener('change', this.#variantChangeHandler.bind(this));
            });
        }
        mounted() {
            if (this.dataset.disableProductViewed === 'true') {
                return;
            }
            themeEventCenter.dispatch(new ThemeEvent(EnumThemeEvent.ProductViewed, this.#themeEventInitDict));
        }
        #getDefaultVariantData() {
            const jsonStr = this.querySelector('script[name="default-variant-data"][type="application/json"]')?.textContent?.trim() || '{}';
            return JSON.parse(jsonStr);
        }
        #quantityChangeHandler(event) {
            if (this.#isSyncing) {
                return;
            }
            this.quantity = Number(event.target.value);
            themeEventCenter.dispatch(new ThemeEvent(EnumThemeEvent.VariantChanged, this.#themeEventInitDict));
        }
        #variantChangeHandler(event) {
            if (this.#isSyncing)
                return;
            const targetVariantPicker = event.target.closest('theme-variant-radio-picker, theme-variant-select-picker');
            const currentVariant = targetVariantPicker?.currentVariant;
            const currentFeatureMedia = currentVariant?.featured_media_id;
            this.options = targetVariantPicker?.options || [];
            if (currentFeatureMedia) {
                this.mediaGalleryElement?.activeMedia(currentFeatureMedia, true);
            }
            this.buyFormElements?.forEach((form) => {
                form.updateVariant(currentVariant);
            });
            if (!currentVariant)
                return;
            this.#updateProductInfo();
            this.#updateURL();
            themeEventCenter.dispatch(new ThemeEvent(EnumThemeEvent.VariantChanged, this.#themeEventInitDict));
        }
        async #updateProductInfo() {
            const { currentVariant, quantity } = this;
            if (!currentVariant) {
                return;
            }
            const newProductInfoElement = await this.#getProductInfoDocument(currentVariant.id);
            themeUtils.reRenderDomContent(this, newProductInfoElement);
            this.#updateVolumePricingTip();
            this.quantity = quantity;
        }
        async #getProductInfoDocument(variantId) {
            const { sectionId, sectionTemplate, url } = this.dataset;
            const fetchUrl = new URL(url, window.location.href);
            fetchUrl.searchParams.set('sku', variantId);
            fetchUrl.searchParams.set('section_id', sectionId);
            fetchUrl.searchParams.set('section_template', sectionTemplate);
            const response = await themeUtils.fetchWithCache(fetchUrl);
            const responseText = await response.text();
            const domParser = new DOMParser();
            const responseHtml = domParser.parseFromString(responseText, 'text/html');
            return responseHtml.querySelector('theme-product-detail');
        }
        #updateURL() {
            const { currentVariant } = this;
            const canUpdatePageUrl = this.getDatasetValue('updateUrl', 'boolean');
            if (canUpdatePageUrl) {
                window.history.replaceState({}, document.title, themeUtils.changeURLArg(window.location.href, {
                    sku: currentVariant?.id,
                }));
            }
        }
        #updateVolumePricingTip() {
            const { volumePricingElement, quantity } = this;
            const matchVolumePricing = volumePricingElement?.getMatchVolumePricing(quantity);
            if (!matchVolumePricing) {
                return;
            }
            this.querySelectorAll('.product-detail__quantity-selector .volume-pricing__tip').forEach((tipElement) => {
                tipElement.textContent = matchVolumePricing.price;
            });
        }
    }
    customElements.define('theme-product-detail', ProductDetail);
});
