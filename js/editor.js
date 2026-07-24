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
    this.layerSequence = 0;
    this.layerCleanups = new Map();
    this.layersChangedHandlers = new Set();
    this.selectionChangedHandlers = new Set();
    this.selectedLayer = null;
    this.beforeResetHandlers = new Set();
    this.resetHandlers = new Set();

    this.button = document.createElement("div");
    this.button.classList.add("button");
    this.button.dataset.draggable = "true";
    this.button.dataset.dragMoved = "false";

    this.effectOverlay = document.createElement("div");
    this.effectOverlay.classList.add("button-effect-overlay");
    this.effectOverlay.setAttribute("aria-hidden", "true");
    this.button.appendChild(this.effectOverlay);

    this.borderLayer = document.createElement("div");
    this.borderLayer.classList.add("button-border-layer");
    this.borderLayer.dataset.layerId = "border-layer";
    this.borderLayer.dataset.layerType = "border";
    this.borderLayer.setAttribute("aria-hidden", "true");
    this.button.appendChild(this.borderLayer);
    this.borderLayerEnabled = false;
    this.previewVisual.appendChild(this.button);
  }

  addLayer(element, { type, animationClass } = {}) {
    element.classList.add("editor-layer");
    element.dataset.draggable = "true";
    element.dataset.dragMoved = "false";

    if (type) {
      element.dataset.layerType = type;
    }

    this.layerSequence += 1;
    element.dataset.layerId = `layer-${this.layerSequence}`;
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
    this.normalizeLayerOrder();
    this.selectLayer(element);
    this.notifyLayersChanged();
    return element;
  }

  registerLayerCleanup(element, cleanup) {
    if (!this.layerCleanups.has(element)) {
      this.layerCleanups.set(element, new Set());
    }

    this.layerCleanups.get(element).add(cleanup);
  }

  removeLayer(element) {
    if (!this.isLayer(element) || this.isBorderLayer(element)) {
      return;
    }

    const layers = this.getLayers();
    const removedIndex = layers.indexOf(element);
    const wasSelected = this.selectedLayer === element;
    this.runLayerCleanups(element);
    element.remove();
    this.normalizeLayerOrder();

    if (wasSelected) {
      const remaining = this.getLayers();
      this.selectedLayer =
        remaining[Math.min(removedIndex, remaining.length - 1)] || null;
      this.notifySelectionChanged();
    }

    this.notifyLayersChanged();
  }

  clearLayers() {
    const hadSelection = Boolean(this.selectedLayer);

    for (const layer of this.getLayers()) {
      if (this.isBorderLayer(layer)) {
        continue;
      }

      this.runLayerCleanups(layer);
      layer.remove();
    }

    this.selectedLayer = null;
    this.zIndex = 0;
    this.setBorderLayerEnabled(false);
    this.notifyLayersChanged();

    if (hadSelection) {
      this.notifySelectionChanged();
    }
  }

  bringToFront(element) {
    const layers = this.getLayers();
    const index = layers.indexOf(element);

    if (index < 0 || index === layers.length - 1) {
      return;
    }

    layers.splice(index, 1);
    layers.push(element);
    this.setLayerOrder(layers);
  }

  getLayers() {
    return Array.from(this.button.children).filter(element => (
      element.classList.contains("editor-layer")
    ));
  }

  getSelectedLayer() {
    return this.selectedLayer;
  }

  isBorderLayer(element) {
    return element === this.borderLayer;
  }

  isBorderLayerEnabled() {
    return this.borderLayerEnabled;
  }

  setBorderLayerEnabled(enabled) {
    const nextEnabled = Boolean(enabled);

    if (this.borderLayerEnabled === nextEnabled) {
      return;
    }

    this.borderLayerEnabled = nextEnabled;

    if (nextEnabled) {
      this.borderLayer.classList.add("editor-layer");
      this.effectOverlay.after(this.borderLayer);
    } else {
      if (this.selectedLayer === this.borderLayer) {
        this.selectedLayer = null;
        this.notifySelectionChanged();
      }

      this.borderLayer.classList.remove("editor-layer");
      this.borderLayer.hidden = false;
      this.borderLayer.style.zIndex = "0";
      this.effectOverlay.after(this.borderLayer);
    }

    this.normalizeLayerOrder();
    this.notifyLayersChanged();
  }

  selectLayer(element) {
    const nextLayer = this.isLayer(element) ? element : null;

    if (this.selectedLayer === nextLayer) {
      return;
    }

    this.selectedLayer = nextLayer;
    this.notifySelectionChanged();
  }

  setLayerVisibility(element, visible) {
    if (!this.isLayer(element)) {
      return;
    }

    element.hidden = !visible;
    this.notifyLayersChanged();
  }

  moveLayer(element, direction) {
    const layers = this.getLayers();
    const index = layers.indexOf(element);
    const nextIndex = Math.max(
      0,
      Math.min(layers.length - 1, index + direction)
    );

    if (index < 0 || nextIndex === index) {
      return;
    }

    layers.splice(index, 1);
    layers.splice(nextIndex, 0, element);
    this.setLayerOrder(layers);
  }

  setLayerOrder(layers) {
    const currentLayers = this.getLayers();

    if (
      layers.length !== currentLayers.length ||
      new Set(layers).size !== currentLayers.length ||
      layers.some(layer => !currentLayers.includes(layer))
    ) {
      return;
    }

    for (const layer of layers) {
      this.button.appendChild(layer);
    }

    this.normalizeLayerOrder();
    this.notifyLayersChanged();
  }

  normalizeLayerOrder() {
    const layers = this.getLayers();

    layers.forEach((layer, index) => {
      layer.style.zIndex = String(index + 1);
    });
    this.zIndex = layers.length;
  }

  isLayer(element) {
    return Boolean(
      element &&
      element.parentElement === this.button &&
      element.classList.contains("editor-layer")
    );
  }

  runLayerCleanups(element) {
    const cleanups = this.layerCleanups.get(element);

    if (!cleanups) {
      return;
    }

    for (const cleanup of cleanups) {
      cleanup();
    }
    this.layerCleanups.delete(element);
  }

  onLayersChanged(handler) {
    this.layersChangedHandlers.add(handler);
    return () => this.layersChangedHandlers.delete(handler);
  }

  onSelectionChanged(handler) {
    this.selectionChangedHandlers.add(handler);
    return () => this.selectionChangedHandlers.delete(handler);
  }

  notifyLayersChanged() {
    for (const handler of this.layersChangedHandlers) {
      handler(this.getLayers());
    }
  }

  notifySelectionChanged() {
    for (const handler of this.selectionChangedHandlers) {
      handler(this.selectedLayer);
    }
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
    this.layerSequence = 0;
    this.button.removeAttribute("style");

    for (const handler of this.resetHandlers) {
      handler();
    }
  }
}
