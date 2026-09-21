import { SGCVisibleElement } from "sgc-scroll-banner/@public/element";
import { utils } from "sgc-scroll-banner/@public/utils";
import {
  onBlockSelect,
  onBlockDeselect,
} from "sgc-scroll-banner/@public/theme-editor";
const BANNER_CONTENT_ENABLE_SCROLL_CLASS =
  "sgc-scroll-banner__banner-content--enable-scroll";
const BANNER_CONTENT_PAUSE_SCROLL_CLASS =
  "sgc-scroll-banner__banner-content--pause-scroll";
const BANNER_CONTENT_RESET_SCROLL_CLASS =
  "sgc-scroll-banner__banner-content--reset-scroll";
const BREAKPOINT = 959;
class SgcScrollBanner extends SGCVisibleElement {
  #bannerContainer = this.querySelector(".sgc-scroll-banner__banner-inner");
  #bannerContent = this.querySelector(".sgc-scroll-banner__banner-content");
  #resizeObserver;
  #clearBannerContainerPressEffect;
  #clearBannerContainerHoverEffect;
  get enableScroll() {
    return this.getDatasetValue("enableScroll", "boolean");
  }
  get pauseOnHover() {
    return this.getDatasetValue("pauseOnHover", "boolean");
  }
  get isMobileScreen() {
    return window.innerWidth <= BREAKPOINT;
  }
  constructor() {
    super();
    this.addEventListener(
      "custom:visible",
      () => {
        this.#resizeObserver = new ResizeObserver(
          utils.debounce(this.#init.bind(this), 100),
        );
        this.#resizeObserver.observe(this);
      },
      { once: true },
    );
    onBlockSelect(this, ({ blockElement }) => {
      if (
        !blockElement ||
        this === blockElement ||
        !this.contains(blockElement)
      ) {
        return;
      }
      const { offsetLeft, clientWidth } = blockElement;
      const resetPos = Math.min(
        0,
        this.#bannerContainer.clientWidth - (offsetLeft + clientWidth),
      );
      this.#bannerContainer.style.setProperty(
        "--scroll-reset-pos",
        `${resetPos}px`,
      );
      this.#applyAllContentClass((item) => {
        item.classList.add(BANNER_CONTENT_RESET_SCROLL_CLASS);
      });
    });
    onBlockDeselect(this, () => {
      this.#applyAllContentClass((item) => {
        item.classList.remove(BANNER_CONTENT_RESET_SCROLL_CLASS);
      });
    });
  }
  #init() {
    this.#clearBannerContainerEffect();
    const bannerContentWidth = this.#bannerContent.offsetWidth;
    if (bannerContentWidth === 0) {
      return;
    }
    if (this.enableScroll && this.pauseOnHover) {
      this.#applyBannerContainerEffect();
    }
    const containerWidth = this.#bannerContainer.offsetWidth;
    const cloneCount =
      Math.ceil((containerWidth + bannerContentWidth) / bannerContentWidth) - 1;
    const currentContentCount = this.#bannerContainer.children.length;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < cloneCount - currentContentCount + 1; i++) {
      const cloneNode = this.#bannerContent.cloneNode(true);
      fragment.appendChild(cloneNode);
    }
    this.#bannerContainer.appendChild(fragment);
    if (this.enableScroll) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.#applyAllContentClass((item) => {
            item.classList.add(BANNER_CONTENT_ENABLE_SCROLL_CLASS);
          });
        });
      });
    }
  }
  #clearBannerContainerEffect() {
    if (this.#clearBannerContainerPressEffect) {
      this.#clearBannerContainerPressEffect();
    }
    if (this.#clearBannerContainerHoverEffect) {
      this.#clearBannerContainerHoverEffect();
    }
    this.#applyAllContentClass((item) => {
      item.classList.remove(BANNER_CONTENT_ENABLE_SCROLL_CLASS);
      item.classList.remove(BANNER_CONTENT_PAUSE_SCROLL_CLASS);
    });
  }
  #applyBannerContainerEffect() {
    if (this.isMobileScreen) {
      this.#applyBannerContainerPressEffect();
    } else {
      this.#applyBannerContainerHoverEffect();
    }
  }
  #applyAllContentClass(callback) {
    Array.from(this.#bannerContainer.children).forEach((item) =>
      callback(item),
    );
  }
  #applyBannerContainerHoverEffect() {
    const handleMouseEnter = () => {
      this.#applyAllContentClass((item) => {
        item.classList.add(BANNER_CONTENT_PAUSE_SCROLL_CLASS);
      });
    };
    const handleMouseLeave = () => {
      this.#applyAllContentClass((item) => {
        item.classList.remove(BANNER_CONTENT_PAUSE_SCROLL_CLASS);
      });
    };
    this.#bannerContainer.addEventListener("mouseenter", handleMouseEnter);
    this.#bannerContainer.addEventListener("mouseleave", handleMouseLeave);
    this.#clearBannerContainerHoverEffect = () => {
      this.#bannerContainer.removeEventListener("mouseenter", handleMouseEnter);
      this.#bannerContainer.removeEventListener("mouseleave", handleMouseLeave);
    };
  }
  #applyBannerContainerPressEffect() {
    const handleClick = () => {
      this.#applyAllContentClass((item) => {
        item.classList.toggle(BANNER_CONTENT_PAUSE_SCROLL_CLASS);
      });
    };
    this.#bannerContainer.addEventListener("click", handleClick);
    this.#clearBannerContainerPressEffect = () => {
      this.#bannerContainer.removeEventListener("click", handleClick);
    };
  }
}
customElements.define("sgc-scroll-banner", SgcScrollBanner);
