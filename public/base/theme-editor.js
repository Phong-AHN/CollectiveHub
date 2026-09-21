(() => {
    const sectionHandlers = {
        'before-after': {
            onBlockSelect({ blockElement }) {
                blockElement?.scrollIntoView();
            },
        },
        'media-promotion': {
            onBlockSelect({ blockElement }) {
                blockElement?.scrollIntoView();
            },
        },
        slideshow: {
            onBlockSelect({ blockElement }) {
                blockElement?.scrollIntoView();
            },
        },
        'shopping-video': {
            onBlockSelect({ blockElement }) {
                blockElement?.scrollIntoView();
            },
        },
        'image-floating': {
            onBlockSelect({ sectionElement, index }) {
                const imageGroupElement = sectionElement?.querySelector('theme-image-group');
                imageGroupElement?.switchTo(index);
            },
        },
    };
    function getTargetBlock(event) {
        const { blockId } = event.detail;
        const target = event.target;
        const sectionElement = target.closest('[data-shopline-editor-section]');
        const sectionData = sectionElement.dataset.shoplineEditorSection ?? '';
        const allBlockElements = Array.from(sectionElement.querySelectorAll('[data-shopline-editor-block]'));
        const blockElement = allBlockElements.find((element) => element.dataset.shoplineEditorBlock?.includes(blockId));
        let sectionType = '';
        if (sectionData) {
            try {
                const parsedData = JSON.parse(sectionData);
                sectionType = parsedData.type || '';
            }
            catch {
                sectionType = '';
            }
        }
        return {
            blockElement,
            sectionElement,
            sectionType,
        };
    }
    document.addEventListener('shopline:block:select', (event) => {
        const currentEvent = event;
        const { index } = currentEvent.detail;
        const { blockElement, sectionElement, sectionType } = getTargetBlock(currentEvent);
        sectionHandlers[sectionType]?.onBlockSelect?.({
            index,
            blockElement,
            sectionElement,
        });
    });
    document.addEventListener('shopline:block:deselect', (event) => {
        const currentEvent = event;
        const { blockElement, sectionElement, sectionType } = getTargetBlock(currentEvent);
        sectionHandlers[sectionType]?.onBlockDeselect?.({
            blockElement,
            sectionElement,
        });
    });
})();
