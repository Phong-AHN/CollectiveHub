class Parallax extends HTMLElement {
    get layers() {
        return this.querySelectorAll('theme-parallax-layer');
    }
    constructor() {
        super();
        window.addEventListener('scroll', () => this.updateParallax());
        this.updateParallax();
    }
    updateParallax() {
        const { scrollY } = window;
        this.layers.forEach((layer) => {
            const { speed } = layer.dataset;
            if (!speed) {
                throw new Error('theme-parallax-layer element data-speed attribute is required');
            }
            const yPos = scrollY * Number(speed);
            layer.style.transform = `translate3d(0, ${yPos}px, 0)`;
        });
    }
}
customElements.define('theme-parallax', Parallax);
