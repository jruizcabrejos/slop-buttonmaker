import { readSequenceStep } from "./sequence.js";

const LABEL_LIMIT = 24;

export class LayersController {
  constructor({ editor }) {
    this.editor = editor;
    this.list = document.getElementById("layer_list");
    this.emptyState = document.getElementById("layers_empty");
    this.borderToggle = document.getElementById("border_layer_enabled");
    this.draggedLayerId = null;
    this.dropTarget = null;

    this.handleClick = this.handleClick.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleDragStart = this.handleDragStart.bind(this);
    this.handleDragOver = this.handleDragOver.bind(this);
    this.handleDrop = this.handleDrop.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);
    this.toggleBorderLayer = this.toggleBorderLayer.bind(this);

    this.list.addEventListener("click", this.handleClick);
    this.list.addEventListener("change", this.handleChange);
    this.list.addEventListener("dragstart", this.handleDragStart);
    this.list.addEventListener("dragover", this.handleDragOver);
    this.list.addEventListener("drop", this.handleDrop);
    this.list.addEventListener("dragend", this.handleDragEnd);
    this.borderToggle.addEventListener("change", this.toggleBorderLayer);

    this.editor.onLayersChanged(() => this.render());
    this.editor.onSelectionChanged(() => this.updateSelection());
    this.editor.onReset(() => {
      this.borderToggle.checked = false;
    });
    this.render();
  }

  render() {
    const layers = this.editor.getLayers().slice().reverse();
    const fragment = document.createDocumentFragment();

    this.borderToggle.checked = this.editor.isBorderLayerEnabled();

    layers.forEach((layer, index) => {
      fragment.appendChild(this.createRow(layer, index, layers.length));
    });

    this.list.replaceChildren(fragment);
    this.emptyState.hidden = layers.length > 0;
    this.updateSelection();
  }

  createRow(layer, index, layerCount) {
    const row = document.createElement("li");
    const visibility = document.createElement("input");
    const label = document.createElement("button");
    const raise = this.createOrderButton(
      "raise",
      "Move layer up",
      "&#9650;"
    );
    const lower = this.createOrderButton(
      "lower",
      "Move layer down",
      "&#9660;"
    );
    const remove = this.createOrderButton(
      "remove",
      "Delete layer",
      "&#128465;"
    );

    row.className = "layer-row";
    row.dataset.layerId = layer.dataset.layerId;
    row.draggable = true;

    visibility.type = "checkbox";
    visibility.checked = !layer.hidden;
    visibility.dataset.layerVisibility = "true";
    visibility.draggable = false;
    visibility.title = "Show or hide layer";
    visibility.setAttribute(
      "aria-label",
      `${visibility.checked ? "Hide" : "Show"} ${this.getLabel(layer)}`
    );

    label.type = "button";
    label.className = "layer-select";
    label.dataset.layerAction = "select";
    label.draggable = false;
    label.textContent = this.getLabel(layer);

    raise.disabled = index === 0;
    lower.disabled = index === layerCount - 1;
    remove.classList.add("layer-delete");
    remove.disabled = this.editor.isBorderLayer(layer);
    if (remove.disabled) {
      remove.title = "The border cannot be deleted";
      remove.setAttribute(
        "aria-label",
        "The border cannot be deleted"
      );
    }

    row.append(visibility, label, raise, lower, remove);
    return row;
  }

  createOrderButton(action, title, symbol) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layer-order";
    button.dataset.layerAction = action;
    button.draggable = false;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = symbol;
    return button;
  }

  handleClick(event) {
    const button = event.target.closest("button[data-layer-action]");
    const row = event.target.closest(".layer-row");

    if (!button || !row) {
      return;
    }

    const layer = this.findLayer(row.dataset.layerId);

    if (!layer) {
      return;
    }

    switch (button.dataset.layerAction) {
      case "raise":
        this.editor.moveLayer(layer, 1);
        break;
      case "lower":
        this.editor.moveLayer(layer, -1);
        break;
      case "select":
        this.editor.selectLayer(layer);
        break;
      case "remove":
        this.editor.removeLayer(layer);
        break;
      default:
        break;
    }
  }

  handleChange(event) {
    const visibility = event.target.closest(
      "input[data-layer-visibility]"
    );
    const row = event.target.closest(".layer-row");

    if (!visibility || !row) {
      return;
    }

    const layer = this.findLayer(row.dataset.layerId);

    if (layer) {
      this.editor.setLayerVisibility(layer, visibility.checked);
    }
  }

  handleDragStart(event) {
    const row = event.target.closest(".layer-row");

    if (!row || event.target.closest("button, input")) {
      event.preventDefault();
      return;
    }

    this.draggedLayerId = row.dataset.layerId;
    row.classList.add("is-reordering");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", this.draggedLayerId);
    }
  }

  handleDragOver(event) {
    const row = event.target.closest(".layer-row");

    if (!row || row.dataset.layerId === this.draggedLayerId) {
      return;
    }

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    this.clearDropTarget();
    this.dropTarget = row;

    const bounds = row.getBoundingClientRect();
    const position =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    row.dataset.dropPosition = position;
    row.classList.add(`drop-${position}`);
  }

  handleDrop(event) {
    const targetRow = event.target.closest(".layer-row");
    const draggedLayer = this.findLayer(this.draggedLayerId);

    if (
      !targetRow ||
      !draggedLayer ||
      targetRow.dataset.layerId === this.draggedLayerId
    ) {
      this.clearDragState();
      return;
    }

    event.preventDefault();
    const targetLayer = this.findLayer(targetRow.dataset.layerId);

    if (!targetLayer) {
      this.clearDragState();
      return;
    }

    const topFirstLayers = this.editor.getLayers().slice().reverse();
    const sourceIndex = topFirstLayers.indexOf(draggedLayer);

    topFirstLayers.splice(sourceIndex, 1);
    let targetIndex = topFirstLayers.indexOf(targetLayer);

    if (targetRow.dataset.dropPosition === "after") {
      targetIndex += 1;
    }

    topFirstLayers.splice(targetIndex, 0, draggedLayer);
    this.clearDragState();
    this.editor.setLayerOrder(topFirstLayers.reverse());
    this.editor.selectLayer(draggedLayer);
  }

  handleDragEnd() {
    this.clearDragState();
  }

  toggleBorderLayer() {
    this.editor.setBorderLayerEnabled(this.borderToggle.checked);
  }

  clearDragState() {
    this.draggedLayerId = null;
    this.clearDropTarget();

    for (const row of this.list.querySelectorAll(".is-reordering")) {
      row.classList.remove("is-reordering");
    }
  }

  clearDropTarget() {
    if (!this.dropTarget) {
      return;
    }

    this.dropTarget.classList.remove("drop-before", "drop-after");
    delete this.dropTarget.dataset.dropPosition;
    this.dropTarget = null;
  }

  updateSelection() {
    const selectedLayer = this.editor.getSelectedLayer();

    for (const row of this.list.querySelectorAll(".layer-row")) {
      const isSelected =
        row.dataset.layerId === selectedLayer?.dataset.layerId;
      row.classList.toggle("is-selected", isSelected);
      row.setAttribute("aria-current", isSelected ? "true" : "false");
    }
  }

  findLayer(layerId) {
    return this.editor.getLayers().find(
      layer => layer.dataset.layerId === layerId
    );
  }

  getLabel(layer) {
    const type = layer.dataset.layerType || "layer";
    let name = "";

    if (type === "text") {
      name = layer.textContent.replace(/\s+/g, " ").trim();
    } else if (layer instanceof HTMLImageElement) {
      name = layer.alt.replace(/\.[a-z0-9]+$/i, "").trim();
    }

    const prefix = {
      border: "Border",
      detail: "Asset",
      image: "Image",
      text: "Text"
    }[type] || "Layer";
    const label = name ? `${prefix}: ${name}` : prefix;
    const step = readSequenceStep(layer);
    const scenePrefix = step === null ? "" : `[S${step}] `;
    const contentLimit = LABEL_LIMIT - scenePrefix.length;
    const visibleLabel = label.length > contentLimit
      ? `${label.slice(0, Math.max(0, contentLimit - 3))}...`
      : label;

    return `${scenePrefix}${visibleLabel}`;
  }
}
