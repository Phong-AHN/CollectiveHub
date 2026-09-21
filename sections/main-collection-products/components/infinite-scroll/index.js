defineModule('infinite-scroll', () => {
    class InfiniteScroll extends HTMLElement {
        page = 1;
        observer = null;
        loading = false;
        button = null;
        buttonWrapper = null;
        enableInfiniteScrollButton = false;
        cachePageKey = 'SL_COLLECTION_CACHE';
        cacheLastClickKey = 'SL_COLLECTION_LAST_CLICKED_ID';
        cacheLastScrollKey = 'SL_COLLECTION_LAST_SCROLL';
        constructor() {
            super();
            this.init();
            this.addEventListener('facets:updated', (event) => {
                this.page = 1;
                this.init();
                this.updateAttributes(event);
            });
        }
        updateAttributes(event) {
            const { detail } = event;
            if (!detail) {
                return;
            }
            const { parsedHTML } = detail;
            const total = parsedHTML.querySelector('theme-infinite-scroll')?.dataset.total;
            if (total !== undefined) {
                this.dataset.total = total;
            }
        }
        init() {
            this.enableInfiniteScrollButton = this.dataset.enableInfiniteScrollButton === 'true';
            this.button = this.querySelector(this.dataset.buttonSelector);
            this.buttonWrapper = this.querySelector(this.dataset.buttonWrapperSelector);
            this.ensureUrlValid();
            this.checkHistory();
            this.bindProductClick();
            const useButton = Boolean(this.enableInfiniteScrollButton);
            if (useButton) {
                this.bindButton();
                return;
            }
            const flag = this.insertFlag();
            const option = {
                threshold: 1,
            };
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (this.isLastPageLoaded) {
                        return;
                    }
                    if (entry.isIntersecting && !this.loading) {
                        this.loadMore();
                    }
                });
            }, option);
            this.observer.observe(flag);
        }
        bindProductClick() {
            this.addEventListener('click', (e) => {
                const target = e.target;
                const card = target.closest('.product-card-wrapper');
                if (card) {
                    const id = card.dataset?.productId;
                    this.cacheClickId(id);
                }
            });
        }
        checkHistory() {
            const cachePage = window.sessionStorage.getItem(this.cachePageKey);
            const cacheLastScroll = window.sessionStorage.getItem(this.cacheLastScrollKey);
            if (!cachePage || !cacheLastScroll) {
                return;
            }
            try {
                const cachePageData = JSON.parse(cachePage);
                if (cachePageData.currentPath !== window.location.pathname) {
                    return;
                }
                const lastLoadPage = cachePageData.currentPage;
                const { contentWrapperSelector, loadingElementSelector, loadingBtnElementSelector } = this.dataset;
                const contentWrapper = this.querySelector(contentWrapperSelector);
                const loadingElement = this.querySelector(loadingElementSelector);
                const loadingBtnElement = this.querySelector(loadingBtnElementSelector);
                contentWrapper.innerHTML = lastLoadPage.html.list;
                if (loadingElement) {
                    loadingElement.innerHTML = lastLoadPage.html.loading;
                }
                if (loadingBtnElement) {
                    loadingBtnElement.innerHTML = lastLoadPage.html.loadingBtn;
                }
                this.page = lastLoadPage.page;
                this.handleLoadingButton(false);
                window.scrollTo({
                    top: Number(cacheLastScroll),
                    behavior: 'smooth',
                });
                window.sessionStorage.removeItem(this.cacheLastScrollKey);
            }
            catch (error) {
                console.error('infinite scroll error: ', error);
            }
        }
        bindButton() {
            this.button?.addEventListener('click', () => {
                if (this.isLastPageLoaded) {
                    return;
                }
                if (!this.loading) {
                    this.loadMore();
                }
            });
        }
        reset(params) {
            this.page = 1;
            this.dataset.total = params.total;
            this.dataset.pageSize = params.pageSize;
        }
        get isLastPageLoaded() {
            const { pageSize, total } = this.dataset;
            const currentNum = this.page * Number(pageSize);
            return currentNum >= Number(total);
        }
        insertFlag() {
            const flag = document.createElement('div');
            flag.classList.add('infinite-scroll-flag');
            this.appendChild(flag);
            return flag;
        }
        handleLoading(loading) {
            this.loading = loading;
            this.handleLoadingButton(loading);
            const { loadingElementSelector, loadingActiveClass } = this.dataset;
            const ele = this.querySelector(loadingElementSelector);
            if (!ele) {
                return;
            }
            if (loading) {
                ele.classList.add(loadingActiveClass);
            }
            else {
                ele.classList.remove(loadingActiveClass);
            }
        }
        handleLoadingButton(loading) {
            if (!this.button) {
                return;
            }
            const loadingDisabledClass = 'disabled';
            const loadingActiveClass = 'loading';
            if (loading) {
                this.button.classList.add(loadingDisabledClass);
                this.button.classList.add(loadingActiveClass);
            }
            else {
                this.button.classList.remove(loadingDisabledClass);
                this.button.classList.remove(loadingActiveClass);
            }
            if (this.isLastPageLoaded) {
                this.buttonWrapper?.classList.add('hidden');
            }
        }
        ensureUrlValid() {
            const url = themeUtils.removeURLArg(window.location.href, ['page_num', 'page_size']);
            window.history.pushState({}, '', url);
        }
        loadMore() {
            const { pageSize, section: sectionId, contentWrapperSelector, loadingElementSelector, loadingBtnElementSelector, } = this.dataset;
            const url = themeUtils.changeURLArg(window.location.href, {
                page_num: this.page + 1,
                page_size: pageSize,
                section_id: sectionId,
            });
            this.handleLoading(true);
            fetch(url)
                .then((res) => res.text())
                .then((resText) => {
                const html = new DOMParser().parseFromString(resText, 'text/html');
                const source = html.querySelector(contentWrapperSelector);
                const destination = this.querySelector(contentWrapperSelector);
                if (!source || !destination) {
                    return;
                }
                destination.innerHTML += source.innerHTML;
                const currentLoadingElement = this.querySelector(loadingElementSelector);
                const updateLoadingElement = html.querySelector(loadingElementSelector);
                if (currentLoadingElement && updateLoadingElement) {
                    currentLoadingElement.innerHTML = updateLoadingElement.innerHTML;
                }
                const currentLoadingBtnElement = this.querySelector(loadingBtnElementSelector);
                const updateLoadingBtnElement = html.querySelector(loadingBtnElementSelector);
                if (currentLoadingBtnElement && updateLoadingBtnElement) {
                    currentLoadingBtnElement.innerHTML = updateLoadingBtnElement.innerHTML;
                }
                this.page += 1;
                this.handleLoading(false);
                this.cachePage({
                    page: this.page,
                    html: {
                        list: destination.innerHTML,
                        loading: currentLoadingElement?.innerHTML || '',
                        loadingBtn: currentLoadingBtnElement?.innerHTML || '',
                    },
                });
            });
        }
        cacheClickId(id) {
            window.sessionStorage.setItem(this.cacheLastClickKey, id);
            window.sessionStorage.setItem(this.cacheLastScrollKey, window.scrollY.toString());
        }
        cachePage(cacheItem) {
            const cacheKey = this.cachePageKey;
            const initialData = {
                currentPath: window.location.pathname,
                currentPage: {},
            };
            const cacheDataString = window.sessionStorage.getItem(cacheKey);
            let cacheData;
            if (!cacheDataString) {
                cacheData = initialData;
            }
            else {
                try {
                    const parsedData = JSON.parse(cacheDataString);
                    if (parsedData.currentPath !== window.location.pathname) {
                        cacheData = initialData;
                    }
                    else {
                        cacheData = parsedData;
                    }
                }
                catch {
                    cacheData = initialData;
                }
            }
            cacheData.currentPage = cacheItem;
            window.sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
        }
    }
    customElements.define('theme-infinite-scroll', InfiniteScroll);
});
