defineModule('theme-select', () => {
    class ThemeSelect extends BaseElement {
        #selectElement;
        #selectPlaceholderElement;
        #mockOptionListElement;
        #onResizeHandler = themeUtils.throttle(() => this.#updatePlaceholder(), 300);
        constructor() {
            super();
            const select = this.querySelector('select');
            if (!select) {
                throw new Error('[theme-select]: child structure exception, missing select tag.');
            }
            const selectPlaceholder = this.querySelector('.theme-select__placeholder');
            if (selectPlaceholder) {
                this.#selectPlaceholderElement = selectPlaceholder;
            }
            this.#selectElement = select;
            this.#disabledNativeSelect();
            this.#mockOptionListElement = this.#updateView();
            this.#updatePlaceholder();
            this.addEventListener('focusout', () => this.close());
            this.addEventListener('keyup', this.bind(this.#keyupHandler));
        }
        connectedCallback() {
            document.body.addEventListener('click', this.bind(this.#clickHandler));
            window.addEventListener('resize', this.#onResizeHandler);
        }
        disconnectedCallback() {
            document.body.removeEventListener('click', this.bind(this.#clickHandler));
            window.removeEventListener('resize', this.#onResizeHandler);
        }
        get disabled() {
            return this.getAttribute('disabled') === 'true';
        }
        set disabled(force) {
            if (force) {
                this.setAttribute('disabled', 'true');
            }
            else {
                this.removeAttribute('disabled');
            }
        }
        get name() {
            return this.#selectElement.name;
        }
        set name(str) {
            this.#selectElement.name = str;
        }
        get value() {
            return this.#selectElement.value;
        }
        set value(val) {
            if (val === this.value) {
                return;
            }
            this.#selectElement.value = val;
            const eventOptions = { bubbles: true };
            const event = new Event('change', eventOptions);
            this.#selectElement.dispatchEvent(event);
            if (this.#selectPlaceholderElement) {
                this.#selectPlaceholderElement.innerText = this.#selectElement.options[this.#selectElement.selectedIndex].label;
            }
            Array.from(this.getElementsByClassName('theme-select__option')).forEach((option) => {
                if (option.getAttribute('value') === val) {
                    option.setAttribute('selected', 'true');
                }
                else {
                    option.removeAttribute('selected');
                }
            });
        }
        get options() {
            return Array.from(this.#selectElement.options)
                .filter((option) => option.value !== '')
                .map((option) => ({
                label: option.label,
                labelTemplate: option.querySelector('template')?.innerHTML,
                value: option.value,
                selected: option.selected,
                disabled: option.disabled,
                hidden: option.hidden,
                attributes: option.attributes,
            }));
        }
        set options(options) {
            const selectElement = this.#selectElement;
            Array.from(selectElement.options).forEach((option) => {
                if (option.value)
                    option.parentElement?.removeChild(option);
            });
            options.forEach((option) => {
                const optionElement = document.createElement('option');
                optionElement.innerHTML = `
          ${option.label}
          ${option.labelTemplate ? `<template>${option.labelTemplate}</template>` : ''}
        `;
                optionElement.value = option.value;
                optionElement.disabled = option.disabled || false;
                optionElement.hidden = option.hidden || false;
                if (option.selected) {
                    optionElement.setAttribute('selected', 'true');
                }
                if (option.attributes) {
                    Array.from(option.attributes).forEach((attr) => {
                        optionElement.attributes.setNamedItem(attr);
                    });
                }
                selectElement.options.add(optionElement);
            });
            this.#updateView();
        }
        get isOpen() {
            return this.hasAttribute('open');
        }
        set isOpen(force) {
            if (force) {
                this.setAttribute('open', 'true');
            }
            else {
                this.removeAttribute('open');
            }
        }
        get loading() {
            return this.classList.contains('loading');
        }
        set loading(force) {
            this.classList.toggle('loading', force);
        }
        get #lockScroll() {
            return themeUtils.isMobileScreen();
        }
        async toggle() {
            if (this.isOpen) {
                return this.close();
            }
            return this.open();
        }
        async open() {
            if (this.disabled || this.isOpen) {
                return;
            }
            this.isOpen = true;
            if (this.#lockScroll) {
                themeUtils.lockScroll();
            }
            else if (this.dataset.position) {
                this.dataset.adaptationPosition = this.dataset.position;
            }
            else {
                this.#adaptationPosition();
            }
            await this.#doAnimate();
        }
        async close() {
            if (!this.isOpen) {
                return;
            }
            await this.#doAnimate(true);
            if (this.#lockScroll) {
                themeUtils.unlockScroll();
            }
            this.isOpen = false;
        }
        #updateView() {
            if (this.#mockOptionListElement) {
                this.removeChild(this.#mockOptionListElement);
            }
            this.#mockOptionListElement = this.appendChild(this.#createMockOptionList());
            return this.#mockOptionListElement;
        }
        #disabledNativeSelect() {
            const select = this.#selectElement;
            select.style.pointerEvents = 'none';
            select.tabIndex = -1;
            this.tabIndex = 0;
        }
        #updatePlaceholder() {
            const option = Array.from(this.#selectElement.options).find((opt) => opt.value === '');
            if (!option)
                return;
            option.label =
                (themeUtils.isMobileScreen() ? option.dataset.mobileLabel : option.dataset.desktopLabel) ||
                    option.textContent ||
                    '';
        }
        #createMockOptionList() {
            const mainElement = themeUtils.createDom(`
      <div class="theme-select__main">
        <div class="theme-select__content">
          <div class="theme-select__head">
            <button class="theme-select__close-button" name="close" type="button">
              <svg class="icon icon-close" width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M1 1L9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
            ${this.#selectElement.title ? `<span class="theme-select__title">${this.#selectElement.title}</span>` : ''}
          </div>
          <div class="theme-select__list"></div>
          <div class="theme-select__empty-data">
            <svg width="101" height="100" viewBox="0 0 101 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M72.0228 28.8289C72.4353 28.8289 72.7962 29.0867 73.0025 29.4991L83.8303 47.0299C83.9334 47.1845 83.9334 47.2877 83.9849 47.4424V68.8917C83.9849 69.562 83.5725 69.9745 82.9022 69.9745H16.3886C15.7183 69.9745 15.3058 69.562 15.3058 68.8917V47.4424C15.3058 47.2361 15.3058 47.133 15.4089 47.0299L26.2367 29.4991C26.4429 29.0351 26.8039 28.8289 27.2164 28.8289H72.0228ZM41.0863 48.5767H17.4713V67.8605H81.8194V48.5767H58.2045C57.6889 52.8047 53.9765 56.1562 49.6454 56.1562C45.3142 56.1562 41.6534 52.8047 41.0863 48.5767ZM9.17004 57.6514V56.4655C9.17004 56.1562 9.42785 55.8983 9.73721 55.8983C10.0466 55.8983 10.3044 56.1562 10.3044 56.4655V57.6514H11.4903C11.7996 57.6514 12.0575 57.9092 12.0575 58.2186C12.0575 58.528 11.7996 58.7858 11.4903 58.7858H10.3044V59.9717C10.3044 60.281 10.0466 60.5388 9.73721 60.5388C9.42784 60.5388 9.17004 60.281 9.17004 59.9717V58.7858H7.98414C7.67477 58.7858 7.41697 58.528 7.41697 58.2186C7.41697 57.9092 7.67477 57.6514 7.98414 57.6514H9.17004ZM57.2248 46.4111H81.1491L71.4041 31.046H27.8867L18.0901 46.4111H42.0659C42.7362 46.4111 43.1487 46.8236 43.1487 47.4939C43.1487 51.0516 46.0877 53.9906 49.6454 53.9906C53.2031 53.9906 56.142 51.0516 56.142 47.4939C56.142 46.8236 56.5545 46.4111 57.2248 46.4111ZM3.8077 50.3298C1.84839 50.3298 0.25 48.7314 0.25 46.7721C0.25 44.8127 1.84839 43.2144 3.8077 43.2144C5.76702 43.2144 7.36541 44.8127 7.36541 46.7721C7.36541 48.7829 5.76702 50.3298 3.8077 50.3298ZM3.8077 48.5767C4.78736 48.5767 5.56078 47.8033 5.56078 46.8236C5.56078 45.844 4.78736 45.0706 3.8077 45.0706C2.82805 45.0706 2.05463 45.844 2.05463 46.8236C2.05463 47.8033 2.82805 48.5767 3.8077 48.5767ZM94.4002 41.8738H95.5346C95.844 41.8738 96.1018 42.1316 96.1018 42.4409C96.1018 42.7503 95.844 43.0081 95.5346 43.0081H94.4002V44.1425C94.4002 44.4518 94.1424 44.7096 93.8331 44.7096C93.5237 44.7096 93.2659 44.4518 93.2659 44.194V43.0597H92.1316C91.8222 43.0597 91.5644 42.8019 91.5644 42.4925C91.5644 42.1831 91.8222 41.9253 92.1316 41.9253H93.2659V40.7394C93.2659 40.4301 93.5237 40.1723 93.8331 40.1723C94.1424 40.1723 94.4002 40.4301 94.4002 40.7394V41.8738ZM98.422 38.7286C97.5455 38.7286 96.772 38.0067 96.772 37.0786C96.772 36.1505 97.4939 35.4287 98.422 35.4287C99.2985 35.4287 100.072 36.1505 100.072 37.0786C100.072 38.0067 99.3501 38.7286 98.422 38.7286ZM88.0583 35.9443V37.7489C88.0583 38.2129 87.6458 38.6254 87.1817 38.6254C86.7177 38.6254 86.3052 38.2645 86.3052 37.7489V35.9443H84.5006C84.0365 35.9443 83.624 35.5318 83.624 35.0677C83.624 34.5521 83.9849 34.1912 84.5006 34.1912H86.3052V32.3866C86.3052 31.9225 86.7177 31.51 87.1817 31.51C87.6973 31.51 88.0583 31.871 88.0583 32.3866V34.1912H89.8629C90.3269 34.1912 90.7394 34.6037 90.7394 35.0677C90.7394 35.5833 90.3785 35.9443 89.8629 35.9443H88.0583ZM98.422 37.9551C98.8861 37.9551 99.247 37.5942 99.247 37.1302C99.247 36.6661 98.8861 36.3052 98.422 36.3052C97.958 36.3052 97.597 36.6661 97.597 37.1302C97.597 37.5942 98.0095 37.9551 98.422 37.9551ZM10.0466 32.6959V30.9429C10.0466 30.4788 10.4075 30.0663 10.9231 30.0663C11.3872 30.0663 11.7996 30.4272 11.7996 30.9429V32.7475C11.7996 32.7475 13.5527 32.7475 13.5527 32.6959C14.0168 32.6959 14.4293 33.0569 14.4293 33.5725C14.4293 34.0365 14.0683 34.449 13.5527 34.449H11.7996V36.2021C11.7996 36.6661 11.4387 37.0786 10.9231 37.0786C10.4591 37.0786 10.0466 36.7177 10.0466 36.2021V34.449H8.2935C7.82946 34.449 7.41697 34.0881 7.41697 33.5725C7.41697 33.1084 7.77789 32.6959 8.2935 32.6959H10.0466Z"
                fill="currentColor"
              />
            </svg>
          </div>
        </div>
      </div>
    `);
            const listElement = mainElement.querySelector('.theme-select__list');
            this.options.forEach((option) => {
                if (!option.value)
                    return;
                const mockOption = themeUtils.createDom(`
          <div class="theme-select__option">
            <svg class="icon theme-select__check-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 5.5L4.5 9L11 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
        `);
                if (option.attributes) {
                    Array.from(option.attributes).forEach((attr) => {
                        if (attr.name === 'class') {
                            return;
                        }
                        mockOption.attributes.setNamedItem(attr.cloneNode(true));
                    });
                }
                mockOption.classList.add('theme-select__option');
                if (option.labelTemplate) {
                    const template = document.createElement('template');
                    template.innerHTML = option.labelTemplate;
                    mockOption.appendChild(template.content);
                }
                else {
                    const content = document.createElement('span');
                    content.textContent = option.label;
                    mockOption.appendChild(content);
                }
                listElement.appendChild(mockOption);
            });
            return mainElement;
        }
        #clickHandler(event) {
            const clickElement = event.target;
            const isClickTrigger = clickElement === this;
            if (!this.contains(clickElement)) {
                return this.close();
            }
            if (isClickTrigger) {
                return this.toggle();
            }
            const clickOption = clickElement.closest('.theme-select__option');
            if (clickOption) {
                return this.#selectOption(clickOption);
            }
            const clickMask = clickElement.classList.contains('theme-select__main');
            const clickButton = clickElement.closest('button');
            const clickCloseButton = clickButton && clickButton.getAttribute('name') === 'close';
            if (clickMask || clickCloseButton) {
                return this.close();
            }
            return false;
        }
        #keyupHandler(event) {
            switch (event.code) {
                case 'Escape': {
                    this.close();
                    break;
                }
            }
        }
        #selectOption(option) {
            const isDisabled = option.hasAttribute('disabled');
            if (isDisabled) {
                return;
            }
            const value = option.getAttribute('value');
            if (value) {
                this.value = value;
            }
            this.close();
        }
        #doAnimate(isClose = false) {
            const contentElement = this.#mockOptionListElement.querySelector('.theme-select__content');
            if (!contentElement) {
                return Promise.resolve();
            }
            let timer;
            return new Promise((resolve) => {
                const onAnimationend = (event) => {
                    if (event && event.target !== contentElement) {
                        return;
                    }
                    contentElement.style.animationDirection = '';
                    contentElement.style.animationName = '';
                    clearTimeout(timer);
                    resolve(this);
                };
                requestAnimationFrame(() => {
                    if (isClose) {
                        contentElement.style.animationDirection = 'reverse';
                    }
                    contentElement.style.animationName = `var(--select-animation-name, animation-fade-in-center)`;
                    contentElement.addEventListener('animationend', onAnimationend, { once: true });
                    timer = setTimeout(onAnimationend, 200);
                });
            });
        }
        #getViewportSize() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            return {
                width,
                height,
                left: 0,
                right: width,
                top: 0,
                bottom: height,
            };
        }
        #adaptationPosition() {
            const contentElement = this.#mockOptionListElement;
            const triggerRect = this.getBoundingClientRect();
            const viewport = this.#getViewportSize();
            const MIN_GAP = 10;
            const contentRect = contentElement.getBoundingClientRect();
            const usableSpace = {
                top: triggerRect.top - MIN_GAP,
                bottom: viewport.height - triggerRect.bottom - MIN_GAP,
            };
            const enoughSpace = {
                bottom: usableSpace.bottom >= contentRect.height,
                top: usableSpace.top >= contentRect.height,
            };
            const position = Object.entries(enoughSpace).find(([, isEnoughSpace]) => isEnoughSpace)?.[0] ?? 'bottom';
            this.dataset.adaptationPosition = position;
        }
    }
    customElements.define('theme-select', ThemeSelect);
});
