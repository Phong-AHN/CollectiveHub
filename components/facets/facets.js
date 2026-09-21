defineModule('theme-facets', () => {
    class PriceRange extends HTMLElement {
        initialized = false;
        #isLowerDown = false;
        #isUpperDown = false;
        #rangeSlider = this.querySelector('.price-range-slider');
        #rangeBar = this.#rangeSlider.querySelector('.price-range-bar');
        #lowerHandle = this.#rangeSlider.querySelector('.price-range-dot--min');
        #upperHandle = this.#rangeSlider.querySelector('.price-range-dot--max');
        #lowerStartX = 0;
        #upperStartX = 0;
        #lowerOffsetX = 0;
        #upperOffsetX = 0;
        constructor() {
            super();
            this.bindRangeSlider();
            this.initialize();
            this.bindToggleInitialize();
            this.querySelectorAll('input').forEach((element) => element.addEventListener('change', (event) => this.onRangeChange(event)));
        }
        bindToggleInitialize() {
            const detailsEle = this.closest('details');
            detailsEle.addEventListener('toggle', () => {
                if (detailsEle.open) {
                    this.initialize();
                }
            });
        }
        initialize() {
            if (this.initialized) {
                this.updateUi();
                return;
            }
            this.handleUseCommaDecimals();
            this.setMinAndMaxValues();
            this.updateUi();
            this.initialized = true;
        }
        isFullRange() {
            const inputs = this.querySelectorAll('input');
            const minInput = inputs[0];
            const maxInput = inputs[1];
            const minValue = minInput.value;
            const maxValue = maxInput.value;
            const transformMaxValue = this.maxValue;
            const flag = Number(minValue) === 0 && Number(maxValue) === Number(transformMaxValue);
            return flag;
        }
        get maxValue() {
            return this.dataset.maxValue;
        }
        handleUseCommaDecimals() {
            const inputs = this.querySelectorAll('input');
            const minInput = inputs[0];
            const maxInput = inputs[1];
            const transformMaxValue = this.maxValue;
            minInput.setAttribute('max', transformMaxValue);
            maxInput.setAttribute('max', transformMaxValue);
            const maxInputInitialValue = maxInput.value;
            const minInputInitialValue = minInput.value;
            if (maxInputInitialValue) {
                const transformMaxInputInitialValue = maxInputInitialValue;
                maxInput.value = transformMaxInputInitialValue;
                maxInput.setAttribute('value', transformMaxInputInitialValue);
            }
            if (minInputInitialValue) {
                const transformMinInputInitialValue = minInputInitialValue;
                minInput.value = transformMinInputInitialValue;
                minInput.setAttribute('value', transformMinInputInitialValue);
            }
        }
        updateUi() {
            const inputs = this.querySelectorAll('input');
            const minInput = inputs[0];
            const maxInput = inputs[1];
            const minValue = Number(minInput.value);
            const maxValue = Number(maxInput.value);
            this.slideUpperHandleTo(maxValue);
            this.slideLowerHandleTo(minValue);
            this.updateRangeBar();
        }
        onRangeChange(event) {
            this.adjustToValidValues(event.currentTarget);
            this.setMinAndMaxValues();
        }
        setMinAndMaxValues() {
            const inputs = this.querySelectorAll('input');
            const minInput = inputs[0];
            const maxInput = inputs[1];
            if (maxInput.value)
                minInput.setAttribute('max', maxInput.value);
            if (minInput.value)
                maxInput.setAttribute('min', minInput.value);
            if (minInput.value === '')
                maxInput.setAttribute('min', '0');
            if (maxInput.value === '')
                minInput.setAttribute('max', maxInput.getAttribute('max'));
        }
        adjustToValidValues(input) {
            const value = Number(input.value);
            const min = Number(input.getAttribute('min'));
            const max = Number(input.getAttribute('max'));
            if (value < min)
                input.value = min.toString();
            if (value > max)
                input.value = max.toString();
            if (input.dataset.type === 'min') {
                this.slideLowerHandleTo(Number(input.value));
            }
            if (input.dataset.type === 'max') {
                this.slideUpperHandleTo(Number(input.value));
            }
            this.updateRangeBar();
        }
        bindRangeSlider() {
            this.#lowerHandle.addEventListener('mousedown', (e) => this.onGrabbingLowerHandle(e));
            this.#lowerHandle.addEventListener('touchstart', (e) => this.onGrabbingLowerHandle(e));
            this.#upperHandle.addEventListener('mousedown', (e) => this.onGrabbingUpperHandle(e));
            this.#upperHandle.addEventListener('touchstart', (e) => this.onGrabbingUpperHandle(e));
            document.addEventListener('mouseup', () => this.onReleasingHandle());
            document.addEventListener('touchend', () => this.onReleasingHandle());
            document.addEventListener('mousemove', this.onMovingHandle.bind(this));
            document.addEventListener('touchmove', this.onMovingHandle.bind(this));
        }
        eventX(e) {
            if (e instanceof MouseEvent) {
                return e.clientX;
            }
            return e.changedTouches[0].pageX;
        }
        onGrabbingLowerHandle(e) {
            this.#isLowerDown = true;
            this.#lowerStartX = this.eventX(e);
            this.#lowerOffsetX = this.#lowerHandle.getBoundingClientRect().left;
        }
        onGrabbingUpperHandle(e) {
            this.#isUpperDown = true;
            this.#upperStartX = this.eventX(e);
            this.#upperOffsetX = this.#upperHandle.getBoundingClientRect().left;
        }
        onReleasingHandle() {
            const inputs = this.querySelectorAll('input');
            const minInput = inputs[0];
            const maxInput = inputs[1];
            if (this.#isLowerDown) {
                minInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (this.#isUpperDown) {
                maxInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            this.#isLowerDown = false;
            this.#isUpperDown = false;
        }
        onMovingHandle(e) {
            if (!this.#isLowerDown && !this.#isUpperDown) {
                return;
            }
            const { width: sliderWidth, left: sliderX } = this.#rangeSlider.getBoundingClientRect();
            const { width: upperHandleWidth, left: upperHandleX } = this.#upperHandle.getBoundingClientRect();
            const { width: lowerHandleWidth, left: lowerHandleX } = this.#lowerHandle.getBoundingClientRect();
            const pointerX = this.eventX(e);
            if (this.#isLowerDown) {
                const distance = pointerX - this.#lowerStartX;
                let newX = this.#lowerOffsetX + distance;
                const maxX = upperHandleX - lowerHandleWidth;
                const minX = sliderX;
                if (newX < minX) {
                    newX = minX;
                }
                if (newX > maxX) {
                    newX = maxX;
                }
                const offset = newX - sliderX;
                this.#lowerHandle.style.transform = `translate(${offset}px, -50%)`;
            }
            if (this.#isUpperDown) {
                const distance = pointerX - this.#upperStartX;
                let newX = this.#upperOffsetX + distance;
                const minX = lowerHandleX + lowerHandleWidth;
                const maxX = sliderWidth + sliderX - upperHandleWidth;
                if (newX < minX) {
                    newX = minX;
                }
                if (newX > maxX) {
                    newX = maxX;
                }
                const sliderEnd = sliderX + sliderWidth;
                const offset = 0 - (sliderEnd - newX - upperHandleWidth);
                this.#upperHandle.style.transform = `translate(${offset}px, -50%)`;
            }
            this.updateRangeInput();
            this.updateRangeBar();
        }
        slideLowerHandleTo(value) {
            value = Number(value);
            const { width: sliderWidth } = this.#rangeSlider.getBoundingClientRect();
            const { width: upperHandleWidth } = this.#upperHandle.getBoundingClientRect();
            const { width: lowerHandleWidth } = this.#lowerHandle.getBoundingClientRect();
            const maxValue = Number(this.maxValue);
            const totalWidth = sliderWidth - upperHandleWidth - lowerHandleWidth;
            const offset = (value / maxValue) * totalWidth;
            this.#lowerHandle.style.transform = `translate(${offset}px, -50%)`;
        }
        slideUpperHandleTo(value) {
            value = Number(value);
            const { width: sliderWidth } = this.#rangeSlider.getBoundingClientRect();
            const { width: upperHandleWidth } = this.#upperHandle.getBoundingClientRect();
            const { width: lowerHandleWidth } = this.#lowerHandle.getBoundingClientRect();
            const maxValue = Number(this.maxValue);
            const totalWidth = sliderWidth - upperHandleWidth - lowerHandleWidth;
            const offset = 0 - ((maxValue - value) / maxValue) * totalWidth;
            this.#upperHandle.style.transform = `translate(${offset}px, -50%)`;
        }
        updateRangeBar() {
            const { width: sliderWidth } = this.#rangeSlider.getBoundingClientRect();
            const { width: upperHandleWidth } = this.#upperHandle.getBoundingClientRect();
            const { width: lowerHandleWidth } = this.#lowerHandle.getBoundingClientRect();
            const totalValue = Number(this.maxValue);
            const totalWidth = sliderWidth - upperHandleWidth - lowerHandleWidth;
            const inputs = this.querySelectorAll('input');
            const minInput = inputs[0];
            const maxInput = inputs[1];
            const minValue = Number(minInput.value);
            const maxValue = Number(maxInput.value);
            const width = ((maxValue - minValue) / totalValue) * totalWidth;
            const offsetX = (minValue / totalValue) * totalWidth + lowerHandleWidth;
            this.#rangeBar.style.width = `${width}px`;
            this.#rangeBar.style.transform = `translateX(${offsetX}px)`;
        }
        updateRangeInput() {
            const { width: sliderWidth, left: sliderX } = this.#rangeSlider.getBoundingClientRect();
            const { width: upperHandleWidth, left: upperHandleX } = this.#upperHandle.getBoundingClientRect();
            const { width: lowerHandleWidth, left: lowerHandleX } = this.#lowerHandle.getBoundingClientRect();
            const maxValue = Number(this.maxValue);
            const totalWidth = sliderWidth - upperHandleWidth - lowerHandleWidth;
            let min = ((lowerHandleX - sliderX) / totalWidth) * maxValue;
            let max = ((upperHandleX - (sliderX + lowerHandleWidth)) / totalWidth) * maxValue;
            max = max > maxValue ? maxValue : max;
            min = min > max ? max : min;
            min = min < 0 ? 0 : min;
            const inputs = this.querySelectorAll('input');
            const minInput = inputs[0];
            const maxInput = inputs[1];
            minInput.value = min.toFixed(2);
            maxInput.value = max.toFixed(2);
        }
    }
    window.customElements.define('theme-price-range', PriceRange);
    const cacheData = [];
    const urlSearchParamsInitial = window.location.search.slice(1);
    let urlSearchParamsPrev = urlSearchParamsInitial;
    let jsActionInitList = [];
    class FacetsForm extends BaseElement {
        #formElement;
        #listContainerElement;
        #loadingElement;
        #loading = false;
        #jsActionSelector = 'theme-facets-form .js-action';
        #multiColumnSwitcherButtons = this.querySelectorAll('.facets-mobile__multi-column-switcher-button');
        constructor() {
            super();
            this.#listContainerElement = document.querySelector('#ResultsContainer');
            this.#loadingElement = document.querySelector('.facets-loading-wrapper');
            this.#formElement = this.querySelector('form');
            if (!jsActionInitList.length) {
                jsActionInitList = Array.from(document.querySelectorAll(this.#jsActionSelector));
            }
            this.addListeners();
        }
        addListeners() {
            const debounceSummitHandler = themeUtils.debounce((event) => {
                this.submitHandler(event);
            }, 500);
            this.#formElement.addEventListener('input', (event) => {
                const target = event.target;
                if (target.name !== 'sort_by' && (target.closest('.facets-layout-drawer') || target.closest('.facets-mobile'))) {
                    return;
                }
                debounceSummitHandler(event);
            });
            this.querySelectorAll('[name="confirm"]')?.forEach((confirm) => {
                confirm.addEventListener('click', (event) => {
                    this.querySelectorAll('theme-modal').forEach((modal) => {
                        modal.close();
                    });
                    debounceSummitHandler(event);
                });
            });
            this.addEventListener('history:pushState', () => this.urlChangeHandler());
            const onHistoryChange = (event) => {
                let searchParams = urlSearchParamsInitial;
                if (event.state) {
                    searchParams = event.state.searchParams;
                }
                if (searchParams === urlSearchParamsPrev) {
                    return;
                }
                this.updateUrl(searchParams);
            };
            window.addEventListener('popstate', onHistoryChange);
            this.addEventListener('modal:open', (event) => this.multiThemeModalToggleHandler(event));
            document.body.addEventListener('click', (event) => this.multiThemeModalToggleHandler(event));
            this.#multiColumnSwitcherButtons?.forEach((button) => {
                button.addEventListener('click', () => {
                    this.#multiColumnSwitcherButtons.forEach((_button) => {
                        _button.classList.remove('active');
                    });
                    button.classList.add('active');
                    this.emit('multi-column-switcher:click', { mobileColumns: Number(button.dataset.mobileColumns) });
                });
            });
        }
        multiThemeModalToggleHandler(event) {
            [
                ...Array.from(this.querySelectorAll('.facets-layout-horizontal .facets-filtering__details')),
                ...Array.from(this.querySelectorAll('.facets-sorting__details')),
            ].forEach((details) => {
                if (!details.contains(event.target)) {
                    details.removeAttribute('open');
                }
            });
        }
        async urlChangeHandler() {
            if (this.#loading) {
                return;
            }
            this.#loadingElement.classList.add('loading');
            this.#loading = true;
            const searchParams = new URL(window.location.href).searchParams.toString();
            urlSearchParamsPrev = searchParams;
            const url = `${window.location.pathname}?section_id=${this.getAttribute('data-section-id')}&${searchParams}`;
            const cache = cacheData.find((element) => element.url === url);
            try {
                let html = '';
                if (cache) {
                    html = cache.html;
                }
                else {
                    const response = await fetch(url);
                    html = await response.text();
                    cacheData.push({ url, html });
                }
                this.updateFacets(html);
                this.updateResults(html);
            }
            finally {
                this.#loadingElement.classList.remove('loading');
                this.#loading = false;
            }
        }
        updateFacets(html) {
            const domParser = new DOMParser();
            const parsedHTML = domParser.parseFromString(html, 'text/html');
            const jsActionResults = Array.from(parsedHTML.querySelectorAll(this.#jsActionSelector));
            for (let i = 0; i < jsActionInitList.length; i++) {
                const resultHTML = jsActionResults[i]?.outerHTML;
                if (resultHTML) {
                    const oldNode = jsActionInitList[i];
                    const newNode = jsActionResults[i];
                    oldNode.replaceWith(newNode);
                    jsActionInitList[i] = newNode;
                }
            }
        }
        updateResults(html) {
            const domParser = new DOMParser();
            const parsedHTML = domParser.parseFromString(html, 'text/html');
            const resultsContainerElement = parsedHTML.querySelector('#ResultsContainer');
            this.#listContainerElement.innerHTML = resultsContainerElement.innerHTML;
            this.dispatchEvent(new CustomEvent('facets:updated', { bubbles: true, detail: { parsedHTML } }));
        }
        submitHandler(event) {
            event.preventDefault();
            const searchParams = this.createFacetsFormSearchParams();
            this.updateUrl(searchParams);
        }
        updateUrl(searchParams) {
            window.history.pushState({ searchParams }, '', `${window.location.pathname}${searchParams && `?${searchParams}`}`);
            const customEvent = new CustomEvent('history:pushState', { detail: { searchParams } });
            this.dispatchEvent(customEvent);
        }
        getPreviewQuerySearch() {
            const currentUrlWithoutFacets = new URLSearchParams(window.location.search);
            Array.from(currentUrlWithoutFacets.keys()).forEach((key) => {
                if (key.startsWith('filter') || key.startsWith('sort_by') || key === 'page_num') {
                    currentUrlWithoutFacets.delete(key);
                }
            });
            return currentUrlWithoutFacets;
        }
        createFacetsFormSearchParams(urlSearchParams) {
            const formData = new FormData(this.#formElement);
            const facetsUrlSearchParams = new URLSearchParams(formData);
            const facetsFormSearchParams = urlSearchParams ?? facetsUrlSearchParams;
            const previewQuerySearchParams = this.getPreviewQuerySearch();
            let mergedParams = new URLSearchParams([
                ...previewQuerySearchParams.entries(),
                ...facetsFormSearchParams.entries(),
            ]);
            if (urlSearchParams) {
                mergedParams = new URLSearchParams(Object.fromEntries(mergedParams));
            }
            const priceRange = this.#formElement.querySelector('theme-price-range');
            const shouldDeletePrice = priceRange?.isFullRange();
            if (shouldDeletePrice) {
                mergedParams.delete('filter.v.price.gte');
                mergedParams.delete('filter.v.price.lte');
            }
            return mergedParams.toString();
        }
        removeFilter(event) {
            event.preventDefault();
            const target = event.currentTarget;
            const href = target.getAttribute('href');
            if (!href) {
                return;
            }
            const search = href.split('?')[1] || '';
            const urlSearchParams = new URLSearchParams(search);
            this.updateUrl(this.createFacetsFormSearchParams(urlSearchParams));
        }
    }
    window.customElements.define('theme-facets-form', FacetsForm);
    class FacetsRemove extends HTMLElement {
        constructor() {
            super();
            this.#init();
        }
        #init() {
            const linkElement = this.querySelector('a');
            linkElement.addEventListener('click', (event) => {
                this.removeFilter(event);
            });
            linkElement.addEventListener('keyup', (event) => {
                event.preventDefault();
                if (event.code === 'Space') {
                    this.removeFilter(event);
                }
            });
        }
        removeFilter(event) {
            event.preventDefault();
            const facetsForm = this.closest('theme-facets-form');
            facetsForm.removeFilter(event);
        }
    }
    window.customElements.define('theme-facets-remove', FacetsRemove);
});
