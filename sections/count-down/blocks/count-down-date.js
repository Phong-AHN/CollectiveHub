defineModule('theme-count-down-date', () => {
    class ThemeCountDownDate extends BaseElement {
        #interval;
        countDownInit() {
            const { deadline = '' } = this.dataset;
            let date = new Date(Date.parse(deadline)).getTime();
            if (Number.isNaN(date)) {
                date = new Date(deadline.replace(/-/g, '/')).getTime();
                if (Number.isNaN(date)) {
                    this.unmounted();
                    return;
                }
            }
            this.formatDate(date);
            this.classList.remove('loading');
            this.#interval = setInterval(() => {
                this.formatDate(date);
            }, 1000);
        }
        mounted() {
            this.countDownInit();
        }
        formatDate(date) {
            const targetTime = new Date(date).getTime();
            const currentTime = new Date().getTime();
            const differenceVal = (targetTime - currentTime) / 1000;
            if (differenceVal <= 0) {
                this.unmounted();
                return;
            }
            const result = {
                D: parseInt((differenceVal / 86400).toString(), 10),
                H: parseInt(((differenceVal % 86400) / 3600).toString(), 10),
                M: parseInt(((differenceVal % 3600) / 60).toString(), 10),
                S: parseInt((differenceVal % 60).toString(), 10),
            };
            this.renderDate(result);
        }
        renderDate(date) {
            const renderOrder = ['D', 'H', 'M', 'S'];
            const renderString = [];
            renderOrder.forEach((key) => {
                if (date[key] <= 0 && key === 'D') {
                    return;
                }
                renderString.push(`<span>${date[key].toString().padStart(2, '0')}${key}</span>`);
            });
            this.innerHTML = renderString.join(':&nbsp;');
        }
        unmounted() {
            if (this.#interval) {
                clearInterval(this.#interval);
            }
            this.classList.add('hidden');
        }
    }
    window.customElements.define('count-down-date', ThemeCountDownDate);
});
