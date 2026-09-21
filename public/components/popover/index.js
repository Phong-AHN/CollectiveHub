defineModule('theme-popover', () => {
    const MIN_GAP = 20;
    const HOVER_CLOSE_DELAY = 200;
    const ANIMATION_DURATION = 200;
    class Popover extends VisibleElement {
        #isOpen = this.hasAttribute('open') && this.getAttribute('open') !== 'false';
        #animation;
        #contentElement;
        #containerElement;
        #cleanEventListener;
        #resizeObserver;
        constructor() {
            super();
            const content = this.querySelector('theme-popover-content');
            if (!content) {
                throw new Error('[theme-popover] missing theme-popover-content tag!');
            }
            this.#contentElement = content;
            this.#animation = this.#createAnimation(content);
            if (!this.#isClone) {
                this.addEventListener('custom:visible', this.bind(this.#mountContainer), { once: true });
            }
        }
        connectedCallback() {
            super.connectedCallback();
            if (!this.#isClone) {
                const cleanTriggerEventListener = this.#addTriggerEventListener();
                const cleanUpdateEventListener = this.#addUpdateEventListener();
                this.#cleanEventListener = () => {
                    cleanTriggerEventListener();
                    cleanUpdateEventListener();
                };
            }
        }
        disconnectedCallback() {
            super.disconnectedCallback();
            this.#cleanEventListener?.();
        }
        get trigger() {
            return this.dataset.trigger ?? 'hover';
        }
        get position() {
            return this.dataset.position ?? 'top';
        }
        get #isClone() {
            return this.getDatasetValue('clone', 'boolean');
        }
        async open() {
            if (this.#isOpen) {
                return;
            }
            this.#isOpen = true;
            if (this.#animation.playState === 'running') {
                await this.#animation.finished;
            }
            this.#updateOpenState(true);
            this.#adaptationPosition();
            this.#animation.reverse();
        }
        async close() {
            if (!this.#isOpen) {
                return;
            }
            this.#isOpen = false;
            this.#animation.reverse();
            await this.#animation.finished;
            this.#updateOpenState(false);
        }
        #mountContainer() {
            const popupContainerSelector = this.dataset.popupContainer;
            const popupContainer = popupContainerSelector ? document.querySelector(popupContainerSelector) : null;
            if (!popupContainer) {
                return;
            }
            const template = document.createElement('template');
            template.innerHTML = this.outerHTML;
            const newContainer = template.content.firstElementChild?.cloneNode(false);
            newContainer.appendChild(this.#contentElement);
            newContainer.setAttribute('data-clone', 'true');
            popupContainer.appendChild(newContainer);
            this.#containerElement = newContainer;
        }
        #addTriggerEventListener() {
            if (this.trigger === 'click') {
                return this.#addClickTrigger();
            }
            return this.#addHoverTrigger();
        }
        #addClickTrigger() {
            const clickHandler = (event) => {
                const clickElement = event.target;
                if (this.#contentElement.contains(clickElement) || this.#contentElement === clickElement) {
                    return;
                }
                if (!this.contains(clickElement)) {
                    this.close();
                    return;
                }
                if (this.#isOpen) {
                    this.close();
                }
                else {
                    this.open();
                }
            };
            document.body.addEventListener('click', clickHandler);
            return () => document.body.removeEventListener('click', clickHandler);
        }
        #addHoverTrigger() {
            let timer;
            const handleMouseEnter = (event) => {
                event.stopPropagation();
                clearTimeout(timer);
                this.open();
            };
            const handleMouseLeave = (event) => {
                event.stopPropagation();
                clearTimeout(timer);
                timer = setTimeout(() => this.close(), HOVER_CLOSE_DELAY);
            };
            this.addEventListener('mouseenter', handleMouseEnter);
            this.addEventListener('mouseleave', handleMouseLeave);
            this.#contentElement.addEventListener('mouseenter', handleMouseEnter);
            this.#contentElement.addEventListener('mouseleave', handleMouseLeave);
            return () => { };
        }
        #addUpdateEventListener() {
            const updateHandler = () => {
                if (this.#isOpen) {
                    this.#adaptationPosition();
                }
            };
            window.addEventListener('scroll', updateHandler, { capture: true, passive: true });
            window.addEventListener('resize', updateHandler);
            this.#resizeObserver = new ResizeObserver(updateHandler);
            this.#resizeObserver.observe(this);
            return () => {
                window.removeEventListener('scroll', updateHandler, { capture: true });
                window.removeEventListener('resize', updateHandler);
                this.#resizeObserver?.disconnect();
            };
        }
        #createAnimation(element) {
            const keyframes = new KeyframeEffect(element, [{ opacity: 1 }, { opacity: 0 }], {
                iterations: 1,
                duration: ANIMATION_DURATION,
                easing: 'ease',
                fill: 'both',
            });
            return new Animation(keyframes);
        }
        #updateOpenState(isOpen) {
            this.#isOpen = isOpen;
            const updateAttribute = (element) => {
                if (!element)
                    return;
                if (isOpen) {
                    element.setAttribute('open', 'true');
                }
                else {
                    element.removeAttribute('open');
                }
            };
            updateAttribute(this);
            updateAttribute(this.#containerElement);
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
        #resetPositionStyle() {
            this.style.removeProperty('--offset-x');
            this.style.removeProperty('--offset-y');
            this.style.removeProperty('--fixed-top');
            this.style.removeProperty('--fixed-left');
        }
        #adaptationPosition() {
            this.#resetPositionStyle();
            const { position } = this;
            const popoverRect = this.getBoundingClientRect();
            const viewport = this.#getViewportSize();
            let contentRect = this.#contentElement.getBoundingClientRect();
            const usableSpace = this.#calculateUsableSpace(popoverRect, viewport);
            const enoughSpace = this.#checkEnoughSpace(contentRect, usableSpace);
            const adaptationPosition = this.#findBestPosition(position, enoughSpace);
            this.#updateContentPosition(adaptationPosition, popoverRect, contentRect);
            contentRect = this.#contentElement.getBoundingClientRect();
            const offsetDistance = this.#getOffsetDistance(adaptationPosition, contentRect, viewport);
            this.#updateContentStyle(adaptationPosition, offsetDistance);
        }
        #calculateUsableSpace(popoverRect, viewport) {
            return {
                top: popoverRect.top - MIN_GAP,
                bottom: viewport.height - popoverRect.bottom - MIN_GAP,
                left: popoverRect.left - MIN_GAP,
                right: viewport.width - popoverRect.right - MIN_GAP,
            };
        }
        #checkEnoughSpace(contentRect, usableSpace) {
            return {
                left: usableSpace.left >= contentRect.width && usableSpace.top >= 0 && usableSpace.bottom >= 0,
                right: usableSpace.right >= contentRect.width && usableSpace.top >= 0 && usableSpace.bottom >= 0,
                top: usableSpace.top >= contentRect.height && usableSpace.left >= 0 && usableSpace.right >= 0,
                bottom: usableSpace.bottom >= contentRect.height && usableSpace.left >= 0 && usableSpace.right >= 0,
            };
        }
        #findBestPosition(preferredPosition, enoughSpace) {
            const positionPriority = {
                left: ['left', 'right', 'top', 'bottom'],
                right: ['right', 'left', 'top', 'bottom'],
                top: ['top', 'bottom', 'left', 'right'],
                bottom: ['bottom', 'top', 'left', 'right'],
            };
            const bestPosition = positionPriority[preferredPosition].find((pos) => enoughSpace[pos]);
            return bestPosition ?? preferredPosition;
        }
        #updateContentPosition(position, triggerRect, contentRect) {
            const { top, left } = this.#calculatePosition(position, triggerRect, contentRect);
            const updateElement = (element) => {
                if (!element)
                    return;
                element.style.setProperty('--fixed-top', `${top}px`);
                element.style.setProperty('--fixed-left', `${left}px`);
            };
            updateElement(this);
            updateElement(this.#containerElement);
        }
        #calculatePosition(position, triggerRect, contentRect) {
            const centerX = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
            const centerY = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
            const positionMap = {
                top: { top: triggerRect.top - contentRect.height, left: centerX },
                bottom: { top: triggerRect.bottom, left: centerX },
                left: { top: centerY, left: triggerRect.left - contentRect.width },
                right: { top: centerY, left: triggerRect.right },
            };
            return positionMap[position];
        }
        #getOffsetDistance(position, contentRect, viewport) {
            const isHorizontalPosition = position === 'top' || position === 'bottom';
            const direction = isHorizontalPosition ? 'horizontal' : 'vertical';
            return this.#calculateOffset(direction, contentRect, viewport);
        }
        #calculateOffset(direction, contentRect, viewport) {
            const rangeKeys = {
                horizontal: { start: 'left', end: 'right' },
                vertical: { start: 'top', end: 'bottom' },
            };
            const { start, end } = rangeKeys[direction];
            const offsetStart = viewport[start] + MIN_GAP - contentRect[start];
            const offsetEnd = viewport[end] - MIN_GAP - contentRect[end];
            let offsetValue = 0;
            if (offsetStart > 0) {
                offsetValue = offsetStart;
            }
            else if (offsetEnd < 0) {
                offsetValue = offsetEnd;
            }
            return {
                offsetX: direction === 'horizontal' ? offsetValue : 0,
                offsetY: direction === 'vertical' ? offsetValue : 0,
            };
        }
        #updateContentStyle(position, offsetDistance) {
            const isAdapted = position !== this.position;
            const updateElement = (element) => {
                if (!element)
                    return;
                if (isAdapted) {
                    element.dataset.adaptationPosition = position;
                }
                else {
                    element.removeAttribute('data-adaptation-position');
                }
                element.style.setProperty('--offset-x', `${offsetDistance.offsetX}px`);
                element.style.setProperty('--offset-y', `${offsetDistance.offsetY}px`);
            };
            updateElement(this);
            updateElement(this.#containerElement);
        }
    }
    class PopoverContent extends HTMLElement {
    }
    customElements.define('theme-popover', Popover);
    customElements.define('theme-popover-content', PopoverContent);
});
