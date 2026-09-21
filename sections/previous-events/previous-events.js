defineModule('theme-previous-events', () => {
  const waitForSwiper = () => {
    if (window.Swiper) return Promise.resolve(window.Swiper);

    return new Promise((resolve, reject) => {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (window.Swiper) {
          clearInterval(timer);
          resolve(window.Swiper);
          return;
        }
        if (tries >= 50) {
          clearInterval(timer);
          reject(new Error('Swiper failed to load'));
        }
      }, 100);
    });
  };

  class ThemePreviousEvents extends BaseElement {
    swiper;

    get swiperEl() {
      return this.querySelector('[data-role="swiper"]');
    }

    get paginationEl() {
      return this.querySelector('[data-role="pagination"]');
    }

    async mounted() {
      try {
        const Swiper = await waitForSwiper();
        if (!this.swiperEl) return;
        this.#init(Swiper);
      } catch (error) {
        console.error('[theme-previous-events]', error);
      }
    }

    unmounted() {
      this.swiper?.destroy(true, true);
      this.swiper = undefined;
    }

    #init(Swiper) {
      const desktopColumns = Number(this.dataset.desktopColumns) || 3;
      const spaceBetween = Number(this.dataset.spaceBetween) || 0;
      const spaceBetweenMobile = Number(this.dataset.spaceBetweenMobile) || 0;
      const enableLoop = this.dataset.loop === 'true';
      const enableAutoplay = this.dataset.autoplay === 'true';
      const autoplaySpeed = (Number(this.dataset.autoplaySpeed) || 5) * 1000;
      const slideCount = this.swiperEl.querySelectorAll('.swiper-slide').length;

      this.swiper?.destroy(true, true);

      this.swiper = new Swiper(this.swiperEl, {
        slidesPerView: 1.12,
        spaceBetween: spaceBetweenMobile,
        watchOverflow: false,
        loop: enableLoop && slideCount > desktopColumns,
        pagination: this.paginationEl
          ? {
              el: this.paginationEl,
              clickable: true,
              type: 'bullets',
            }
          : undefined,
        autoplay:
          enableAutoplay && slideCount > 1
            ? {
                delay: autoplaySpeed,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
              }
            : false,
        breakpoints: {
          960: {
            slidesPerView: desktopColumns,
            spaceBetween,
          },
        },
      });
    }
  }

  customElements.define('theme-previous-events', ThemePreviousEvents);
});
