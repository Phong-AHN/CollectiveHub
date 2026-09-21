import { SGCVisibleElement } from "sgc-scroll-gallery/@public/element";
import { utils } from "sgc-scroll-gallery/@public/utils";
import {
  onBlockSelect,
  onBlockDeselect,
} from "sgc-scroll-gallery/@public/theme-editor";
const APPLY_CLICK_PAUSE_CLASS =
  "sgc-scroll-gallery__gallery-list-inner-scroll--press-pause";
const APPLY_RESET_CLASS =
  "sgc-scroll-gallery__gallery-list-inner-scroll--reset";
const APPLY_PROGRESS_DEFAULT_PADDING_CLASS =
  "sgc-scroll-gallery__gallery-list-progress--default-padding";
class SGCScrollGalleryList extends SGCVisibleElement {
  currentIndex = 0;
  galleryList = this.querySelector(".sgc-scroll-gallery__gallery-list");
  galleryListInner = this.querySelector(
    ".sgc-scroll-gallery__gallery-list-inner",
  );
  galleryListArrows = Array.from(
    this.querySelectorAll(".sgc-scroll-gallery__gallery-list-arrows-btn"),
  );
  galleryListProgress = this.querySelector(
    ".sgc-scroll-gallery__gallery-list-progress",
  );
  galleryListInnerScroll = this.querySelector(
    ".sgc-scroll-gallery__gallery-list-inner-scroll",
  );
  galleryListInnerContents = Array.from(
    this.querySelectorAll(".sgc-scroll-gallery__gallery-list-inner-content"),
  );
  galleryItems = Array.from(
    this.querySelectorAll(".sgc-scroll-gallery__gallery-item"),
  );
  get isMobile() {
    return window.innerWidth <= 959;
  }
  get enableScroll() {
    return this.galleryListInner.getAttribute("data-enable-scroll") === "true";
  }
  get indicatorStyle() {
    return this.galleryListInner.getAttribute("data-indicator-style");
  }
  get mobileShowStyle() {
    return this.galleryListInner.getAttribute("data-mobile-show-style");
  }
  get enableIndicator() {
    return (
      this.isMobile && !this.enableScroll && this.mobileShowStyle === "carousel"
    );
  }
  get enableProgress() {
    return this.indicatorStyle === "progress";
  }
  get enableArrows() {
    return this.indicatorStyle === "arrows";
  }
  get enablePressPause() {
    return (
      this.isMobile &&
      this.enableScroll &&
      this.galleryListInner.getAttribute("data-hover-press-pause") === "true"
    );
  }
  get blockSize() {
    return (
      Number(this.galleryListInner.style.getPropertyValue("--item-count")) || 0
    );
  }
  get mobileColumns() {
    return (
      Number(
        this.galleryListInner.style.getPropertyValue("--mobile-columns"),
      ) || 1
    );
  }
  get isFullScreen() {
    return this.galleryListInnerScroll.offsetWidth === this.offsetWidth;
  }
  #resizeObserver;
  #clearEffectPress;
  #clearEffectProgress;
  #clearEffectArrows;
  constructor() {
    super();
    this.addEventListener("custom:visible", () => {
      this.#resizeObserver = new ResizeObserver(
        utils.debounce(this.bind(this.#init), 100),
      );
      this.#resizeObserver.observe(this);
    });
    onBlockSelect(this, ({ blockElement }) => {
      if (!blockElement || blockElement === this.galleryList) {
        return;
      }
      this.#scrollIntoBlock(blockElement);
      this.galleryListInnerScroll.classList.add(APPLY_CLICK_PAUSE_CLASS);
      this.galleryListInnerScroll.classList.add(APPLY_RESET_CLASS);
    });
    onBlockDeselect(this, () => {
      this.galleryListInnerScroll.classList.remove(APPLY_CLICK_PAUSE_CLASS);
      this.galleryListInnerScroll.classList.remove(APPLY_RESET_CLASS);
    });
  }
  #init() {
    this.#clearEffect();
    if (this.enablePressPause) {
      this.#applyPressEffect();
    }
    if (this.enableIndicator) {
      if (this.enableArrows) {
        this.#applyArrowsEffect();
      }
      if (this.enableProgress) {
        this.#applyProgressEffect();
      }
    }
  }
  #clearEffect() {
    this.#clearEffectPress?.();
    this.#clearEffectProgress?.();
    this.#clearEffectArrows?.();
  }
  #applyPressEffect() {
    const clickHandler = () => {
      this.galleryListInnerScroll.classList.toggle(APPLY_CLICK_PAUSE_CLASS);
    };
    this.#clearEffectPress = () => {
      this.removeEventListener("click", clickHandler);
      this.galleryListInnerScroll.classList.remove(APPLY_CLICK_PAUSE_CLASS);
    };
    this.addEventListener("click", clickHandler);
  }
  #applyArrowsEffect() {
    const clickHandler = (e) => {
      e.stopPropagation();
      const arrowBtn = e.currentTarget;
      const direction = Number(arrowBtn.getAttribute("data-direction"));
      const step = Number(arrowBtn.getAttribute("data-step"));
      if (Number.isNaN(direction) || Number.isNaN(step)) {
        return;
      }
      const targetIndex = this.currentIndex + direction * step;
      this.#updateArrowsIndex(targetIndex);
      this.#updateArrowsStatus();
    };
    this.#updateArrowsStatus();
    this.#clearEffectArrows = () => {
      this.galleryListArrows.forEach((btn) =>
        btn.removeEventListener("click", clickHandler, { capture: true }),
      );
    };
    this.galleryListArrows.forEach((btn) =>
      btn.addEventListener("click", clickHandler, { capture: true }),
    );
  }
  #applyProgressEffect() {
    const innerContent = this.galleryListInnerContents[0];
    if (!innerContent) {
      return;
    }
    const scrollWidth = innerContent.scrollWidth - innerContent.offsetWidth;
    const blockWidth = scrollWidth / this.blockSize;
    const totalScrollWidth = scrollWidth + blockWidth;
    const updateProgress = () => {
      const progressWidth =
        ((innerContent.scrollLeft + blockWidth) / totalScrollWidth) * 100;
      this.galleryListProgress.style.setProperty(
        "--progress-width",
        `${progressWidth}%`,
      );
    };
    updateProgress();
    this.galleryListProgress.classList.toggle(
      APPLY_PROGRESS_DEFAULT_PADDING_CLASS,
      this.isFullScreen,
    );
    const scrollHandler = utils.debounce(this.bind(updateProgress), 100);
    innerContent.addEventListener("scroll", scrollHandler);
    this.#clearEffectProgress = () => {
      innerContent.removeEventListener("scroll", scrollHandler);
    };
  }
  #updateArrowsStatus() {
    const innerContent = this.galleryListInnerContents[0];
    if (!innerContent || innerContent.children.length === 0) {
      return;
    }
    const slideLength = innerContent.children.length;
    const screenCount = Math.ceil(slideLength / this.mobileColumns);
    this.galleryListArrows.forEach((btn) => {
      const direction = Number(btn.getAttribute("data-direction"));
      if (Number.isNaN(direction)) {
        return;
      }
      const btnDisabled =
        direction > 0
          ? Math.floor(this.currentIndex / this.mobileColumns) ===
            screenCount - 1
          : this.currentIndex === 0;
      btn.setAttribute("data-disabled", String(btnDisabled));
    });
  }
  #updateArrowsIndex(targetIndex) {
    if (targetIndex === this.currentIndex) {
      return;
    }
    const innerContent = this.galleryListInnerContents[0];
    if (!innerContent || innerContent.children.length === 0) {
      return;
    }
    const targetSlide = innerContent.children[targetIndex];
    if (!targetSlide) {
      return;
    }
    const slideLength = innerContent.children.length;
    let { offsetLeft } = targetSlide;
    if (targetIndex > this.currentIndex) {
      // ensure the slide is full screen
      const fullScreenSlideCount = Math.max(
        this.mobileColumns - (slideLength - 1 - targetIndex),
        1,
      );
      const fullScreenSlideDiffCount = fullScreenSlideCount - 1;
      const judgedSlide =
        innerContent.children[targetIndex - fullScreenSlideDiffCount];
      offsetLeft = judgedSlide.offsetLeft;
    }
    this.currentIndex = targetIndex;
    innerContent.style.transform = `translateX(-${offsetLeft}px)`;
  }
  #scrollIntoBlock(targetBlock) {
    const innerContent = this.galleryListInnerContents[0];
    if (!innerContent || innerContent.children.length === 0) {
      return;
    }
    const innerContentChildren = Array.from(innerContent.children);
    const targetSlide = innerContentChildren.find((item) =>
      item.contains(targetBlock),
    );
    if (!targetSlide) {
      return;
    }
    if (this.enableScroll) {
      const { offsetLeft, clientWidth } = targetSlide;
      const resetPosition = Math.min(
        0,
        this.galleryListInnerScroll.clientWidth - (offsetLeft + clientWidth),
      );
      this.galleryListInnerScroll.classList.add(APPLY_RESET_CLASS);
      this.galleryListInnerScroll.style.setProperty(
        "--scroll-reset-position",
        `${resetPosition}px`,
      );
      return;
    }
    if (this.enableIndicator) {
      if (!targetSlide) {
        return;
      }
      if (this.enableArrows) {
        const targetIndex = innerContentChildren.indexOf(targetSlide);
        if (targetIndex < 0) {
          return;
        }
        this.#updateArrowsIndex(targetIndex);
        this.#updateArrowsStatus();
      }
      if (this.enableProgress) {
        innerContent.scrollTo({
          left: targetSlide.offsetLeft,
          behavior: "smooth",
        });
      }
    }
  }
}
customElements.define("sgc-scroll-gallery-list", SGCScrollGalleryList);
