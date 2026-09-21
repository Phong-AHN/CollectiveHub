import { SGCVisibleElement } from "sgc-scroll-gallery/@public/element";
class SGCVideoMedia extends SGCVisibleElement {
  // @internal 播放本地视频
  static playVideoMedia(element) {
    element.play();
  }
  // @internal 播放 Youtube 视频
  static playYoutubeMedia(element) {
    element.contentWindow?.postMessage(
      JSON.stringify({
        event: "command",
        func: "playVideo",
        args: "",
      }),
      "*",
    );
  }
  // @internal 播放 Vimeo 视频
  static playVimeoMedia(element) {
    element.contentWindow?.postMessage(
      JSON.stringify({
        method: "play",
      }),
      "*",
    );
  }
  // @internal 暂停本地视频
  static pauseVideoMedia(element) {
    element.pause();
  }
  // @internal 暂停 Youtube 视频
  static pauseYoutubeMedia(element) {
    const message = JSON.stringify({
      func: "pauseVideo",
      args: "",
      event: "command",
    });
    element.contentWindow?.postMessage(message, "*");
  }
  // @internal 暂停 Vimeo 视频
  static pauseVimeoMedia(element) {
    const message = JSON.stringify({
      method: "pause",
    });
    element.contentWindow?.postMessage(message, "*");
  }
  // @internal 暂停所有视频
  static pauseAll() {
    document.querySelectorAll("video").forEach((videoElement) => {
      SGCVideoMedia.pauseVideoMedia(videoElement);
    });
    document
      .querySelectorAll("iframe.sgc-video-media-youtube")
      .forEach((iframeElement) => {
        SGCVideoMedia.pauseYoutubeMedia(iframeElement);
      });
    document
      .querySelectorAll("iframe.sgc-video-media-vimeo")
      .forEach((iframeElement) => {
        SGCVideoMedia.pauseVimeoMedia(iframeElement);
      });
  }
  // @internal 播放按钮
  #playButton = null;
  // @internal 视频元素
  #mediaElement = null;
  // @internal 是否已加载
  get loaded() {
    return this.getDatasetValue("loaded", "boolean");
  }
  set loaded(force) {
    if (force) {
      this.dataset.loaded = "true";
    } else {
      this.removeAttribute("data-loaded");
    }
  }
  constructor() {
    super();
    this.#playButton = this.querySelector(".sgc-video-media__play-button");
    this.#mediaElement = this.querySelector(".sgc-video-media__media");
    this.#playButton?.addEventListener("click", this.play.bind(this));
    this.#autoPlayHandler();
  }
  // @internal 自动播放
  #autoPlayHandler() {
    const isAutoplay = this.getDatasetValue("autoplay", "boolean");
    if (!isAutoplay) {
      return;
    }
    this.addEventListener("custom:visible", this.play.bind(this), {
      once: true,
    });
  }
  // @internal 加载媒体
  load() {
    if (this.loaded) {
      return;
    }
    const templateElement = this.querySelector("template");
    if (!templateElement) {
      return;
    }
    this.querySelector(".sgc-video-media__media")?.appendChild(
      templateElement.content,
    );
    this.loaded = true;
  }
  // @internal 播放媒体
  play() {
    if (this.#playButton) {
      this.#playButton.style.display = "none";
    }
    if (this.#mediaElement) {
      this.#mediaElement.classList.add("active");
    }
    if (!this.loaded) {
      this.load();
    }
    const videoElement = this.querySelector("video, iframe");
    // if (videoElement) {
    //   videoElement.focus();
    // }
    if (videoElement instanceof HTMLVideoElement) {
      SGCVideoMedia.playVideoMedia(videoElement);
      return;
    }
    if (videoElement instanceof HTMLIFrameElement) {
      if (videoElement.classList.contains("sgc-video-media-youtube")) {
        SGCVideoMedia.playYoutubeMedia(videoElement);
      } else if (videoElement.classList.contains("sgc-video-media-vimeo")) {
        SGCVideoMedia.playVimeoMedia(videoElement);
      }
    }
  }
  // @internal 暂停媒体
  pause() {
    const videoElement = this.querySelector("video, iframe");
    if (videoElement instanceof HTMLVideoElement) {
      SGCVideoMedia.pauseVideoMedia(videoElement);
      return;
    }
    if (videoElement instanceof HTMLIFrameElement) {
      if (videoElement.classList.contains("sgc-video-media-youtube")) {
        SGCVideoMedia.pauseYoutubeMedia(videoElement);
      } else if (videoElement.classList.contains("sgc-video-media-vimeo")) {
        SGCVideoMedia.pauseVimeoMedia(videoElement);
      }
    }
  }
}
customElements.define("sgc-video-media", SGCVideoMedia);
