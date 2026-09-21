function getTargetBlock(event) {
  const { blockId } = event.detail;
  const target = event.target;
  const sectionElement = target.closest("[data-shopline-editor-section]");
  const sectionData = sectionElement.dataset.shoplineEditorSection ?? "";
  const allBlockElements = Array.from(
    sectionElement.querySelectorAll("[data-shopline-editor-block]"),
  );
  const blockElement = allBlockElements.find((element) =>
    element.dataset.shoplineEditorBlock?.includes(blockId),
  );
  let sectionType = "";
  if (sectionData) {
    try {
      const parsedData = JSON.parse(sectionData);
      sectionType = parsedData.type || "";
    } catch {
      sectionType = "";
    }
  }
  return {
    blockElement,
    sectionElement,
    sectionType,
  };
}
export function onBlockSelect(target, handler) {
  document.addEventListener("shopline:block:select", (event) => {
    const currentEvent = event;
    const { index } = currentEvent.detail;
    const { blockElement, sectionElement } = getTargetBlock(currentEvent);
    if (sectionElement.contains(target)) {
      handler({
        index,
        blockElement,
        sectionElement,
      });
    }
  });
}
export function onBlockDeselect(target, handler) {
  document.addEventListener("shopline:block:deselect", (event) => {
    const currentEvent = event;
    const { blockElement, sectionElement } = getTargetBlock(currentEvent);
    if (sectionElement.contains(target)) {
      handler({
        blockElement,
        sectionElement,
      });
    }
  });
}
