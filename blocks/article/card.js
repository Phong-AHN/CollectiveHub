defineModule('theme-article-card', () => {
    class ArticleCard extends HTMLElement {
        #viewMoreButtonElement = this.querySelector('.block-article-card__view-more-button');
        #openInNewTab = this.#viewMoreButtonElement?.getAttribute('data-open-in-new-tab') === 'true';
        constructor() {
            super();
            if (this.#openInNewTab) {
                this.querySelector('a.block-article-card')?.setAttribute('target', '_blank');
            }
        }
    }
    customElements.define('theme-article-card', ArticleCard);
});
