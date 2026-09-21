defineModule('theme-action-bar-search', () => {
    class ActionBarSearch extends BaseElement {
        static RESULT_NAME = '[data-role="search-bar-result"]';
        static RESULT_LIST_NAME = '[data-role="search-bar-result-list"]';
        static SEARCH_DEFAULT_OPTIONS = {
            field: 'title',
            resourceType: 'product',
            limit: '5',
            availableType: 'show',
            sectionId: 'predictive-search',
        };
        #abortSearchController;
        #searchInputHandler = themeUtils.debounce((event) => {
            const target = event?.target;
            if (!(target instanceof HTMLInputElement)) {
                return;
            }
            const keyword = target.value.trim();
            target.value = keyword;
            if (!keyword.length) {
                return;
            }
            this.search(keyword);
        }, 300);
        #openHandler = () => {
            if (this.isEmpty()) {
                return;
            }
            this.open();
        };
        #closeHandler = (event) => {
            const targets = event.composedPath();
            if (targets.includes(this)) {
                return;
            }
            this.close();
        };
        mounted() {
            document.addEventListener('click', this.#closeHandler);
            this.addEventListener('input', this.#searchInputHandler);
            this.addEventListener('focusin', this.#openHandler);
        }
        unmounted() {
            this.removeEventListener('input', this.#searchInputHandler);
            this.removeEventListener('focusin', this.#openHandler);
            document.removeEventListener('click', this.#closeHandler);
        }
        isEmpty() {
            const el = this.querySelector(ActionBarSearch.RESULT_LIST_NAME);
            return !el?.childElementCount;
        }
        async search(keyword, options = ActionBarSearch.SEARCH_DEFAULT_OPTIONS) {
            const searchUrl = window.routes.predictiveSearchUrl;
            if (typeof searchUrl !== 'string') {
                throw new Error('Invalid search url');
            }
            const resultEl = this.querySelector(ActionBarSearch.RESULT_NAME);
            if (!resultEl) {
                throw new Error(`Failed to find search result element: ${ActionBarSearch.RESULT_NAME}`);
            }
            const listEl = this.querySelector(ActionBarSearch.RESULT_LIST_NAME);
            if (!listEl) {
                throw new Error(`Failed to find search result element: ${ActionBarSearch.RESULT_LIST_NAME}`);
            }
            const finalOptions = { ...ActionBarSearch.SEARCH_DEFAULT_OPTIONS, ...options };
            const uri = new URL(searchUrl, window.location.origin);
            uri.searchParams.set('q', keyword);
            uri.searchParams.set('field', finalOptions.field);
            uri.searchParams.set('resource_type', finalOptions.resourceType);
            uri.searchParams.set('limit', finalOptions.limit);
            uri.searchParams.set('available_type', finalOptions.availableType);
            uri.searchParams.set('section_id', finalOptions.sectionId);
            resultEl.classList.add('shown', 'loading');
            listEl.innerHTML = '';
            if (this.#abortSearchController) {
                this.#abortSearchController.abort();
            }
            const abort = new AbortController();
            this.#abortSearchController = abort;
            const response = await fetch(uri, {
                signal: abort.signal,
            });
            this.#abortSearchController = undefined;
            resultEl.classList.remove('loading');
            if (!response.ok) {
                throw new Error(`Failed to fetch search results: ${response.status} ${response.statusText}`);
            }
            const html = await response.text();
            listEl.innerHTML = html.replace(/__QUERY_KEY__/g, themeUtils.sanitizeInput(keyword));
        }
        toggle(force) {
            const el = this.querySelector(ActionBarSearch.RESULT_NAME);
            if (!el) {
                return;
            }
            el.classList.toggle('shown', force);
        }
        open() {
            this.toggle(true);
        }
        close() {
            this.toggle(false);
        }
    }
    window.customElements.define('theme-action-bar-search', ActionBarSearch);
});
