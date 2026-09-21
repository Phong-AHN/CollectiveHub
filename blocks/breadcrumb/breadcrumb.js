defineModule('theme-breadcrumb', () => {
    class Breadcrumb extends BaseElement {
        #isRendered = false;
        #displayNames = [];
        #links = [];
        #breadcrumbList = [];
        #breadcrumbContainer;
        #breadcrumbHoverableParts;
        #partFontSize;
        #partSizeMap = new Map();
        #breadcrumbContainerInitialScrollWidth;
        #lastPartInitialWidth;
        #resizeObserver;
        #separatorOfPart = '\u241E';
        get pageType() {
            return document.body.getAttribute('data-page-type') ?? '';
        }
        get shouldGetPathFromCache() {
            return this.pageType === 'product' && !this.hasCollectionHandle;
        }
        get hasCollectionHandle() {
            return this.getAttribute('data-has-collection-handle') === 'true';
        }
        constructor() {
            super();
            this.#init();
        }
        disconnectedCallback() {
            super.disconnectedCallback();
            if (this.#resizeObserver) {
                this.#resizeObserver.disconnect();
            }
        }
        connectedCallback() {
            super.connectedCallback();
            this.#initObserver();
        }
        #parseAttribute(attr) {
            const raw = this.getAttribute(attr) ?? '';
            try {
                return decodeURIComponent(raw).split(this.#separatorOfPart);
            }
            catch {
                return [];
            }
        }
        #init() {
            const displayNames = this.#parseAttribute('data-display-names');
            const links = this.#parseAttribute('data-links');
            const rootUrl = links.shift() || '/';
            const rootDisplayName = displayNames.shift() || 'Home';
            if (this.shouldGetPathFromCache) {
                const { displayName, link } = this.#getCacheBreadcrumb();
                displayNames.unshift(displayName);
                links.unshift(link);
            }
            displayNames.unshift(rootDisplayName);
            links.unshift(rootUrl);
            this.#displayNames = displayNames.filter(Boolean);
            this.#links = links.filter(Boolean);
            this.#breadcrumbContainer = this.querySelector('ul');
            this.#breadcrumbHoverableParts = this.querySelector('.block-breadcrumb-hoverable-parts-wrapper-content');
            this.#breadcrumbList = this.#displayNames
                .map((name, index) => ({ name, link: this.#links[index] }))
                .filter(({ link }) => Boolean(link));
            this.#render();
            this.#collectPartSize();
            this.#calculateCollapseBGColor();
            this.#layout();
        }
        #initObserver() {
            this.#resizeObserver = new ResizeObserver(themeUtils.debounce(() => {
                this.#clearAllPartsEffect();
                this.#collectPartSize();
                this.#layout();
            }, 100));
            this.#resizeObserver.observe(this.#breadcrumbContainer);
        }
        #render() {
            const breadcrumbListFragment = document.createDocumentFragment();
            this.#breadcrumbList.forEach(({ name, link }, index) => {
                const li = document.createElement('li');
                const div = document.createElement('div');
                if (index === this.#breadcrumbList.length - 1) {
                    const span = document.createElement('span');
                    span.textContent = name;
                    div.appendChild(span);
                }
                else {
                    const a = document.createElement('a');
                    a.href = link;
                    a.textContent = name;
                    div.appendChild(a);
                }
                li.appendChild(div);
                breadcrumbListFragment.appendChild(li);
            });
            this.#breadcrumbContainer.prepend(breadcrumbListFragment);
            this.#isRendered = true;
        }
        #layout() {
            if (!this.#isRendered) {
                return;
            }
            const { clientWidth } = this.#breadcrumbContainer;
            if (clientWidth >= this.#breadcrumbContainerInitialScrollWidth) {
                this.#clearAllPartsEffect();
                return;
            }
            const overflowWidth = this.#breadcrumbContainerInitialScrollWidth - clientWidth;
            const minPartMaxWidth = 50;
            let collapseWidth = 0;
            let index = 0;
            const hoverableParts = document.createDocumentFragment();
            for (const [part, width] of this.#partSizeMap) {
                this.#clearPartEffect(part);
                if (index === this.#partSizeMap.size - 1) {
                    if (collapseWidth < overflowWidth) {
                        part.style.setProperty('--breadcrumb-last-part-max-width', `${this.#lastPartInitialWidth - (overflowWidth - collapseWidth) - this.#partFontSize * 3 - 10}px`);
                    }
                    break;
                }
                if (collapseWidth >= overflowWidth) {
                    break;
                }
                if (index === 0) {
                    index++;
                    continue;
                }
                const partMaxWidth = Math.max(width - overflowWidth, minPartMaxWidth);
                part.style.setProperty('--breadcrumb-part-max-width', `${partMaxWidth}px`);
                const isFirstCollapsedPart = hoverableParts.childNodes.length === 0;
                part.classList.add(isFirstCollapsedPart ? 'collapsed' : 'collapsed-mini');
                if (isFirstCollapsedPart && partMaxWidth === minPartMaxWidth) {
                    part.classList.add('collapsed-all');
                }
                if (isFirstCollapsedPart) {
                    this.#breadcrumbContainer.style.setProperty('--breadcrumb-collapsed-offset-left', `${part.offsetLeft}px`);
                }
                const clonedPart = part.cloneNode(true);
                this.#clearPartEffect(clonedPart);
                hoverableParts.appendChild(clonedPart);
                collapseWidth += width - partMaxWidth;
                index++;
            }
            if (hoverableParts.childNodes.length > 0) {
                this.#breadcrumbHoverableParts.replaceChildren(hoverableParts);
            }
            this.#breadcrumbContainer.style.setProperty('--breadcrumb-collapsed-offset-top', `${this.#breadcrumbContainer.offsetHeight}px`);
        }
        #calculateCollapseBGColor() {
            const rgb = getComputedStyle(this.#breadcrumbContainer).getPropertyValue('--color-scheme-background');
            const [r, g, b] = rgb.split(',').map(Number);
            const isLight = this.#isLightColor(r, g, b);
            const bgColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
            this.#breadcrumbContainer.style.setProperty('--color-scheme-background', bgColor);
        }
        #isLightColor(r, g, b) {
            return 0.299 * r + 0.587 * g + 0.114 * b >= 120;
        }
        #clearPartEffect(part) {
            part.classList.remove('collapsed', 'collapsed-mini', 'collapsed-all');
            part.style.removeProperty('--breadcrumb-part-max-width');
            part.style.removeProperty('--breadcrumb-last-part-max-width');
        }
        #clearAllPartsEffect() {
            this.#breadcrumbContainer.querySelectorAll('li').forEach((part) => {
                this.#clearPartEffect(part);
            });
            this.#breadcrumbHoverableParts.replaceChildren('');
        }
        #collectPartSize() {
            this.#breadcrumbContainerInitialScrollWidth = this.#breadcrumbContainer.scrollWidth;
            this.#lastPartInitialWidth = this.#breadcrumbContainer.querySelector('li:last-of-type')?.clientWidth ?? 0;
            const partList = this.querySelectorAll('li');
            partList.forEach((part) => {
                this.#partSizeMap.set(part, part.clientWidth);
            });
            this.#partFontSize = Number(getComputedStyle(this.#breadcrumbContainer).fontSize.replace('px', '')) || 14;
        }
        #getCacheBreadcrumb() {
            const cacheBreadcrumbList = ThemeStorage.getItem('breadcrumb');
            if (cacheBreadcrumbList) {
                try {
                    const parsedCacheBreadcrumbList = JSON.parse(cacheBreadcrumbList);
                    if (!Array.isArray(parsedCacheBreadcrumbList)) {
                        return { displayName: '', link: '' };
                    }
                    if (parsedCacheBreadcrumbList.length === 0) {
                        return { displayName: '', link: '' };
                    }
                    if (parsedCacheBreadcrumbList[parsedCacheBreadcrumbList.length - 1].pageType === this.pageType) {
                        parsedCacheBreadcrumbList.pop();
                    }
                    const { pageResource, pageType } = parsedCacheBreadcrumbList.pop() ?? {};
                    if (pageType === 'collection' && pageResource?.collection) {
                        const { handle, title, url } = pageResource.collection;
                        if (handle && title && url) {
                            return { displayName: decodeURIComponent(title), link: decodeURIComponent(url) };
                        }
                    }
                }
                catch {
                    return { displayName: '', link: '' };
                }
            }
            return { displayName: '', link: '' };
        }
    }
    customElements.define('theme-breadcrumb', Breadcrumb);
});
