export class SGCBaseElement extends HTMLElement {
  getDatasetValue(name, type) {
    const originValue = this.dataset[name];
    switch (type) {
      case "boolean": {
        if (originValue === "") {
          return true;
        }
        return !!originValue && originValue !== "false";
      }
      case "number": {
        if (originValue === "") {
          return NaN;
        }
        return parseFloat(originValue);
      }
      case "string":
      default: {
        return originValue;
      }
    }
  }
  /**
   * Emit a custom event
   * @param type The event name
   * @param detail Details to include with the event
   */
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
  /**
   * Binding the context of a method
   * When the original method is unchanged, the returned binding result is also unchanged
   * @param method Methods that require context binding
   * @returns Methods that have been bound to a context
   */
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
}
export class SGCVisibleElement extends SGCBaseElement {
  visible = false;
  #visibleObserver;
  connectedCallback() {
    this.#initVisibleObserver();
  }
  disconnectedCallback() {
    if (this.#visibleObserver) {
      this.#visibleObserver.disconnect();
    }
  }
  /**
   * Init visible observer of custom element
   */
  #initVisibleObserver() {
    this.#visibleObserver = new IntersectionObserver(
      (entryList) => {
        const entry = entryList[0];
        const prevVisible = this.visible;
        const currentVisible = entry.isIntersecting;
        if (prevVisible !== currentVisible) {
          this.emit(
            currentVisible ? "custom:visible" : "custom:hidden",
            entry,
            {
              bubbles: false,
            },
          );
          this.classList[currentVisible ? "add" : "remove"]("is-visible");
          this.visible = currentVisible;
        }
      },
      {
        rootMargin: this.dataset.rootMargin || "100px",
        threshold: (this.dataset.threshold || "0").split(",").map(Number),
      },
    );
    this.#visibleObserver.observe(this);
  }
}
