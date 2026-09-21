export const utils = {
  throttle(fn, wait) {
    let timer = null;
    return (...args) => {
      if (timer) {
        return;
      }
      timer = window.setTimeout(() => {
        fn.apply(this, args);
        timer = null;
      }, wait);
    };
  },
  debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = window.setTimeout(() => fn.apply(this, args), wait);
    };
  },
  jsonParse(str, normalValue) {
    try {
      const res = JSON.parse(str);
      return res;
    } catch {
      return normalValue;
    }
  },
  lockScroll() {
    document.body.style.overflow = "hidden";
  },
  unlockScroll() {
    document.body.style.overflow = "";
  },
  changeURLArg(url, params) {
    const uri = new URL(url);
    Object.keys(params).forEach((arg) => {
      const val = params[arg];
      if (val) {
        uri.searchParams.set(arg, val);
      } else {
        uri.searchParams.delete(arg);
      }
    });
    return uri.toString();
  },
  removeURLArg(url, params) {
    const uri = new URL(url);
    params.forEach((arg) => {
      uri.searchParams.delete(arg);
    });
    return url;
  },
  isMobileScreen() {
    return window.matchMedia("(max-width: 959px)").matches;
  },
  /**
   * A fetch wrapper that gives priority to data from the local cache
   * automatically update the local cache after initiating a request
   */
  fetchWithCache: (() => {
    const cacheMap = new Map();
    return (input, init) => {
      const targetUrl = input.toString();
      const fetchAction = fetch(input, init).then((res) => {
        cacheMap.set(targetUrl, res);
        setTimeout(() => cacheMap.delete(targetUrl), 30 * 1000);
        return res.clone();
      });
      const cacheResponse = cacheMap.get(targetUrl);
      return cacheResponse
        ? Promise.resolve(cacheResponse.clone())
        : fetchAction;
    };
  })(),
  createDom(html) {
    const domParser = new DOMParser();
    const doms = domParser.parseFromString(html, "text/html");
    return doms.body.firstElementChild;
  },
  execDomScript(dom) {
    const scripts = dom.querySelectorAll("script");
    scripts.forEach((script) => {
      const newScript = document.createElement("script");
      Array.from(script.attributes).forEach((attribute) => {
        newScript.setAttribute(attribute.name, attribute.value);
      });
      newScript.innerHTML = script.innerHTML;
      script?.replaceWith(newScript);
    });
  },
  generateUUID() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      // eslint-disable-next-line no-bitwise
      (
        +c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
      ).toString(16),
    );
  },
  sanitizeInput(input) {
    const element = document.createElement("div");
    element.innerText = input;
    return element.innerHTML;
  },
};
