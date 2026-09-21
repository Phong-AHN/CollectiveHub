if (typeof window.Shopline === 'undefined') {
    window.Shopline = {};
}
const defineModule = (() => {
    const modules = new Map();
    return (name, definer) => {
        if (!modules.has(name)) {
            modules.set(name, definer);
            definer();
        }
    };
})();
;
var EnumThemeEvent;
(function (EnumThemeEvent) {
    EnumThemeEvent["ProductViewed"] = "product:viewed";
    EnumThemeEvent["VariantChanged"] = "variant:changed";
    EnumThemeEvent["VariantAdded"] = "variant:added";
    EnumThemeEvent["CartOpened"] = "cart:opened";
    EnumThemeEvent["CartClosed"] = "cart:closed";
    EnumThemeEvent["OpenCart"] = "cart:open";
    EnumThemeEvent["OpenQuickAddModal"] = "quick-add:open";
})(EnumThemeEvent || (EnumThemeEvent = {}));
themeEventCenter.addListener(EnumThemeEvent.OpenQuickAddModal, ({ detail }) => {
    window.Shopline.loadFeatures([
        {
            name: 'component-quick-add-modal',
            version: '0.1',
        },
    ], (error) => {
        if (error)
            throw error;
        window.Shopline.utils.quickAddModal.open(`/products/${detail.productHandle}`);
    });
});
themeEventCenter.addListener(EnumThemeEvent.ProductViewed, ({ detail }) => {
    const { productId } = detail;
    if (!productId)
        return;
    const cacheKey = 'recently_viewed_products_ids';
    const cacheValue = localStorage.getItem(cacheKey);
    let recentlyViewedProducts = themeUtils.jsonParse(cacheValue || '[]', []);
    if (recentlyViewedProducts.includes(productId)) {
        recentlyViewedProducts = recentlyViewedProducts.filter((id) => id !== productId);
    }
    recentlyViewedProducts.unshift(productId);
    localStorage.setItem(cacheKey, JSON.stringify(recentlyViewedProducts.slice(0, 12)));
});
;
const themeUtils = {
    throttle(fn, wait) {
        let timer = null;
        return (...args) => {
            if (timer) {
                return;
            }
            timer = window.setTimeout(() => {
                fn.apply(this, args);
                timer = null;
            }, wait);
        };
    },
    debounce(fn, wait) {
        let timer = null;
        return (...args) => {
            if (timer) {
                clearTimeout(timer);
            }
            timer = window.setTimeout(() => fn.apply(this, args), wait);
        };
    },
    jsonParse(str, normalValue) {
        try {
            const res = JSON.parse(str);
            return res;
        }
        catch {
            return normalValue;
        }
    },
    lockScroll() {
        document.body.style.overflow = 'hidden';
    },
    unlockScroll() {
        document.body.style.overflow = '';
    },
    changeURLArg(url, params) {
        const uri = new URL(url);
        Object.keys(params).forEach((arg) => {
            const val = params[arg];
            if (val) {
                uri.searchParams.set(arg, val);
            }
            else {
                uri.searchParams.delete(arg);
            }
        });
        return uri.toString();
    },
    removeURLArg(url, params) {
        const uri = new URL(url);
        params.forEach((arg) => {
            uri.searchParams.delete(arg);
        });
        return url;
    },
    isMobileScreen() {
        return window.matchMedia('(max-width: 959px)').matches;
    },
    fetchWithCache: (() => {
        const cacheMap = new Map();
        return (input, init) => {
            const targetUrl = input.toString();
            const fetchAction = fetch(input, init).then((res) => {
                cacheMap.set(targetUrl, res);
                setTimeout(() => cacheMap.delete(targetUrl), 30 * 1000);
                return res.clone();
            });
            const cacheResponse = cacheMap.get(targetUrl);
            return cacheResponse ? Promise.resolve(cacheResponse.clone()) : fetchAction;
        };
    })(),
    createDom(html) {
        const domParser = new DOMParser();
        const doms = domParser.parseFromString(html, 'text/html');
        return doms.body.firstElementChild;
    },
    execDomScript(dom) {
        const scripts = dom.querySelectorAll('script');
        scripts.forEach((script) => {
            const newScript = document.createElement('script');
            Array.from(script.attributes).forEach((attribute) => {
                newScript.setAttribute(attribute.name, attribute.value);
            });
            newScript.innerHTML = script.innerHTML;
            script?.replaceWith(newScript);
        });
    },
    generateUUID() {
        return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16));
    },
    sanitizeInput(input) {
        const element = document.createElement('div');
        element.innerText = input;
        return element.innerHTML;
    },
    getQueryParams() {
        const searchParams = new URLSearchParams(window.location.search);
        const params = Object.fromEntries(Array.from(searchParams.entries()));
        return params;
    },
    addDoubleClickListener(element, handler, options) {
        const { signal, ...restOptions } = options || {};
        const action = themeUtils.throttle(handler, 100);
        element.addEventListener('dblclick', action, { ...restOptions, signal });
        let lastTapTime = 0;
        let lastTapTarget = null;
        const touchEndHandler = (event) => {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastTapTime;
            const { target } = event;
            if (timeDiff < 300 && target === lastTapTarget) {
                event.preventDefault();
                action(event);
                lastTapTime = 0;
                lastTapTarget = null;
            }
            else {
                lastTapTime = currentTime;
                lastTapTarget = target;
            }
        };
        element.addEventListener('touchend', touchEndHandler, {
            passive: false,
            capture: restOptions.capture,
            signal,
        });
        return () => {
            if (!signal) {
                element.removeEventListener('dblclick', handler);
                element.removeEventListener('touchend', touchEndHandler);
            }
        };
    },
    reRenderDomContent(source, destination) {
        const sourceElements = Array.from(source.querySelectorAll('[data-rerender-id]'));
        sourceElements.forEach((sourceElement) => {
            const rerenderId = sourceElement.getAttribute('data-rerender-id');
            if (!rerenderId) {
                return;
            }
            const destinationElement = destination.querySelector(`[data-rerender-id="${rerenderId}"]`);
            if (!destinationElement) {
                return;
            }
            const updateAttrs = sourceElement.getAttribute('data-rerender-attrs')?.split(',');
            const updateProps = sourceElement.getAttribute('data-rerender-props')?.split(',');
            if (updateAttrs?.length) {
                updateAttrs.forEach((attr) => {
                    sourceElement.setAttribute(attr, destinationElement.getAttribute(attr) ?? '');
                });
            }
            if (updateProps?.length) {
                updateProps.forEach((prop) => {
                    sourceElement[prop] = destinationElement[prop];
                });
            }
            if (!updateAttrs?.length && !updateProps?.length) {
                sourceElement.replaceWith(destinationElement);
            }
        });
    },
};
;
function detectingScreen(resizeHandleFn, isImmediate) {
    let isMobileScreen = themeUtils.isMobileScreen();
    let cleanUpResize;
    if (typeof resizeHandleFn !== 'function') {
        const destroy = Function.prototype;
        return { isMobileScreen, destroy };
    }
    const handleWindowResize = (event, isFirstTime = false) => {
        const isMobileScreenInResize = themeUtils.isMobileScreen();
        if (!(isMobileScreen !== isMobileScreenInResize || isFirstTime)) {
            return;
        }
        if (typeof cleanUpResize === 'function') {
            try {
                cleanUpResize({ isMobileScreen, event });
            }
            catch (err) {
                console.error('cleanUpResize call error', err);
            }
        }
        isMobileScreen = isMobileScreenInResize;
        cleanUpResize = resizeHandleFn({ isMobileScreen, event, first: isFirstTime });
    };
    const register = () => {
        window.addEventListener('resize', handleWindowResize);
        return function unregister() {
            window.removeEventListener('resize', handleWindowResize);
        };
    };
    if (isImmediate) {
        handleWindowResize(null, true);
    }
    const destroy = register();
    return { isMobileScreen, destroy };
}
;
window.addEventListener('DOMContentLoaded', () => {
    const setBodyContainerWidth = () => {
        document.body.style.setProperty('--body-container-width', `${document.body.clientWidth}px`);
    };
    new ResizeObserver(themeUtils.debounce(setBodyContainerWidth, 20)).observe(document.body);
});
;
class BaseElement extends HTMLElement {
    isMounted = false;
    #eventListeners = [];
    mounted() { }
    unmounted() { }
    connectedCallback() {
        if (document.body.contains(this)) {
            this.mounted();
            this.isMounted = true;
        }
    }
    disconnectedCallback() {
        this.#removeAllEventListeners();
        this.unmounted();
        this.isMounted = false;
    }
    getDatasetValue(name, type) {
        const originValue = this.dataset[name];
        switch (type) {
            case 'boolean': {
                if (originValue === '') {
                    return true;
                }
                return !!originValue && originValue !== 'false';
            }
            case 'number': {
                if (originValue === '') {
                    return 0;
                }
                const res = parseFloat(originValue);
                return Number.isNaN(res) ? 0 : res;
            }
            case 'string':
            default: {
                return originValue;
            }
        }
    }
    emit(type, detail, config) {
        const eventOptions = {
            bubbles: true,
            cancelable: true,
            ...config,
            detail,
        };
        const event = new CustomEvent(type, eventOptions);
        return this.dispatchEvent(event);
    }
    #bindMethodMap = new WeakMap();
    bind(method) {
        if (this.#bindMethodMap.has(method)) {
            return this.#bindMethodMap.get(method);
        }
        const result = method.bind(this);
        this.#bindMethodMap.set(method, result);
        return result;
    }
    queryOwnSelector(selectors) {
        return this.queryOwnSelectorAll(selectors)[0] || null;
    }
    queryOwnSelectorAll(selectors) {
        const currentTagName = this.tagName.toLowerCase();
        const nodes = Array.from(this.querySelectorAll(selectors));
        return nodes.filter((node) => node.closest(currentTagName) === this);
    }
    addExternalEventListener(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        this.#eventListeners.push({ target, type, listener, options });
    }
    removeExternalEventListener(target, type, listener, options) {
        target.removeEventListener(type, listener, options);
        const index = this.#eventListeners.findIndex((item) => item.target === target && item.type === type && item.listener === listener);
        if (index > -1) {
            this.#eventListeners.splice(index, 1);
        }
    }
    #removeAllEventListeners() {
        this.#eventListeners.forEach(({ target, type, listener, options }) => {
            target.removeEventListener(type, listener, options);
        });
        this.#eventListeners = [];
    }
}
;
class VisibleElement extends BaseElement {
    visible = false;
    #visibleObserver;
    connectedCallback() {
        super.connectedCallback();
        this.#initVisibleObserver();
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.#visibleObserver) {
            this.#visibleObserver.disconnect();
        }
    }
    #initVisibleObserver() {
        this.#visibleObserver = new IntersectionObserver((entryList) => {
            const entry = entryList[0];
            const prevVisible = this.visible;
            const currentVisible = entry.isIntersecting;
            if (prevVisible !== currentVisible) {
                this.emit(currentVisible ? 'custom:visible' : 'custom:hidden', entry, {
                    bubbles: false,
                });
                this.classList[currentVisible ? 'add' : 'remove']('is-visible');
                this.visible = currentVisible;
            }
        }, {
            rootMargin: this.dataset.rootMargin || '100px',
            threshold: (this.dataset.threshold || '0').split(',').map(Number),
        });
        this.#visibleObserver.observe(this);
    }
}
;
class Cart extends BaseElement {
    static #CartChildInstanceList = [];
    static get inCartPage() {
        return document.body.dataset.pageType === 'cart';
    }
    static get cartAddType() {
        return document.body.dataset.cartAddType || '';
    }
    static init() {
        themeEventCenter.addListener(EnumThemeEvent.OpenCart, (event) => {
            const { refresh } = event.detail;
            const addedVariantDetail = themeEventCenter.getCurrentDetail(EnumThemeEvent.VariantAdded);
            const { lineItemKey = '' } = addedVariantDetail || {};
            const options = {
                refresh,
                lineItemKey,
            };
            this.#open(options);
        });
    }
    static registerInstance(instance) {
        this.#CartChildInstanceList.push(instance);
    }
    static #open(options = {}) {
        if (this.cartAddType === 'page' && !this.inCartPage && window.routes.cartUrl) {
            window.location.href = window.routes.cartUrl;
        }
        this.#show(options);
        if (options.refresh) {
            this.update(options);
        }
    }
    static async update(options = {}) {
        const newDocuments = await this.#getSectionsNewDocument();
        await this.#replaceElements(newDocuments, options);
        if (window.Shopline && window.Shopline.AdditionalButton) {
            window.Shopline.AdditionalButton.init();
        }
    }
    static #show(options = {}) {
        if (!this.#CartChildInstanceList.length) {
            window.location.href = window.routes.cartUrl;
        }
        this.#CartChildInstanceList.forEach((element) => element.open(options));
    }
    static async #getSectionsNewDocument() {
        const fetchUrl = new URL(window.routes.cartUrl, window.location.href);
        const renderSectionsName = (() => {
            const result = [];
            Object.entries(this.#CartChildInstanceList.map((item) => item.getRenderConfigs())).forEach(([, value]) => result.push(...value.map((item) => item.section)));
            return result.join(',');
        })();
        fetchUrl.searchParams.set('sections', renderSectionsName);
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            throw new Error('fetch error');
        }
        const renderSections = (await response.json()) || {};
        if (Object.keys(renderSections).length === 0) {
            throw new Error('fetch sections render error');
        }
        return Object.keys(renderSections).reduce((acc, key) => {
            const domParser = new DOMParser();
            acc[key] = domParser.parseFromString(renderSections[key], 'text/html');
            return acc;
        }, {});
    }
    static async #replaceElements(newDocuments, options) {
        this.#CartChildInstanceList.forEach((sectionElement) => {
            sectionElement?.replaceElement(newDocuments, options);
        });
    }
    static replaceHTML(oldElementContainer, newElementContainer, selectors, reloadScript = false) {
        selectors.forEach((selector) => {
            const oldElement = oldElementContainer.querySelector(selector);
            const newElement = newElementContainer.querySelector(selector);
            if (!oldElement) {
                throw new Error(`oldElement not found: ${selector}`);
            }
            if (!newElement) {
                throw new Error(`newElement not found: ${selector}`);
            }
            oldElement.innerHTML = newElement.innerHTML;
            if (reloadScript) {
                themeUtils.execDomScript(oldElement);
            }
        });
    }
    static getSectionSelectors(sectionName, sectionConfig) {
        const targetSectionConfig = sectionConfig.filter((item) => item.section === sectionName);
        return targetSectionConfig.reduce((acc, item) => acc.concat(item.selectors), []);
    }
}
Cart.init();
;
class ShowMore extends BaseElement {
    #toggleButtonElement;
    constructor() {
        super();
        this.#toggleButtonElement = this.querySelector('button[name="toggle-more"]');
        this.#toggleButtonElement?.addEventListener('click', this.#toggleButtonClickHandler.bind(this));
    }
    get isOpen() {
        return this.hasAttribute('open') && this.getAttribute('open') !== 'false';
    }
    set isOpen(flag) {
        if (flag) {
            this.setAttribute('open', 'true');
        }
        else {
            this.removeAttribute('open');
        }
    }
    #toggleButtonClickHandler(event) {
        event.preventDefault();
        this.isOpen = !this.isOpen;
    }
}
customElements.define('theme-show-more', ShowMore);
;
class ThemeBreadcrumbStoragePlugin {
    #key = 'breadcrumb';
    get pageType() {
        return document.body.getAttribute('data-page-type') ?? '';
    }
    apply() {
        window.addEventListener('pagehide', this.#handleBeforeUnload.bind(this));
    }
    #handleBeforeUnload() {
        const { uri } = window.Shopline;
        const cacheBreadcrumb = this.#getCacheBreadcrumb();
        if (cacheBreadcrumb[cacheBreadcrumb.length - 1]?.path === uri.path) {
            return;
        }
        if (cacheBreadcrumb.length > 5) {
            cacheBreadcrumb.splice(0, cacheBreadcrumb.length - 5);
        }
        const pageInfo = {
            pageType: this.pageType,
            path: uri.path,
            params: uri.params,
            originalData: uri,
            pageResource: {},
        };
        if (document.body.hasAttribute('data-page-collection-handle')) {
            pageInfo.pageResource.collection = {
                handle: document.body.getAttribute('data-page-collection-handle') ?? '',
                title: document.body.getAttribute('data-page-collection-title') ?? '',
                url: document.body.getAttribute('data-page-collection-url') ?? '',
            };
        }
        ThemeStorage.setItem(this.#key, JSON.stringify([...cacheBreadcrumb, pageInfo]));
    }
    #getCacheBreadcrumb() {
        const cacheBreadcrumb = ThemeStorage.getItem(this.#key);
        if (!cacheBreadcrumb) {
            return [];
        }
        try {
            const parsedCacheBreadcrumb = JSON.parse(cacheBreadcrumb);
            if (!Array.isArray(parsedCacheBreadcrumb)) {
                return [];
            }
            return parsedCacheBreadcrumb;
        }
        catch {
            return [];
        }
    }
}
class ThemeStorage {
    constructor() {
        [new ThemeBreadcrumbStoragePlugin()].forEach((plugin) => plugin.apply());
    }
    static getItem(key, storage = 'sessionStorage') {
        const storageInstance = this.#getStorageInstance(storage);
        return storageInstance.getItem(key);
    }
    static setItem(key, value, storage = 'sessionStorage') {
        const storageInstance = this.#getStorageInstance(storage);
        storageInstance.setItem(key, value);
    }
    static removeItem(key, storage = 'sessionStorage') {
        const storageInstance = this.#getStorageInstance(storage);
        storageInstance.removeItem(key);
    }
    static #getStorageInstance(storage) {
        if (storage === 'localStorage') {
            return localStorage;
        }
        if (storage === 'sessionStorage') {
            return sessionStorage;
        }
        throw new Error('Invalid storage type');
    }
}
new ThemeStorage();
;
window.Shopline?.i18nInit();
(() => {
    const queryParams = themeUtils.getQueryParams();
    if (queryParams && queryParams.positioned_id) {
        const targetElement = document.getElementById(queryParams.positioned_id);
        if (targetElement) {
            setTimeout(() => {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }, 0);
        }
    }
})();
;
