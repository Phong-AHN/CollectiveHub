defineModule('theme-input-number', () => {
    class InputNumber extends BaseElement {
        #inputElement;
        #plusButtonElement;
        #minusButtonElement;
        #committedValue;
        constructor() {
            super();
            const input = this.querySelector('input[type="number"]');
            if (!input) {
                throw new Error('[theme-input-number]: child structure exception, missing input number tag.');
            }
            this.#inputElement = input;
            this.#plusButtonElement = this.querySelector('button[name="plus"]');
            this.#minusButtonElement = this.querySelector('button[name="minus"]');
            this.#committedValue = input.value;
            this.#bindEvents();
            this.#updateView();
        }
        get value() {
            return this.#readInputValue();
        }
        set value(val) {
            const newValue = this.#writeNormalizedValue(val);
            this.#updateView();
            this.#emitChangeIfValueChanged(newValue);
        }
        get min() {
            return this.#inputElement.min === '' ? -Number.MAX_VALUE : Number(this.#inputElement.min);
        }
        set min(val) {
            this.#inputElement.setAttribute('min', String(val));
            this.#commitValue();
        }
        get max() {
            return this.#inputElement.max === '' ? Number.MAX_VALUE : Number(this.#inputElement.max);
        }
        set max(val) {
            this.#inputElement.setAttribute('max', String(val));
            this.#commitValue();
        }
        get step() {
            return Number(this.#inputElement.step || 1);
        }
        set step(val) {
            this.#inputElement.setAttribute('step', String(val));
        }
        #bindEvents() {
            this.#plusButtonElement?.addEventListener('click', this.#stepButtonClickHandler.bind(this, true));
            this.#minusButtonElement?.addEventListener('click', this.#stepButtonClickHandler.bind(this, false));
            this.#inputElement.addEventListener('input', this.#inputEventHandler.bind(this));
            this.#inputElement.addEventListener('change', this.#changeEventHandler.bind(this));
            this.#inputElement.addEventListener('blur', this.#blurEventHandler.bind(this));
        }
        #changeEventHandler(event) {
            if (event.target === this)
                return;
            event.stopPropagation();
            this.#commitValue();
        }
        #inputEventHandler() {
            this.#updateView();
        }
        #blurEventHandler() {
            this.#commitValue();
        }
        #commitValue() {
            const currentValue = this.#normalizeInputValue();
            this.#updateView();
            this.#emitChangeIfValueChanged(currentValue);
        }
        #normalizeInputValue() {
            return this.#writeNormalizedValue(this.value);
        }
        #writeNormalizedValue(val) {
            const newValue = String(this.#getRightValue(val));
            this.#inputElement.value = newValue;
            return newValue;
        }
        #updateView() {
            const { value, min, max } = this;
            if (this.#minusButtonElement) {
                this.#minusButtonElement.disabled = value <= min;
            }
            if (this.#plusButtonElement) {
                this.#plusButtonElement.disabled = value >= max;
            }
        }
        #getRightValue(val) {
            const { min, max } = this;
            if (val < min) {
                return min;
            }
            if (val > max) {
                return max;
            }
            return val;
        }
        #readInputValue() {
            const value = Number(this.#inputElement.value);
            return Number.isNaN(value) ? 0 : value;
        }
        #emitChangeIfValueChanged(value) {
            if (value === this.#committedValue) {
                return;
            }
            this.#committedValue = value;
            this.dispatchEvent(new Event('change', { bubbles: true }));
        }
        #stepButtonClickHandler(isPlus, event) {
            event.preventDefault();
            const { value, step } = this;
            this.value = isPlus ? value + step : value - step;
        }
    }
    customElements.define('theme-input-number', InputNumber);
});
