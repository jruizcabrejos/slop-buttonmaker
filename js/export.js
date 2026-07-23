import {
  GIFEncoder,
  applyPalette,
  quantize
} from "../gifenc/gifenc.esm.js";
import { BUTTON_HEIGHT, BUTTON_WIDTH } from "./editor.js";

const SMOOTH_RENDER_SCALE = 4;
const SNAPSHOT_WIDTH = BUTTON_WIDTH * SMOOTH_RENDER_SCALE;
const SNAPSHOT_HEIGHT = BUTTON_HEIGHT * SMOOTH_RENDER_SCALE;

export class ExportOptionsController {
  constructor({ editor }) {
    this.format = document.getElementById("export_format");
    this.rendering = document.getElementById("export_rendering");
    this.gifDuration = document.getElementById("gif_duration");
    this.gifFrameRate = document.getElementById("gif_frame_rate");
    this.gifLoop = document.getElementById("gif_loop");
    this.gifRows = document.querySelectorAll(".gif-export-row");

    this.syncGifRows = this.syncGifRows.bind(this);
    this.format.addEventListener("change", this.syncGifRows);
    this.syncGifRows();

    editor.onReset(() => this.reset());
  }

  getSettings() {
    return {
      format: this.format.value,
      rendering: this.rendering.value,
      duration: Number(this.gifDuration.value),
      frameRate: Number(this.gifFrameRate.value),
      repeat: Number(this.gifLoop.value)
    };
  }

  syncGifRows() {
    const hidden = this.format.value !== "gif";

    for (const row of this.gifRows) {
      row.classList.toggle("hidden", hidden);
    }
  }

  reset() {
    for (const control of [
      this.format,
      this.rendering,
      this.gifDuration,
      this.gifFrameRate,
      this.gifLoop
    ]) {
      const defaultIndex = Array.from(control.options).findIndex(
        option => option.defaultSelected
      );
      control.selectedIndex = defaultIndex >= 0 ? defaultIndex : 0;
    }

    this.syncGifRows();
  }
}

export class ExportController {
  constructor({ editor, media, options }) {
    this.editor = editor;
    this.media = media;
    this.options = options;
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
    this.saveButton.disabled = true;
    this.saveButton.textContent =
      settings.format === "gif" ? "Recording..." : "Saving...";

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      if (settings.format === "gif") {
        await this.saveGif(settings);
      } else {
        await this.savePng(settings);
      }
    } catch (error) {
      console.error(error);
      window.alert("The button could not be saved.");
    } finally {
      this.saveButton.disabled = false;
      this.saveButton.textContent = this.defaultButtonText;
    }
  }

  async savePng(settings) {
    const canvas = await this.captureButton(settings.rendering);
    const blob = await this.canvasToBlob(canvas, "image/png");
    this.downloadBlob(blob, "button.png");
  }

  async saveGif(settings) {
    await this.media.prepareGifExport();

    const encoder = GIFEncoder();
    const frameDelay = Math.max(
      20,
      Math.round(1000 / settings.frameRate)
    );
    const frameCount = Math.max(
      1,
      Math.round(settings.duration * settings.frameRate)
    );

    for (let frame = 0; frame < frameCount; frame += 1) {
      const canvas = await this.captureButton(
        settings.rendering,
        frame * frameDelay
      );
      const context = canvas.getContext("2d", {
        willReadFrequently: true
      });
      const rgba = context.getImageData(
        0,
        0,
        BUTTON_WIDTH,
        BUTTON_HEIGHT
      ).data;
      const palette = quantize(rgba, 256, {
        format: "rgba4444",
        oneBitAlpha: true
      });
      const indexedFrame = applyPalette(rgba, palette, "rgba4444");
      const transparentIndex = palette.findIndex(color => color[3] === 0);

      encoder.writeFrame(
        indexedFrame,
        BUTTON_WIDTH,
        BUTTON_HEIGHT,
        {
          palette,
          delay: frameDelay,
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

  async captureButton(rendering, animationTime = null) {
    const imageSnapshots = this.snapshotLayerImages(animationTime);
    const backgroundSource = document.getElementById(
      "background_animation_source"
    );
    const backgroundSnapshot = Number.isFinite(animationTime)
      ? this.media.getBackgroundAnimationFrame(animationTime) ||
        this.snapshotImage(backgroundSource)
      : this.snapshotImage(backgroundSource);
    const exportHost = this.createExportHost(
      imageSnapshots,
      backgroundSnapshot,
      rendering
    );

    try {
      await this.waitForImages(exportHost.button);

      const renderScale =
        rendering === "smooth" ? SMOOTH_RENDER_SCALE : 1;
      const renderedCanvas = await window.html2canvas(exportHost.button, {
        scale: renderScale,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        backgroundColor: null,
        logging: false
      });

      return this.normalizeCanvas(renderedCanvas, rendering);
    } finally {
      exportHost.host.remove();
    }
  }

  snapshotLayerImages(animationTime) {
    return Array.from(this.editor.button.querySelectorAll("img")).map(
      image => (
        Number.isFinite(animationTime)
          ? this.media.getLayerAnimationFrame(image, animationTime) ||
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

  createExportHost(imageSnapshots, backgroundSnapshot, rendering) {
    const host = document.createElement("div");
    const button = this.editor.button.cloneNode(true);
    const clonedImages = button.querySelectorAll("img");

    host.classList.add("export-host");
    button.style.position = "relative";
    button.style.left = "0";
    button.style.top = "0";
    button.style.transform = "none";
    button.style.overflow = "hidden";
    button.style.imageRendering =
      rendering === "pixelated" ? "pixelated" : "auto";
    button.classList.remove("is-dragging");

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

    host.appendChild(button);
    document.body.appendChild(host);
    return { host, button };
  }

  normalizeCanvas(renderedCanvas, rendering) {
    const canvas = document.createElement("canvas");
    canvas.width = BUTTON_WIDTH;
    canvas.height = BUTTON_HEIGHT;
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
      BUTTON_WIDTH,
      BUTTON_HEIGHT
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
