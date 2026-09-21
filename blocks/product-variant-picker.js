defineModule('theme-product-variant-picker', () => {
    class VariantPicker extends BaseElement {
        variants;
        constructor() {
            super();
            this.variants = this.#getVariantData();
        }
        get options() {
            return [];
        }
        set options(options) {
        }
        get currentVariant() {
            const { options } = this;
            return this.getOptionRelatedVariant(options);
        }
        getOptionRelatedVariant(options) {
            return this.variants.find((variant) => variant.options.every((option, index) => option === options[index]));
        }
        #getVariantData() {
            const jsonStr = this.querySelector('script[name="variant-data"][type="application/json"]')?.textContent?.trim() || '{}';
            return JSON.parse(jsonStr);
        }
    }
    class VariantRadioPicker extends VariantPicker {
        constructor() {
            super();
            this.#updateOptionStatus();
            this.addEventListener('change', this.#updateOptionStatus.bind(this));
        }
        get optionGroups() {
            return Array.from(this.querySelectorAll('fieldset') ?? []);
        }
        get options() {
            const options = [];
            this.optionGroups.forEach((group) => {
                const groupIndex = Number(group.dataset.index || 0);
                const selectedOption = group.querySelector('input[type="radio"]:checked')?.value;
                options[groupIndex] = selectedOption;
            });
            return options;
        }
        set options(options) {
            this.optionGroups.forEach((group) => {
                const groupIndex = Number(group.dataset.index || 0);
                const optionValue = options[groupIndex];
                Array.from(group.elements).forEach((element) => {
                    if (element instanceof HTMLInputElement && element.type === 'radio') {
                        element.checked = element.value === optionValue;
                    }
                });
            });
            this.#updateOptionStatus();
        }
        #updateOptionStatus() {
            const { optionGroups, options } = this;
            const hasSelectedOptions = options.some((option) => option !== undefined);
            if (options.length !== optionGroups.length)
                return;
            optionGroups.forEach((group) => {
                const groupIndex = Number(group.dataset.index || 0);
                const optionElements = Array.from(group.elements);
                const targetOptions = [...options];
                optionElements.forEach((optionElement) => {
                    targetOptions[groupIndex] = optionElement.value;
                    const targetVariant = this.getOptionRelatedVariant(targetOptions);
                    const labelElement = optionElement.parentElement;
                    if (hasSelectedOptions) {
                        labelElement?.classList.toggle('disabled', !(targetVariant && targetVariant.available));
                    }
                    else {
                        labelElement?.classList.remove('disabled');
                    }
                });
            });
        }
    }
    class VariantSelectPicker extends VariantPicker {
        constructor() {
            super();
            this.#updateOptionStatus();
            this.addEventListener('change', this.#updateOptionStatus.bind(this));
        }
        get optionGroups() {
            return Array.from(this.querySelectorAll('select'));
        }
        get options() {
            return Array.from(this.querySelectorAll('select')).map((select) => select.value);
        }
        set options(options) {
            Array.from(this.querySelectorAll('select')).forEach((select, index) => {
                select.value = options[index] || '';
            });
            this.#updateOptionStatus();
        }
        get unavailableText() {
            return this.getAttribute('data-unavailable-text') || '';
        }
        get unavailableStyle() {
            return this.getAttribute('data-unavailable-style') || '';
        }
        #updateOptionStatus() {
            const { optionGroups, options, unavailableText, unavailableStyle } = this;
            const hasSelectedOptions = options.some((option) => option !== undefined);
            if (options.length !== optionGroups.length)
                return;
            optionGroups.forEach((group) => {
                const groupIndex = Number(group.dataset.index || 0);
                const optionElements = Array.from(group.options);
                const targetOptions = [...options];
                const themeSelect = group.closest('theme-select');
                optionElements.forEach((optionElement) => {
                    const { value } = optionElement;
                    targetOptions[groupIndex] = value;
                    const targetVariant = this.getOptionRelatedVariant(targetOptions);
                    const isUnavailable = hasSelectedOptions ? !(targetVariant && targetVariant.available) : false;
                    const templateOptionElement = optionElement.querySelector('template')?.content
                        ?.firstElementChild;
                    const mockOptionElement = themeSelect.querySelector(`.theme-select__option[value="${CSS.escape(optionElement.value)}"]`);
                    [optionElement, templateOptionElement, mockOptionElement].forEach((element) => {
                        if (element) {
                            if (unavailableStyle === 'text') {
                                const label = isUnavailable ? `${value} ${unavailableText}` : value;
                                const labelElement = element.querySelector('.variant-picker__label');
                                if (labelElement) {
                                    labelElement.textContent = label;
                                }
                            }
                            element.classList.toggle('disabled', isUnavailable);
                            const optionContentElement = element.querySelector('.variant-picker__select-option');
                            if (optionContentElement) {
                                optionContentElement.classList.toggle('disabled', isUnavailable);
                            }
                        }
                    });
                });
                const selectedOption = group.options[group.selectedIndex];
                group.classList.toggle('disabled', selectedOption.classList.contains('disabled'));
            });
        }
    }
    customElements.define('theme-variant-radio-picker', VariantRadioPicker);
    customElements.define('theme-variant-select-picker', VariantSelectPicker);
});
