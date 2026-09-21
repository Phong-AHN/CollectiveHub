import { SGCVisibleElement } from "sgc-rolling-parallax-banner/@public/element";
import { utils } from "sgc-rolling-parallax-banner/@public/utils";
class SGCRollingParallaxBanner extends SGCVisibleElement {
  isMounted = false;
  contentHeight = 0;
  sectionScrollDistance = 0;
  conversionFactor = 0.8;
  contentWrapper = this.querySelector(
    ".sgc-rolling-parallax-banner-content-wrapper",
  );
  innerContainer = this.querySelector(
    ".sgc-rolling-parallax-banner-content-inner",
  );
  content = this.querySelector(".sgc-rolling-parallax-banner-content");
  hiddenClass = "sgc-rolling-parallax-banner--hidden";
  hasReset = false;
  #resizeObserver;
  #handleScroll = this.#updateParallax.bind(this);
  constructor() {
    super();
    this.addEventListener("custom:visible", this.#init.bind(this), {
      once: true,
    });
    this.addEventListener("custom:visible", () =>
      this.#handleVisibleChange(false),
    );
    this.addEventListener("custom:hidden", () =>
      this.#handleVisibleChange(true),
    );
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
    }
    window.removeEventListener("scroll", this.#handleScroll);
    this.isMounted = false;
  }
  connectedCallback() {
    super.connectedCallback();
    if (this.visible && !this.isMounted) {
      this.#init();
    }
  }
  #init() {
    this.isMounted = true;
    this.#resizeObserver = new ResizeObserver(
      utils.debounce(this.#handleResize.bind(this), 100),
    );
    this.#resizeObserver.observe(this.contentWrapper);
    window.addEventListener("scroll", this.#handleScroll);
  }
  #handleResize() {
    this.#initContentHeight();
    this.#layout();
  }
  #handleVisibleChange(hiddenSection) {
    this.classList.toggle(this.hiddenClass, hiddenSection);
  }
  #initContentHeight() {
    this.contentHeight = this.content.clientHeight;
  }
  #updateParallax() {
    const sectionOffsetTop = this.getBoundingClientRect().top;
    if (sectionOffsetTop > 0) {
      if (!this.hasReset) {
        this.#updateProgress(0);
        this.hasReset = true;
      }
      return;
    }
    this.sectionScrollDistance = Math.abs(sectionOffsetTop);
    this.#layout();
    this.hasReset = false;
  }
  #layout() {
    const scrollProgress =
      this.sectionScrollDistance / this.contentHeight / this.conversionFactor;
    this.#updateProgress(scrollProgress);
  }
  #updateProgress(progress) {
    this.style.setProperty("--scroll-progress", `${Math.min(progress, 1)}`);
    this.style.setProperty(
      "--text-opacity",
      `${Math.min(Math.round(progress * 100 * this.conversionFactor * 10) / 100, 1)}`,
    );
    this.style.setProperty(
      "--image-scale",
      `${1.5 - Math.min(progress, 1) * 0.5}`,
    );
  }
}
customElements.define("sgc-rolling-parallax-banner", SGCRollingParallaxBanner);
