defineModule('theme-featured-collection-tabs', () => {
    class FeaturedCollectionTabs extends HTMLElement {
        #tab_items = this.querySelectorAll('.featured-collection__tab');
        #sectionId = this.dataset.sectionId;
        #carouselClassName = '.featured-collection__carousel';
        #loadingClassName = '.featured-collection__tabs-loading';
        #tabsContentInnerClassName = '.featured-collection__tabs-content-inner';
        #tabsHeaderClassName = '.featured-collection__tabs-header';
        #tabsListClassName = '.featured-collection__tabs-list';
        #viewMoreButtonClassName = '.featured-collection__view-more';
        #cache = new Map();
        get #loading() {
            return this.dataset.loading === 'true';
        }
        set #loading(force) {
            this.dataset.loading = String(force);
            this.querySelector(this.#loadingClassName).classList.toggle('hidden', !force);
            this.querySelector(this.#tabsContentInnerClassName).classList.toggle('hidden', force);
        }
        constructor() {
            super();
            const blockId = this.#tab_items[0].dataset.blockId;
            this.#cache.set(blockId, this.querySelector(this.#carouselClassName));
            this.#cache.set(this.#getViewMoreButtonCacheKey(blockId), this.querySelector(this.#viewMoreButtonClassName));
            this.bindEvents(this.#tab_items);
        }
        bindEvents(tabItems) {
            tabItems.forEach((tab) => {
                tab.addEventListener('click', (event) => {
                    const target = event.currentTarget;
                    const { blockId } = target.dataset;
                    this.#switchTo(blockId);
                });
            });
        }
        #switchTo(blockId) {
            if (this.#loading) {
                return;
            }
            let currentTab = null;
            this.#tab_items.forEach((tab) => {
                const isCurrent = tab.dataset.blockId === blockId;
                tab.classList.toggle('active', isCurrent);
                if (isCurrent) {
                    currentTab = tab;
                }
            });
            if (currentTab) {
                this.#scrollTabIntoView(currentTab);
            }
            this.#fetchProducts(blockId);
        }
        #getViewMoreButtonCacheKey(blockId) {
            return `${blockId}_view-more`;
        }
        #scrollTabIntoView(tab) {
            const tabsList = tab.closest(this.#tabsListClassName);
            if (!tabsList)
                return;
            const tabRect = tab.getBoundingClientRect();
            const tabsListRect = tabsList.getBoundingClientRect();
            const startOverflow = tabRect.left - tabsListRect.left;
            const endOverflow = tabRect.right - tabsListRect.right;
            if (startOverflow < 0) {
                tabsList.scrollLeft += startOverflow;
                return;
            }
            if (endOverflow > 0) {
                tabsList.scrollLeft += endOverflow;
            }
        }
        #replaceCarousel(nextCarousel) {
            const currentCarousel = this.querySelector(this.#carouselClassName);
            const currentTabsList = currentCarousel.querySelector(this.#tabsListClassName);
            const tabsListScrollLeft = currentTabsList?.scrollLeft ?? 0;
            nextCarousel.querySelector(this.#loadingClassName)?.classList.add('hidden');
            nextCarousel.querySelector(this.#tabsContentInnerClassName)?.classList.remove('hidden');
            if (currentCarousel !== nextCarousel) {
                if (currentTabsList) {
                    const nextTabsList = nextCarousel.querySelector(this.#tabsListClassName);
                    if (nextTabsList) {
                        nextTabsList.replaceWith(currentTabsList);
                    }
                    else {
                        nextCarousel.querySelector(this.#tabsHeaderClassName)?.prepend(currentTabsList);
                    }
                }
                currentCarousel.replaceWith(nextCarousel);
            }
            if (!currentTabsList)
                return;
            currentTabsList.scrollLeft = tabsListScrollLeft;
            requestAnimationFrame(() => {
                currentTabsList.scrollLeft = tabsListScrollLeft;
            });
        }
        #replaceViewMoreButton(nextViewMoreButton) {
            this.querySelector(this.#viewMoreButtonClassName).replaceWith(nextViewMoreButton);
        }
        async #fetchProducts(blockId) {
            const viewMoreButtonCacheKey = this.#getViewMoreButtonCacheKey(blockId);
            const cached = this.#cache.get(blockId);
            const cachedViewMore = this.#cache.get(viewMoreButtonCacheKey);
            if (cached) {
                this.#replaceCarousel(cached);
                cached.reset();
                this.#replaceViewMoreButton(cachedViewMore);
                return;
            }
            this.#loading = true;
            try {
                const queryPath = new URL(window.location);
                const { searchParams } = queryPath;
                searchParams.append('section_id', this.#sectionId);
                searchParams.append('attributes', JSON.stringify({
                    block_id: blockId,
                }));
                const response = await fetch(queryPath.toString());
                const responseText = await response.text();
                const responseHTML = new DOMParser().parseFromString(responseText, 'text/html');
                responseHTML?.querySelectorAll(`style[${window.Shopline.styleSelector.local}]`).forEach((style) => {
                    document.body.append(style);
                });
                const carousel = responseHTML.querySelector(this.#carouselClassName);
                this.#replaceCarousel(carousel);
                const viewMoreButton = responseHTML.querySelector(this.#viewMoreButtonClassName);
                this.#replaceViewMoreButton(viewMoreButton);
                this.#cache.set(blockId, carousel);
                this.#cache.set(viewMoreButtonCacheKey, viewMoreButton);
            }
            catch (error) {
                console.error(error);
            }
            finally {
                this.#loading = false;
            }
        }
    }
    customElements.define('theme-featured-collection-tabs', FeaturedCollectionTabs);
});
