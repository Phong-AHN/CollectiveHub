class SGCProductComparisonQuickAdd {
  constructor() {
    this.init();
  }
  init() {
    document.addEventListener("click", this.handleClick.bind(this), true);
  }
  handleClick(event) {
    const target = event.target;
    const button = target.closest(".sgc-product-card__button");
    if (!button || !button.dataset.productHandle) return;
    const form = button.closest("form");
    if (!form) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const handle = button.dataset.productHandle;
    this.openQuickAddModal(handle);
    return false;
  }
  openQuickAddModal(handle) {
    window.Shopline.loadFeatures(
      [
        {
          name: "component-quick-add-modal",
          version: "0.1",
        },
      ],
      (error) => {
        if (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to load quick add modal:", error);
          return;
        }
        window.Shopline.utils.quickAddModal.open(`/products/${handle}`);
      },
    );
  }
}
const createQuickAddInstance = () => new SGCProductComparisonQuickAdd();
const quickAddInstance = (() => {
  if (document.readyState === "loading") {
    let instance = null;
    document.addEventListener("DOMContentLoaded", () => {
      instance = createQuickAddInstance();
    });
    return instance;
  }
  return createQuickAddInstance();
})();
export { quickAddInstance };
