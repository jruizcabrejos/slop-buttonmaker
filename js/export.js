import {
  GIFEncoder,
  applyPalette,
  quantize
} from "../gifenc/gifenc.esm.js";
import { BUTTON_HEIGHT, BUTTON_WIDTH } from "./editor.js";
import { rasterizeBorderImage } from "./css-background.js";
import {
  createGifFrameSchedule,
  resolveAutoCycle as resolveGifAutoCycle
} from "./gif-timing.js";
import {
  applySequenceVisibility,
  getSequenceStepAtTime,
  getSequenceSteps
} from "./sequence.js";

const SMOOTH_RENDER_SCALE = 4;
const EXPORT_SCALES = [1, 2, 4];
const SNAPSHOT_WIDTH = BUTTON_WIDTH * SMOOTH_RENDER_SCALE;
const SNAPSHOT_HEIGHT = BUTTON_HEIGHT * SMOOTH_RENDER_SCALE;
const BOUNCE_DISTANCE = 4;
const TEXT_EFFECT_DURATIONS = {
  slow: 2000,
  normal: 1200,
  fast: 600
};
const BUTTON_EFFECT_DURATIONS = {
  glitch: 320,
  distortion: 480,
  shimmer: 1200,
  rotate: 1200
};
const BUTTON_EFFECT_SPEED_FACTORS = {
  slow: 2,
  normal: 1,
  fast: 0.5
};
const ANIMATED_TEXT_EFFECTS = new Set([
  "bounce",
  "glow",
  "fly-in",
  "blink",
  "letter-sweep",
  "wave"
]);

class ExportConfigurationError extends Error {}

export class ExportOptionsController {
  constructor({ editor }) {
    this.format = document.getElementById("export_format");
    this.rendering = document.getElementById("export_rendering");
    this.scale = document.getElementById("export_scale");
    this.gifDuration = document.getElementById("gif_duration");
    this.gifFrameRate = document.getElementById("gif_frame_rate");
    this.gifLoop = document.getElementById("gif_loop");
    this.gifLoopCount = document.getElementById("gif_loop_count");
    this.gifRows = document.querySelectorAll(".gif-export-row");

    this.syncGifRows = this.syncGifRows.bind(this);
    this.syncGifLoopCount = this.syncGifLoopCount.bind(this);
    this.format.addEventListener("change", this.syncGifRows);
    this.gifLoop.addEventListener("change", this.syncGifLoopCount);
    this.syncGifRows();
    this.syncGifLoopCount();

    editor.onReset(() => this.reset());
  }

  getSettings() {
    const repeat = this.gifLoop.value === "custom"
      ? Math.max(
        2,
        Math.min(100, Number(this.gifLoopCount.value) || 2)
      )
      : Number(this.gifLoop.value);

    const autoCycleSelected = this.gifDuration.value === "auto";

    return {
      format: this.format.value,
      rendering: this.rendering.value,
      scale: this.readScale(this.scale.value),
      duration: autoCycleSelected ? 2 : Number(this.gifDuration.value),
      autoCycle: this.format.value === "gif" && autoCycleSelected,
      frameRate: Number(this.gifFrameRate.value),
      repeat
    };
  }

  syncGifRows() {
    const hidden = this.format.value !== "gif";

    for (const row of this.gifRows) {
      row.classList.toggle("hidden", hidden);
    }
  }

  syncGifLoopCount() {
    const custom = this.gifLoop.value === "custom";
    this.gifLoopCount.classList.toggle("hidden", !custom);
    this.gifLoopCount.disabled = !custom;
  }

  readScale(value) {
    const scale = Number(value);
    return EXPORT_SCALES.includes(scale) ? scale : 1;
  }

  reset() {
    for (const control of [
      this.format,
      this.rendering,
      this.scale,
      this.gifDuration,
      this.gifFrameRate,
      this.gifLoop
    ]) {
      const defaultIndex = Array.from(control.options).findIndex(
        option => option.defaultSelected
      );
      control.selectedIndex = defaultIndex >= 0 ? defaultIndex : 0;
    }

    this.gifLoopCount.value = this.gifLoopCount.defaultValue;
    this.syncGifRows();
    this.syncGifLoopCount();
  }
}

export class ExportController {
  constructor({ editor, media, options, sequence }) {
    this.editor = editor;
    this.media = media;
    this.options = options;
    this.sequence = sequence;
    this.saveButton = document.getElementById("save_img");
    this.defaultButtonText = this.saveButton.textContent;
    this.save = this.save.bind(this);
    this.saveButton.addEventListener("click", this.save);
  }

  async save() {
    if (typeof window.html2canvas !== "function") {
      window.alert("The image exporter could not be loaded.");
      return;
    }

    const settings = this.options.getSettings();

    if (!settings.autoCycle) {
      Object.assign(
        settings,
        this.sequence.getExportTiming(settings.duration)
      );
    }

    this.saveButton.disabled = true;
    this.saveButton.textContent =
      settings.format === "gif" ? "Recording..." : "Saving...";

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      if (settings.format === "gif") {
        await this.media.prepareGifExport();

        if (settings.autoCycle) {
          settings.duration = this.resolveAutoCycle(settings.frameRate);
          Object.assign(
            settings,
            this.sequence.getExportTiming(settings.duration)
          );
        }
        await this.saveGif(settings);
      } else {
        await this.savePng(settings);
      }
    } catch (error) {
      if (error instanceof ExportConfigurationError) {
        window.alert(error.message);
      } else {
        console.error(error);
        window.alert("The button could not be saved.");
      }
    } finally {
      this.saveButton.disabled = false;
      this.saveButton.textContent = this.defaultButtonText;
    }
  }

  async savePng(settings) {
    const canvas = await this.captureButton(
      settings.rendering,
      null,
      settings.duration,
      settings.sceneDurationsMs,
      settings.scale
    );
    const blob = await this.canvasToBlob(canvas, "image/png");
    this.downloadBlob(blob, "button.png");
  }

  async saveGif(settings) {
    const encoder = GIFEncoder();
    const schedule = createGifFrameSchedule(
      settings.duration * 1000,
      settings.frameRate
    );
    const exportDuration = schedule.durationMs / 1000;

    for (let frame = 0; frame < schedule.frames.length; frame += 1) {
      const timing = schedule.frames[frame];
      const animationSampling = {
        frameIndex: frame,
        frameCount: schedule.frames.length,
        frameTimes: schedule.frameTimes,
        scheduleKey: schedule.key
      };
      const canvas = await this.captureButton(
        settings.rendering,
        timing.timeMs,
        exportDuration,
        settings.sceneDurationsMs,
        settings.scale,
        animationSampling
      );
      const outputWidth = canvas.width;
      const outputHeight = canvas.height;
      const context = canvas.getContext("2d", {
        willReadFrequently: true
      });
      const rgba = context.getImageData(
        0,
        0,
        outputWidth,
        outputHeight
      ).data;
      const palette = quantize(rgba, 256, {
        format: "rgba4444",
        oneBitAlpha: true
      });
      const indexedFrame = applyPalette(rgba, palette, "rgba4444");
      const transparentIndex = palette.findIndex(color => color[3] === 0);

      encoder.writeFrame(
        indexedFrame,
        outputWidth,
        outputHeight,
        {
          palette,
          delay: timing.delayMs,
          repeat: settings.repeat,
          transparent: transparentIndex >= 0,
          transparentIndex: Math.max(0, transparentIndex)
        }
      );
    }

    encoder.finish();
    const blob = new Blob([encoder.bytes()], { type: "image/gif" });
    this.downloadBlob(blob, "button.gif");
  }

  resolveAutoCycle(frameRate) {
    if (this.sequence.hasActiveScenes()) {
      throw new ExportConfigurationError(
        "Auto cycle is unavailable while Scene sequencing is active. " +
        "Choose a numbered Cycle or set scene layers to Always."
      );
    }

    const mediaDurations = this.media.getExportAnimationDurations();
    const effectDurations = this.getEffectAnimationDurations();
    const resolution = resolveGifAutoCycle(
      [...mediaDurations, ...effectDurations],
      frameRate
    );

    if (resolution.reason === "no-animations") {
      throw new ExportConfigurationError(
        "Auto cycle needs at least one visible animated image or effect."
      );
    }

    if (resolution.reason === "frame-rate") {
      throw new ExportConfigurationError(
        "The selected frame rate is too low for this shared loop. " +
        "Choose a higher GIF frame rate or a numbered Cycle."
      );
    }

    if (resolution.reason === "frame-limit") {
      throw new ExportConfigurationError(
        "Auto cycle would require too many frames at the selected frame " +
        "rate. Choose a lower GIF frame rate or a numbered Cycle."
      );
    }

    if (resolution.reason) {
      throw new ExportConfigurationError(
        "These animations do not have a short shared loop. " +
        "Choose a numbered Cycle."
      );
    }

    const schedule = createGifFrameSchedule(
      resolution.durationMs,
      frameRate
    );

    if (
      !this.media.canSampleExportAnimations(schedule.frameTimes) ||
      !this.canSampleEffectAnimations(
        effectDurations,
        schedule.frameTimes
      )
    ) {
      throw new ExportConfigurationError(
        "The selected frame rate skips one of the matched animations. " +
        "Choose a higher GIF frame rate or a numbered Cycle."
      );
    }

    return resolution.durationMs / 1000;
  }

  getEffectAnimationDurations() {
    const durations = [];

    for (const layer of this.editor.getLayers()) {
      if (
        layer.hidden ||
        !ANIMATED_TEXT_EFFECTS.has(layer.dataset.textEffect)
      ) {
        continue;
      }

      durations.push(
        TEXT_EFFECT_DURATIONS[layer.dataset.textEffectSpeed] ||
        TEXT_EFFECT_DURATIONS.normal
      );
    }

    const effect = this.editor.button.dataset.buttonEffect;

    if (BUTTON_EFFECT_DURATIONS[effect]) {
      const speedFactor =
        BUTTON_EFFECT_SPEED_FACTORS[
          this.editor.button.dataset.buttonEffectSpeed
        ] || BUTTON_EFFECT_SPEED_FACTORS.normal;
      durations.push(BUTTON_EFFECT_DURATIONS[effect] * speedFactor);
    }

    return durations;
  }

  canSampleEffectAnimations(durations, frameTimes) {
    return durations.every(duration => (
      new Set(frameTimes.map(time => time % duration)).size > 1
    ));
  }

  async captureButton(
    rendering,
    animationTime = null,
    sequenceDuration = 2,
    sceneDurationsMs = {},
    exportScale = 1,
    animationSampling = null
  ) {
    const imageSnapshots = this.snapshotLayerImages(
      animationTime,
      animationSampling
    );
    const backgroundSource = document.getElementById(
      "background_animation_source"
    );
    const backgroundSnapshot = Number.isFinite(animationTime)
      ? this.media.getBackgroundAnimationFrame(
        animationTime,
        animationSampling
      ) ||
        this.snapshotImage(backgroundSource)
      : this.snapshotImage(backgroundSource);
    const exportHost = this.createExportHost(
      imageSnapshots,
      backgroundSnapshot,
      rendering,
      animationTime,
      sequenceDuration,
      sceneDurationsMs
    );

    try {
      await this.waitForImages(exportHost.button);
      await this.applyImageCrops(exportHost.button, rendering);
      await this.prepareBorderImage(exportHost.button, rendering);
      await this.waitForImages(exportHost.button);

      const renderScale =
        rendering === "smooth" ? SMOOTH_RENDER_SCALE : 1;
      const renderedCanvas = await window.html2canvas(
        exportHost.renderRoot,
        {
          scale: renderScale,
          width: BUTTON_WIDTH,
          height: BUTTON_HEIGHT,
          backgroundColor: null,
          logging: false
        }
      );

      return this.normalizeCanvas(
        renderedCanvas,
        rendering,
        exportScale
      );
    } finally {
      exportHost.host.remove();
    }
  }

  snapshotLayerImages(animationTime, animationSampling = null) {
    return Array.from(this.editor.button.querySelectorAll("img")).map(
      image => (
        Number.isFinite(animationTime)
          ? this.media.getLayerAnimationFrame(
            image,
            animationTime,
            animationSampling
          ) ||
            this.snapshotImage(image)
          : this.snapshotImage(image)
      )
    );
  }

  snapshotImage(image) {
    if (!image || !image.complete || image.naturalWidth === 0) {
      return null;
    }

    const scale = Math.min(
      1,
      SNAPSHOT_WIDTH / image.naturalWidth,
      SNAPSHOT_HEIGHT / image.naturalHeight
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    try {
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  createExportHost(
    imageSnapshots,
    backgroundSnapshot,
    rendering,
    animationTime,
    sequenceDuration,
    sceneDurationsMs
  ) {
    const host = document.createElement("div");
    const frame = document.createElement("div");
    const button = this.editor.button.cloneNode(true);
    const clonedImages = button.querySelectorAll("img");

    host.classList.add("export-host");
    frame.classList.add("export-frame");
    button.style.position = "absolute";
    button.style.left = "0";
    button.style.top = "0";
    button.style.transform = "none";
    button.style.overflow = "visible";
    button.style.imageRendering =
      rendering === "pixelated" ? "pixelated" : "auto";
    button.classList.remove("is-dragging");
    frame.style.borderRadius = button.style.borderRadius || "0";

    if (backgroundSnapshot) {
      button.style.backgroundImage = `url("${backgroundSnapshot}")`;
    }

    for (let index = 0; index < clonedImages.length; index += 1) {
      clonedImages[index].style.imageRendering =
        rendering === "pixelated" ? "pixelated" : "auto";

      if (imageSnapshots[index]) {
        clonedImages[index].src = imageSnapshots[index];
      }
    }

    for (const element of button.querySelectorAll(
      ".glow_box, .glow_text, .is-dragging, .active_img"
    )) {
      element.classList.remove(
        "glow_box",
        "glow_text",
        "is-dragging",
        "active_img"
      );
    }

    this.freezeTextEffects(button, animationTime);
    this.freezeButtonEffect(button, animationTime);
    this.freezeSequence(
      button,
      animationTime,
      sequenceDuration,
      sceneDurationsMs
    );
    frame.appendChild(button);
    host.appendChild(frame);
    document.body.appendChild(host);
    return { host, button, renderRoot: frame };
  }

  freezeSequence(
    button,
    animationTime,
    durationSeconds,
    sceneDurationsMs
  ) {
    const layers = Array.from(
      button.querySelectorAll(".editor-layer")
    );
    const steps = getSequenceSteps(layers);
    const preview = document.getElementById("sequence_preview").value;
    const previewStep = Number(preview);
    const activeStep = Number.isFinite(animationTime)
      ? getSequenceStepAtTime(
        steps,
        animationTime,
        Number(durationSeconds) * 1000,
        sceneDurationsMs
      )
      : preview === "auto"
        ? steps[0] ?? null
        : previewStep;

    applySequenceVisibility(layers, activeStep);
  }

  freezeTextEffects(button, animationTime) {
    for (const text of button.querySelectorAll("[data-text-effect]")) {
      const effect = text.dataset.textEffect;
      const duration =
        TEXT_EFFECT_DURATIONS[text.dataset.textEffectSpeed] ||
        TEXT_EFFECT_DURATIONS.normal;
      const time = Number.isFinite(animationTime) ? animationTime : 0;
      const primaryColor =
        text.dataset.textPrimaryColor || text.style.color || "#000";
      const effectColor =
        text.dataset.textEffectColor || "#fff";
      text.style.animation = "none";

      switch (effect) {
        case "bounce": {
          const phase = Number.isFinite(animationTime)
            ? (animationTime % duration) / duration
            : 0;
          const offset =
            -BOUNCE_DISTANCE * Math.sin(Math.PI * phase);
          text.style.transform = `translateY(${offset.toFixed(3)}px)`;
          break;
        }
        case "glow": {
          const phase = Number.isFinite(animationTime)
            ? (animationTime % duration) / duration
            : 0.25;
          const blur = 2 + 4 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
          text.style.textShadow =
            `0 0 ${blur.toFixed(2)}px #fff, ` +
            `0 0 ${(blur * 1.5).toFixed(2)}px currentColor`;
          break;
        }
        case "fly-in": {
          const phase = Number.isFinite(animationTime)
            ? (animationTime % duration) / duration
            : 0.5;
          const direction =
            text.dataset.textEffectDirection === "right-to-left"
              ? -1
              : 1;
          const offset =
            direction * (-BUTTON_WIDTH + phase * BUTTON_WIDTH * 2);
          text.style.transform = `translateX(${offset.toFixed(3)}px)`;
          break;
        }
        case "blink": {
          const phase = Number.isFinite(animationTime)
            ? (animationTime % duration) / duration
            : 0.25;
          text.style.color = phase < 0.5
            ? primaryColor
            : effectColor;
          break;
        }
        case "letter-sweep":
          for (const [index, letter] of Array.from(
            text.querySelectorAll(".text-effect-letter")
          ).entries()) {
            const phase = this.modulo(
              time - index * 70,
              duration
            ) / duration;
            letter.style.animation = "none";
            letter.style.color =
              phase >= 0.35 && phase <= 0.68
                ? effectColor
                : primaryColor;
          }
          break;
        case "wave":
          for (const [index, letter] of Array.from(
            text.querySelectorAll(".text-effect-letter")
          ).entries()) {
            const phase = this.modulo(
              time + index * 80,
              duration
            ) / duration;
            const offset =
              -BOUNCE_DISTANCE *
              (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
            letter.style.animation = "none";
            letter.style.transform =
              `translateY(${offset.toFixed(3)}px)`;
          }
          break;
        default:
          break;
      }
    }
  }

  freezeButtonEffect(button, animationTime) {
    const effect = button.dataset.buttonEffect;
    const overlay = button.querySelector(".button-effect-overlay");
    const speedFactor =
      BUTTON_EFFECT_SPEED_FACTORS[button.dataset.buttonEffectSpeed] ||
      BUTTON_EFFECT_SPEED_FACTORS.normal;
    const duration = (
      BUTTON_EFFECT_DURATIONS[effect] ||
      BUTTON_EFFECT_DURATIONS.rotate
    ) * speedFactor;
    const phase = Number.isFinite(animationTime)
      ? (animationTime % duration) / duration
      : 0.25;

    button.style.animation = "none";
    if (overlay) {
      overlay.style.animation = "none";
    }

    switch (effect) {
      case "glitch": {
        const offsets = [
          [0, 0],
          [1, 0],
          [-1, 1],
          [0, -1]
        ];
        const offset = offsets[Math.floor(phase * offsets.length) % 4];
        button.style.transform =
          `translate(${offset[0]}px, ${offset[1]}px)`;
        if (overlay) {
          overlay.style.display = "block";
          overlay.style.opacity = phase > 0.5 ? "0.28" : "0.16";
          overlay.style.backgroundPosition = `${phase * 12}px 0`;
        }
        break;
      }
      case "distortion":
        button.style.transform = "none";
        if (overlay) {
          overlay.style.display = "block";
          overlay.style.opacity = "0.72";
          overlay.style.backgroundPosition =
            `${(phase * 35).toFixed(2)}px 0, 0 ` +
            `${phase >= 0.5 ? 1 : 0}px`;
          overlay.style.clipPath = phase < 0.5
            ? "polygon(0 0,100% 0,100% 28%,0 28%,0 55%,100% 55%,100% 72%,0 72%)"
            : "polygon(0 12%,100% 12%,100% 42%,0 42%,0 67%,100% 67%,100% 96%,0 96%)";
        }
        break;
      case "shimmer":
        if (overlay) {
          overlay.style.display = "block";
          overlay.style.backgroundPosition =
            `${(-120 + phase * 240).toFixed(2)}% 0`;
        }
        break;
      case "rotate": {
        const angle = Math.sin(phase * Math.PI * 2) * 2;
        button.style.transform =
          `rotate(${angle.toFixed(3)}deg)`;
        break;
      }
      default:
        button.style.transform = "none";
        break;
    }
  }

  async prepareBorderImage(button, rendering) {
    const borderLayer = button.querySelector(".button-border-layer");

    if (
      !borderLayer ||
      !/^url\(/i.test(borderLayer.style.borderImageSource)
    ) {
      return;
    }

    try {
      const dataUrl = await rasterizeBorderImage(borderLayer, {
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        scale: rendering === "smooth" ? SMOOTH_RENDER_SCALE : 1,
        radius: Number.parseFloat(button.style.borderRadius) || 0,
        pixelated: rendering === "pixelated"
      });

      if (!dataUrl) {
        return;
      }

      Object.assign(borderLayer.style, {
        backgroundImage: `url("${dataUrl}")`,
        backgroundPosition: "0 0",
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% 100%",
        borderColor: "transparent",
        borderImageSource: "none",
        borderStyle: "none",
        borderWidth: "0"
      });
    } catch (error) {
      console.warn("The CSS border image could not be rasterized.", error);
    }
  }

  async applyImageCrops(root, rendering) {
    const croppedImages = root.querySelectorAll("img[data-crop-left]");
    const scale = rendering === "smooth" ? SMOOTH_RENDER_SCALE : 1;

    for (const image of croppedImages) {
      const width = this.readNumber(
        image.style.width,
        image.offsetWidth
      );
      const height = this.readNumber(
        image.style.height,
        image.offsetHeight
      );
      const cropLeft = Number(image.dataset.cropLeft) || 0;
      const cropTop = Number(image.dataset.cropTop) || 0;
      const cropRight = Number(image.dataset.cropRight) || 0;
      const cropBottom = Number(image.dataset.cropBottom) || 0;
      const croppedWidth = width - cropLeft - cropRight;
      const croppedHeight = height - cropTop - cropBottom;

      if (croppedWidth <= 0 || croppedHeight <= 0) {
        continue;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(croppedWidth * scale));
      canvas.height = Math.max(1, Math.round(croppedHeight * scale));
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = rendering === "smooth";
      if (context.imageSmoothingEnabled) {
        context.imageSmoothingQuality = "high";
      }

      this.drawImageInBox(
        context,
        image,
        image.style.objectFit,
        -cropLeft * scale,
        -cropTop * scale,
        width * scale,
        height * scale
      );

      const left = this.readNumber(image.style.left, image.offsetLeft);
      const top = this.readNumber(image.style.top, image.offsetTop);
      image.style.left = `${left + cropLeft}px`;
      image.style.top = `${top + cropTop}px`;
      image.style.width = `${croppedWidth}px`;
      image.style.height = `${croppedHeight}px`;
      image.style.objectFit = "fill";
      image.style.clipPath = "none";
      image.removeAttribute("data-crop-left");
      image.removeAttribute("data-crop-top");
      image.removeAttribute("data-crop-right");
      image.removeAttribute("data-crop-bottom");
      image.src = canvas.toDataURL("image/png");
    }
  }

  drawImageInBox(context, image, objectFit, x, y, width, height) {
    if (objectFit !== "contain") {
      context.drawImage(image, x, y, width, height);
      return;
    }

    const ratio = Math.min(
      width / image.naturalWidth,
      height / image.naturalHeight
    );
    const drawWidth = image.naturalWidth * ratio;
    const drawHeight = image.naturalHeight * ratio;
    context.drawImage(
      image,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  }

  readNumber(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  normalizeCanvas(renderedCanvas, rendering, exportScale = 1) {
    const safeScale = EXPORT_SCALES.includes(Number(exportScale))
      ? Number(exportScale)
      : 1;
    const outputWidth = BUTTON_WIDTH * safeScale;
    const outputHeight = BUTTON_HEIGHT * safeScale;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    const smooth = rendering === "smooth";

    context.imageSmoothingEnabled = smooth;
    if (smooth) {
      context.imageSmoothingQuality = "high";
    }
    context.drawImage(
      renderedCanvas,
      0,
      0,
      renderedCanvas.width,
      renderedCanvas.height,
      0,
      0,
      outputWidth,
      outputHeight
    );

    return canvas;
  }

  waitForImages(root) {
    const pendingImages = Array.from(root.querySelectorAll("img"))
      .filter(image => !image.complete)
      .map(image => new Promise(resolve => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }));

    return Promise.all(pendingImages);
  }

  canvasToBlob(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Could not create ${type} output.`));
        }
      }, type);
    });
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename;
    link.href = url;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

}
