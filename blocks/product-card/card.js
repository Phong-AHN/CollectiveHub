defineModule('theme-product-card', () => {
    class ProductCard extends BaseElement {
        #variantPickerElements;
        #quantityInputElements;
        #buyFormElements;
        #quickAddModals;
        #topLayerElement;
        #layerElements;
        #layerImageWrapperElement;
        #isSyncing = false;
        get currentVariant() {
            return this.#variantPickerElements?.[0]?.currentVariant;
        }
        get #variantPickerProductId() {
            return this.#variantPickerElements?.[0]?.dataset.productId;
        }
        get #blockId() {
            return this.dataset.blockId;
        }
        get #productUrl() {
            return this.dataset.productUrl;
        }
        get #productId() {
            return this.dataset.productId;
        }
        get #addToCartPath() {
            return this.dataset.addToCartPath;
        }
        get options() {
            return this.#variantPickerElements?.[0]?.options ?? [];
        }
        set options(options) {
            this.#isSyncing = true;
            if (this.#variantPickerElements) {
                this.#variantPickerElements.forEach((picker) => {
                    picker.options = options;
                });
            }
            this.#isSyncing = false;
        }
        get #hasLayers() {
            return this.#layerElements?.length || this.#topLayerElement;
        }
        constructor() {
            super();
            this.#topLayerElement = this.querySelector('.block-product-card__top-layer');
            this.#layerElements = this.querySelectorAll('.block-product-card__layer');
            this.#layerImageWrapperElement = this.querySelector('.block-product-image__layer-image-wrapper');
            this.#buyFormElements = this.querySelectorAll('theme-product-form');
            this.#quickAddModals = this.querySelectorAll('theme-quick-add-modal');
            this.#quantityInputElements = this.querySelectorAll('.quantity-selector__input');
            this.#quantityInputElements.forEach((input) => {
                input.addEventListener('change', this.#quantityChangeHandler.bind(this));
            });
            this.querySelector('.block-product-card-info')?.addEventListener('click', (event) => {
                event.stopPropagation();
            });
            this.#variantPickerElements = this.querySelectorAll('theme-variant-radio-picker');
            this.#variantPickerElements?.forEach((picker) => {
                picker.addEventListener('change', this.#variantChangeHandler.bind(this));
            });
            this.#topLayerElement?.addEventListener('click', (event) => {
                event.stopPropagation();
            });
            this.#topLayerAction();
        }
        #topLayerAction() {
            if (this.#addToCartPath !== 'layer') {
                return;
            }
            themeEventCenter.addListener(EnumThemeEvent.VariantAdded, (event) => {
                if (this.contains(event.target)) {
                    this.#layerImageWrapperElement?.classList.remove('hover');
                }
            });
            const buyButtonElements = this.querySelectorAll('theme-product-form button[type="submit"]');
            buyButtonElements.forEach((element) => {
                element.addEventListener('click', (event) => {
                    if (this.#layerImageWrapperElement?.classList.contains('hover') ||
                        !this.#hasLayers ||
                        this.#layerImageWrapperElement?.contains(event.target)) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    this.#layerImageWrapperElement?.classList.add('hover');
                });
            });
        }
        #quantityChangeHandler(event) {
            const quantity = Number(event.target.value);
            this.#buyFormElements.forEach((form) => {
                form.updateQuantity(quantity);
            });
        }
        async #variantChangeHandler(event) {
            if (this.#isSyncing)
                return;
            const targetVariantPicker = event.target.closest('theme-variant-radio-picker');
            const currentVariant = targetVariantPicker?.currentVariant;
            this.options = targetVariantPicker?.options || [];
            if (!currentVariant)
                return;
            if (this.#productId !== this.#variantPickerProductId) {
                return;
            }
            const searchParams = new URLSearchParams();
            searchParams.append('block_id', this.#blockId);
            searchParams.append('sku', currentVariant.id);
            searchParams.append('attributes', JSON.stringify({
                block_mode: 'csr',
            }));
            const url = `${this.#productUrl}?${searchParams.toString()}`;
            const response = await themeUtils.fetchWithCache(url);
            const responseText = await response.text();
            const domParser = new DOMParser();
            const newHTML = domParser.parseFromString(responseText, 'text/html');
            themeUtils.reRenderDomContent(this, newHTML.body);
            this.#buyFormElements.forEach((buyFormElement) => {
                buyFormElement.updateVariant(currentVariant);
            });
            this.#quickAddModals.forEach((quickAddModal) => {
                quickAddModal.updateVariant(currentVariant);
            });
        }
    }
    customElements.define('theme-product-card', ProductCard);
});
