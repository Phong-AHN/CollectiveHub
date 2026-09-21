defineModule('theme-header-nav-dropdown', () => {
    class ThemeHeaderNavDropdown extends BaseElement {
        #observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    this.#reposition();
                }
            });
        }, { threshold: 0.01 });
        #reposition() {
            const viewportWidth = window.innerWidth;
            this.classList.remove('left', 'right');
            const originalDisplay = this.style.getPropertyValue('display');
            const originalDisplayPriority = this.style.getPropertyPriority('display');
            const originalVisibility = this.style.getPropertyValue('visibility');
            const originalVisibilityPriority = this.style.getPropertyPriority('visibility');
            this.style.setProperty('display', 'block', 'important');
            this.style.setProperty('visibility', 'hidden', 'important');
            const rect = this.getBoundingClientRect();
            const elementLeft = rect.left;
            const elementRight = rect.right;
            if (originalDisplay) {
                this.style.setProperty('display', originalDisplay, originalDisplayPriority);
            }
            else {
                this.style.removeProperty('display');
            }
            if (originalVisibility) {
                this.style.setProperty('visibility', originalVisibility, originalVisibilityPriority);
            }
            else {
                this.style.removeProperty('visibility');
            }
            if (elementRight >= viewportWidth) {
                this.classList.add('right');
                return;
            }
            if (elementLeft < 0) {
                this.classList.add('left');
            }
        }
        mounted() {
            this.#observer.observe(this);
        }
        unmounted() {
            this.#observer.unobserve(this);
        }
    }
    window.customElements.define('theme-header-nav-dropdown', ThemeHeaderNavDropdown);
});
