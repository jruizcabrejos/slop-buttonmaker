export const MAX_SEQUENCE_SCENES = 8;
export const SEQUENCE_INACTIVE_CLASS = "sequence-inactive";

export function readSequenceStep(layer) {
  const step = Number(layer?.dataset?.sequenceStep);

  return Number.isInteger(step) &&
    step >= 1 &&
    step <= MAX_SEQUENCE_SCENES
    ? step
    : null;
}

export function getSequenceSteps(layers) {
  let highestStep = 0;

  for (const layer of layers) {
    const step = readSequenceStep(layer);

    if (
      step !== null &&
      !layer.hidden &&
      layer.dataset.layerType !== "border"
    ) {
      highestStep = Math.max(highestStep, step);
    }
  }

  return Array.from(
    { length: highestStep },
    (_, index) => index + 1
  );
}

export function getSequenceStepAtTime(steps, timeMs, durationMs) {
  if (steps.length === 0) {
    return null;
  }

  const safeDuration = Math.max(1, Number(durationMs) || 1);
  const normalizedTime =
    ((Number(timeMs) || 0) % safeDuration + safeDuration) %
    safeDuration;
  const sceneDuration = safeDuration / steps.length;
  const index = Math.min(
    steps.length - 1,
    Math.floor(normalizedTime / sceneDuration)
  );

  return steps[index];
}

export function applySequenceVisibility(layers, activeStep) {
  for (const layer of layers) {
    const step = readSequenceStep(layer);
    const inactive = step !== null && step !== activeStep;
    layer.classList.toggle(SEQUENCE_INACTIVE_CLASS, inactive);
  }
}

export class SequenceController {
  constructor({ editor }) {
    this.editor = editor;
    this.sceneSelect = document.getElementById("layer_sequence_step");
    this.previewSelect = document.getElementById("sequence_preview");
    this.durationSelect = document.getElementById("gif_duration");
    this.startedAt = performance.now();
    this.lastSignature = "";

    this.assignScene = this.assignScene.bind(this);
    this.changePreview = this.changePreview.bind(this);
    this.restart = this.restart.bind(this);
    this.tick = this.tick.bind(this);

    this.sceneSelect.addEventListener("change", this.assignScene);
    this.previewSelect.addEventListener("change", this.changePreview);
    this.durationSelect.addEventListener("change", this.restart);

    this.editor.onLayersChanged(() => {
      this.updateControls();
      this.invalidate();
    });
    this.editor.onSelectionChanged(() => this.updateControls());
    this.editor.onReset(() => this.reset());

    this.updateControls();
    requestAnimationFrame(this.tick);
  }

  assignScene() {
    const layer = this.editor.getSelectedLayer();

    if (!layer || this.editor.isBorderLayer(layer)) {
      return;
    }

    const step = Number(this.sceneSelect.value);

    if (
      Number.isInteger(step) &&
      step >= 1 &&
      step <= MAX_SEQUENCE_SCENES
    ) {
      layer.dataset.sequenceStep = String(step);
    } else {
      delete layer.dataset.sequenceStep;
    }

    this.restart();
    this.editor.notifyLayersChanged();
  }

  changePreview() {
    if (this.previewSelect.value === "auto") {
      this.startedAt = performance.now();
    }

    this.invalidate();
  }

  restart() {
    this.startedAt = performance.now();
    this.invalidate();
  }

  tick(time) {
    this.render(time);
    requestAnimationFrame(this.tick);
  }

  render(time = performance.now()) {
    const layers = this.editor.getLayers();
    const steps = getSequenceSteps(layers);
    const manualStep = Number(this.previewSelect.value);
    const activeStep =
      this.previewSelect.value === "auto"
        ? getSequenceStepAtTime(
          steps,
          time - this.startedAt,
          this.getDurationMs()
        )
        : manualStep;
    const signature = [
      activeStep ?? "",
      ...layers.map(layer => (
        `${layer.dataset.layerId}:${readSequenceStep(layer) ?? ""}:` +
        `${layer.hidden ? "0" : "1"}`
      ))
    ].join("|");

    this.previewSelect.disabled = steps.length === 0;

    if (signature === this.lastSignature) {
      return;
    }

    applySequenceVisibility(layers, activeStep);
    this.lastSignature = signature;
  }

  updateControls() {
    const layer = this.editor.getSelectedLayer();
    const editable = Boolean(
      layer && !this.editor.isBorderLayer(layer)
    );

    this.sceneSelect.disabled = !editable;
    this.sceneSelect.value = editable
      ? String(readSequenceStep(layer) ?? "")
      : "";
    this.previewSelect.disabled =
      getSequenceSteps(this.editor.getLayers()).length === 0;
  }

  getDurationMs() {
    return Math.max(1, Number(this.durationSelect.value) * 1000 || 2000);
  }

  getProjectState() {
    return {
      duration: this.durationSelect.value
    };
  }

  applyProjectState(state) {
    const duration = String(state?.duration ?? "");
    const validDuration = Array.from(this.durationSelect.options).some(
      option => option.value === duration
    );

    if (validDuration) {
      this.durationSelect.value = duration;
    }

    this.previewSelect.value = "auto";
    this.restart();
    this.updateControls();
  }

  reset() {
    this.sceneSelect.value = "";
    this.sceneSelect.disabled = true;
    this.previewSelect.value = "auto";
    this.previewSelect.disabled = true;
    this.restart();
  }

  invalidate() {
    this.lastSignature = "";
    this.render();
  }
}
