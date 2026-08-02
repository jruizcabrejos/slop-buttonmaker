export const MAX_SEQUENCE_SCENES = 8;
export const SEQUENCE_INACTIVE_CLASS = "sequence-inactive";
const MIN_SCENE_DURATION_SECONDS = 0.1;
const MAX_SCENE_DURATION_SECONDS = 30;

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

export function getSequenceTimeline(
  steps,
  durationMs,
  sceneDurations = {}
) {
  const safeDuration = Math.max(1, Number(durationMs) || 1);

  if (steps.length === 0) {
    return {
      durationMs: safeDuration,
      sceneDurationsMs: {}
    };
  }

  const defaultDuration = safeDuration / steps.length;
  const sceneDurationsMs = {};
  let totalDuration = 0;

  for (const step of steps) {
    const customDuration = Number(sceneDurations[step]);
    const resolvedDuration = Number.isFinite(customDuration) &&
      customDuration >= MIN_SCENE_DURATION_SECONDS &&
      customDuration <= MAX_SCENE_DURATION_SECONDS
      ? customDuration * 1000
      : defaultDuration;
    sceneDurationsMs[step] = resolvedDuration;
    totalDuration += resolvedDuration;
  }

  return {
    durationMs: Math.max(1, totalDuration),
    sceneDurationsMs
  };
}

export function getSequenceStepAtTime(
  steps,
  timeMs,
  durationMs,
  sceneDurationsMs = {}
) {
  if (steps.length === 0) {
    return null;
  }

  const safeDuration = Math.max(1, Number(durationMs) || 1);
  const defaultDuration = safeDuration / steps.length;
  const durations = steps.map(step => {
    const duration = Number(sceneDurationsMs[step]);
    return Number.isFinite(duration) && duration > 0
      ? duration
      : defaultDuration;
  });
  const totalDuration = durations.reduce(
    (total, duration) => total + duration,
    0
  );
  const normalizedTime =
    ((Number(timeMs) || 0) % totalDuration + totalDuration) %
    totalDuration;
  let elapsed = 0;

  for (let index = 0; index < steps.length; index += 1) {
    elapsed += durations[index];

    if (normalizedTime < elapsed || index === steps.length - 1) {
      return steps[index];
    }
  }

  return steps.at(-1);
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
    this.durationSceneSelect = document.getElementById(
      "scene_duration_scene"
    );
    this.durationInput = document.getElementById(
      "scene_duration_value"
    );
    this.durationDefault = document.getElementById(
      "scene_duration_default"
    );
    this.durationTotal = document.getElementById(
      "scene_duration_total"
    );
    this.sceneDurations = {};
    this.startedAt = performance.now();
    this.lastSignature = "";

    this.assignScene = this.assignScene.bind(this);
    this.changePreview = this.changePreview.bind(this);
    this.changeBaseDuration = this.changeBaseDuration.bind(this);
    this.changeDurationScene = this.changeDurationScene.bind(this);
    this.setSceneDuration = this.setSceneDuration.bind(this);
    this.clearSceneDuration = this.clearSceneDuration.bind(this);
    this.restart = this.restart.bind(this);
    this.tick = this.tick.bind(this);

    this.sceneSelect.addEventListener("change", this.assignScene);
    this.previewSelect.addEventListener("change", this.changePreview);
    this.durationSelect.addEventListener(
      "change",
      this.changeBaseDuration
    );
    this.durationSceneSelect.addEventListener(
      "change",
      this.changeDurationScene
    );
    this.durationInput.addEventListener("change", this.setSceneDuration);
    this.durationDefault.addEventListener(
      "click",
      this.clearSceneDuration
    );

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

  changeBaseDuration() {
    this.updateDurationControls();
    this.restart();
  }

  changeDurationScene() {
    this.updateDurationControls();
  }

  setSceneDuration() {
    const step = Number(this.durationSceneSelect.value);
    const enteredDuration = this.durationInput.valueAsNumber;

    if (!Number.isFinite(enteredDuration)) {
      this.updateDurationControls();
      return;
    }

    const duration = Math.max(
      MIN_SCENE_DURATION_SECONDS,
      Math.min(
        MAX_SCENE_DURATION_SECONDS,
        enteredDuration
      )
    );

    this.sceneDurations[step] = duration;
    this.updateDurationControls();
    this.restart();
  }

  clearSceneDuration() {
    delete this.sceneDurations[this.durationSceneSelect.value];
    this.updateDurationControls();
    this.restart();
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
    const timeline = this.getTimeline(layers);
    const manualStep = Number(this.previewSelect.value);
    const activeStep =
      this.previewSelect.value === "auto"
        ? getSequenceStepAtTime(
          steps,
          time - this.startedAt,
          timeline.durationMs,
          timeline.sceneDurationsMs
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
    this.updateDurationControls();
  }

  getTimeline(layers = this.editor.getLayers(), durationSeconds = null) {
    const steps = getSequenceSteps(layers);
    const baseDuration = durationSeconds === null
      ? Number(this.durationSelect.value)
      : Number(durationSeconds);

    return getSequenceTimeline(
      steps,
      Math.max(1, baseDuration * 1000 || 2000),
      this.sceneDurations
    );
  }

  getExportTiming(durationSeconds) {
    const timeline = this.getTimeline(
      this.editor.getLayers(),
      durationSeconds
    );

    return {
      duration: timeline.durationMs / 1000,
      sceneDurationsMs: timeline.sceneDurationsMs
    };
  }

  updateDurationControls() {
    const step = Number(this.durationSceneSelect.value);
    const steps = getSequenceSteps(this.editor.getLayers());
    const timeline = this.getTimeline();
    const customDuration = Number(this.sceneDurations[step]);
    const defaultDuration = Math.max(
      0.1,
      Number(this.durationSelect.value) / Math.max(1, steps.length)
    );
    const duration = Number.isFinite(customDuration)
      ? customDuration
      : defaultDuration;

    this.durationInput.value = this.formatDuration(duration);
    this.durationDefault.disabled = !Number.isFinite(customDuration);
    this.durationInput.dataset.custom = String(
      Number.isFinite(customDuration)
    );
    this.durationTotal.value = steps.length === 0
      ? "No active scenes"
      : `Cycle: ${this.formatDuration(timeline.durationMs / 1000)}s`;
  }

  formatDuration(duration) {
    return String(Math.round(duration * 1000) / 1000);
  }

  getProjectState() {
    return {
      duration: this.durationSelect.value,
      sceneDurations: { ...this.sceneDurations }
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

    this.sceneDurations = {};

    for (const [step, storedDuration] of Object.entries(
      state?.sceneDurations || {}
    )) {
      const scene = Number(step);
      const sceneDuration = Number(storedDuration);

      if (
        Number.isInteger(scene) &&
        scene >= 1 &&
        scene <= MAX_SEQUENCE_SCENES &&
        Number.isFinite(sceneDuration) &&
        sceneDuration >= MIN_SCENE_DURATION_SECONDS &&
        sceneDuration <= MAX_SCENE_DURATION_SECONDS
      ) {
        this.sceneDurations[scene] = sceneDuration;
      }
    }

    this.previewSelect.value = "auto";
    this.restart();
    this.updateControls();
  }

  reset() {
    this.sceneDurations = {};
    this.durationSceneSelect.value = "1";
    this.sceneSelect.value = "";
    this.sceneSelect.disabled = true;
    this.previewSelect.value = "auto";
    this.previewSelect.disabled = true;
    this.updateDurationControls();
    this.restart();
  }

  invalidate() {
    this.lastSignature = "";
    this.render();
  }
}
