export const BUTTON_WIDTH = 88;
export const BUTTON_HEIGHT = 31;

const GLOW_DURATION = 5000;

export class Editor {
  constructor({ stage, previewBounds, previewVisual }) {
    this.stage = stage;
    this.previewBounds = previewBounds;
    this.previewVisual = previewVisual;
    this.previewScale = 1;
    this.zIndex = 0;
    this.layerCleanups = new Map();
    this.beforeResetHandlers = new Set();
    this.resetHandlers = new Set();

    this.button = document.createElement("div");
    this.button.classList.add("button");
    this.button.dataset.draggable = "true";
    this.button.dataset.dragMoved = "false";
    this.previewVisual.appendChild(this.button);
  }

  addLayer(element, { type, animationClass } = {}) {
    element.classList.add("editor-layer");
    element.dataset.draggable = "true";
    element.dataset.dragMoved = "false";

    if (type) {
      element.dataset.layerType = type;
    }

    element.style.left = "0px";
    element.style.top = "0px";

    const removeOnDoubleClick = () => {
      if (element.dataset.dragMoved !== "true") {
        this.removeLayer(element);
      }
    };

    element.addEventListener("dblclick", removeOnDoubleClick);
    this.registerLayerCleanup(element, () => {
      element.removeEventListener("dblclick", removeOnDoubleClick);
    });

    if (animationClass) {
      element.classList.add(animationClass);
      const glowTimer = window.setTimeout(() => {
        element.classList.remove(animationClass);
      }, GLOW_DURATION);

      this.registerLayerCleanup(element, () => {
        window.clearTimeout(glowTimer);
      });
    }

    this.button.appendChild(element);
    this.bringToFront(element);
    return element;
  }

  registerLayerCleanup(element, cleanup) {
    if (!this.layerCleanups.has(element)) {
      this.layerCleanups.set(element, new Set());
    }

    this.layerCleanups.get(element).add(cleanup);
  }

  removeLayer(element) {
    const cleanups = this.layerCleanups.get(element);

    if (cleanups) {
      for (const cleanup of cleanups) {
        cleanup();
      }
      this.layerCleanups.delete(element);
    }

    element.remove();
  }

  clearLayers() {
    for (const layer of Array.from(this.button.children)) {
      this.removeLayer(layer);
    }
  }

  bringToFront(element) {
    this.zIndex += 1;
    element.style.zIndex = String(this.zIndex);
  }

  setPreviewScale(scale) {
    this.previewScale = scale;
  }

  getPreviewScale() {
    return this.previewScale;
  }

  onBeforeReset(handler) {
    this.beforeResetHandlers.add(handler);
    return () => this.beforeResetHandlers.delete(handler);
  }

  onReset(handler) {
    this.resetHandlers.add(handler);
    return () => this.resetHandlers.delete(handler);
  }

  reset() {
    for (const handler of this.beforeResetHandlers) {
      handler();
    }

    this.clearLayers();
    this.zIndex = 0;
    this.button.removeAttribute("style");

    for (const handler of this.resetHandlers) {
      handler();
    }
  }
}
