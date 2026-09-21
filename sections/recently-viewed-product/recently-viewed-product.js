defineModule('theme-recently-viewed-product', () => {
    class ThemeRecentlyViewedProduct extends VisibleElement {
        constructor() {
            super();
            this.dataset.rootMargin = '0px 0px 400px 0px';
            this.addEventListener('custom:visible', this.#render.bind(this), {
                once: true,
            });
        }
        async #render() {
            try {
                const searchUrl = new URL(this.dataset.url, window.location.origin);
                const cacheIds = themeUtils.jsonParse(localStorage.getItem('recently_viewed_products_ids') || '[]', []);
                const pageSize = Number(this.dataset.pageSize);
                const showIds = cacheIds.filter((id) => id !== this.dataset.productId).slice(0, pageSize);
                searchUrl.searchParams.set('q', showIds.join(','));
                const response = await fetch(searchUrl.toString());
                const responseText = await response.text();
                const domParser = new DOMParser();
                const responseHTML = domParser.parseFromString(responseText, 'text/html');
                const recommendations = responseHTML.querySelector('theme-recently-viewed-product');
                if (recommendations) {
                    this.innerHTML = recommendations?.innerHTML;
                    responseHTML?.querySelectorAll(`style[${window.Shopline.styleSelector.local}]`).forEach((style) => {
                        document.body.append(style);
                    });
                    themeUtils.execDomScript(this);
                }
            }
            catch (err) {
                console.error('[theme-recently-viewed-product]: error - ', err);
            }
        }
    }
    customElements.define('theme-recently-viewed-product', ThemeRecentlyViewedProduct);
});
