import { BUTTON_HEIGHT, BUTTON_WIDTH } from "./editor.js";
import { GifAnimation } from "./gif-animation.js";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png"
]);
const ANIMATION_RENDER_SCALE = 4;
const ANIMATION_MAX_WIDTH = BUTTON_WIDTH * ANIMATION_RENDER_SCALE;
const ANIMATION_MAX_HEIGHT = BUTTON_HEIGHT * ANIMATION_RENDER_SCALE;

export class MediaController {
  constructor({ editor }) {
    this.editor = editor;
    this.backgroundInput = document.getElementById("background_image");
    this.backgroundSize = document.getElementById("background_size");
    this.imageInput = document.getElementById("new_image");
    this.imageMode = document.getElementById("new_image_mode");
    this.imageHeight = document.getElementById("new_image_height");
    this.imageWidth = document.getElementById("new_image_width");
    this.imageControlRows = document.querySelectorAll(
      ".image-control-row"
    );
    this.activeImage = null;
    this.backgroundUrl = null;
    this.backgroundSource = null;
    this.backgroundFile = null;
    this.layerUrls = new Map();
    this.layerFiles = new Map();
    this.animations = new Map();
    this.animationPromises = new Map();
    this.pendingUrls = new Set();
    this.backgroundRequest = 0;
    this.imageRequest = 0;

    this.handleBackgroundUpload = this.handleBackgroundUpload.bind(this);
    this.handleImageUpload = this.handleImageUpload.bind(this);
    this.updateActiveImageDimensions =
      this.updateActiveImageDimensions.bind(this);
    this.updateActiveImageMode =
      this.updateActiveImageMode.bind(this);
    this.releaseAllUrls = this.releaseAllUrls.bind(this);

    this.backgroundInput.addEventListener(
      "change",
      this.handleBackgroundUpload
    );
    this.imageInput.addEventListener("change", this.handleImageUpload);
    this.imageMode.addEventListener("change", this.updateActiveImageMode);
    this.imageHeight.addEventListener(
      "input",
      this.updateActiveImageDimensions
    );
    this.imageWidth.addEventListener(
      "input",
      this.updateActiveImageDimensions
    );

    this.editor.onBeforeReset(() => this.prepareForReset());
    this.editor.onReset(() => this.resetControls());
    window.addEventListener("beforeunload", this.releaseAllUrls);
  }

  async handleBackgroundUpload(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    if (!this.isSupportedImage(file)) {
      this.reportInvalidFile(this.backgroundInput);
      return;
    }

    const request = ++this.backgroundRequest;
    const url = this.createPendingUrl(file);
    const probe = new Image();

    try {
      await this.loadImage(probe, url);

      if (request !== this.backgroundRequest) {
        this.releasePendingUrl(url);
        return;
      }

      this.releaseBackgroundUrl();
      this.pendingUrls.delete(url);
      this.backgroundUrl = url;
      this.backgroundSource = probe;
      this.backgroundFile = file;
      probe.id = "background_animation_source";
      probe.classList.add("export-animation-source");
      probe.alt = "";
      probe.draggable = false;
      probe.setAttribute("aria-hidden", "true");
      document.body.appendChild(probe);
      this.editor.button.style.background = `url("${url}")`;
      this.editor.button.style.backgroundSize = this.backgroundSize.value;
    } catch {
      this.releasePendingUrl(url);
      if (request === this.backgroundRequest) {
        this.reportInvalidFile(this.backgroundInput);
      }
    }
  }

  async handleImageUpload(event) {
    const file = event.target.files[0];

    if (!file) {
      return;
    }

    if (!this.isSupportedImage(file)) {
      this.reportInvalidFile(this.imageInput);
      return;
    }

    const request = ++this.imageRequest;
    const url = this.createPendingUrl(file);
    const image = document.createElement("img");
    image.alt = file.name;
    image.draggable = false;

    try {
      await this.loadImage(image, url);

      if (request !== this.imageRequest) {
        this.releasePendingUrl(url);
        return;
      }

      this.pendingUrls.delete(url);
      this.layerUrls.set(image, url);
      this.layerFiles.set(image, file);
      this.prepareImageDimensions(image);
      this.applyImageDimensions(image);
      this.editor.addLayer(image, {
        type: "image",
        animationClass: "glow_box"
      });
      this.editor.registerLayerCleanup(image, () => {
        this.releaseLayerUrl(image);
      });
      this.setActiveImage(image);
      this.imageInput.value = "";
    } catch {
      this.releasePendingUrl(url);
      if (request === this.imageRequest) {
        this.reportInvalidFile(this.imageInput);
      }
    }
  }

  updateActiveImageDimensions(event) {
    if (this.activeImage && this.activeImage.isConnected) {
      if (this.imageMode.value === "proportional") {
        const changedDimension =
          event.currentTarget === this.imageHeight ? "height" : "width";
        this.keepImageProportional(
          this.activeImage,
          changedDimension
        );
      }
      this.applyImageDimensions(this.activeImage);
    }
  }

  updateActiveImageMode() {
    if (!this.activeImage || !this.activeImage.isConnected) {
      return;
    }

    if (this.imageMode.value === "proportional") {
      this.keepImageProportional(this.activeImage, "width");
    }

    this.applyImageDimensions(this.activeImage);
  }

  prepareImageDimensions(image) {
    const defaultMode = Array.from(this.imageMode.options).find(
      option => option.defaultSelected
    );
    const ratio =
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : 1;
    const dimensions = this.fitWithinBounds(ratio);

    this.imageMode.value = defaultMode ? defaultMode.value : "proportional";
    image.dataset.aspectRatio = String(ratio);
    this.imageWidth.value = String(dimensions.width);
    this.imageHeight.value = String(dimensions.height);
  }

  applyImageDimensions(image) {
    image.style.height = `${this.readDimension(this.imageHeight)}px`;
    image.style.width = `${this.readDimension(this.imageWidth)}px`;
    image.dataset.resizeMode = this.imageMode.value;

    switch (this.imageMode.value) {
      case "crop":
        image.style.objectFit = "cover";
        break;
      case "free":
        image.style.objectFit = "fill";
        break;
      default:
        image.style.objectFit = "contain";
        break;
    }
  }

  keepImageProportional(image, changedDimension) {
    const ratio = Number(image.dataset.aspectRatio) || 1;
    let width = this.readDimension(this.imageWidth);
    let height = this.readDimension(this.imageHeight);

    if (changedDimension === "height") {
      width = Math.max(1, Math.round(height * ratio));
    } else {
      height = Math.max(1, Math.round(width / ratio));
    }

    const maximumWidth = Number(this.imageWidth.max);
    const maximumHeight = Number(this.imageHeight.max);
    const reduction = Math.min(
      1,
      maximumWidth / width,
      maximumHeight / height
    );

    this.imageWidth.value = String(
      Math.max(1, Math.round(width * reduction))
    );
    this.imageHeight.value = String(
      Math.max(1, Math.round(height * reduction))
    );
  }

  fitWithinBounds(ratio) {
    const maximumWidth = Number(this.imageWidth.max);
    const maximumHeight = Number(this.imageHeight.max);
    let width = maximumWidth;
    let height = Math.round(width / ratio);

    if (height > maximumHeight) {
      height = maximumHeight;
      width = Math.round(height * ratio);
    }

    return {
      width: Math.max(1, Math.min(maximumWidth, width)),
      height: Math.max(1, Math.min(maximumHeight, height))
    };
  }

  setActiveImage(image) {
    if (this.activeImage) {
      this.activeImage.classList.remove("active_img");
    }

    this.activeImage = image;
    image.classList.add("active_img");
    this.setImageControlsHidden(false);
  }

  clearBackgroundImage() {
    this.backgroundRequest += 1;
    this.releaseBackgroundUrl();
    this.backgroundInput.value = "";
  }

  async prepareGifExport() {
    const animationTasks = [];

    if (this.isGifFile(this.backgroundFile)) {
      animationTasks.push(this.ensureAnimation(this.backgroundFile));
    }

    for (const image of this.editor.button.querySelectorAll("img")) {
      const file = this.layerFiles.get(image);

      if (this.isGifFile(file)) {
        animationTasks.push(this.ensureAnimation(file));
      }
    }

    await Promise.all(animationTasks);
  }

  getBackgroundAnimationFrame(timeMs) {
    return this.getAnimationFrame(this.backgroundFile, timeMs);
  }

  getLayerAnimationFrame(image, timeMs) {
    return this.getAnimationFrame(this.layerFiles.get(image), timeMs);
  }

  prepareForReset() {
    this.backgroundRequest += 1;
    this.imageRequest += 1;
    this.releaseBackgroundUrl();

    for (const url of this.pendingUrls) {
      URL.revokeObjectURL(url);
    }
    this.pendingUrls.clear();
  }

  resetControls() {
    this.backgroundInput.value = "";
    this.imageInput.value = "";
    this.imageMode.value = Array.from(this.imageMode.options).find(
      option => option.defaultSelected
    )?.value || "proportional";
    this.imageHeight.value = this.imageHeight.defaultValue;
    this.imageWidth.value = this.imageWidth.defaultValue;
    this.activeImage = null;
    this.setImageControlsHidden(true);
  }

  releaseLayerUrl(image) {
    const url = this.layerUrls.get(image);
    const file = this.layerFiles.get(image);

    if (url) {
      URL.revokeObjectURL(url);
      this.layerUrls.delete(image);
    }

    if (file) {
      this.releaseAnimation(file);
      this.layerFiles.delete(image);
    }

    if (this.activeImage === image) {
      this.activeImage = null;
      this.setImageControlsHidden(true);
    }
  }

  releaseBackgroundUrl() {
    if (this.backgroundSource) {
      this.backgroundSource.remove();
      this.backgroundSource = null;
    }

    if (this.backgroundUrl) {
      URL.revokeObjectURL(this.backgroundUrl);
      this.backgroundUrl = null;
    }

    if (this.backgroundFile) {
      this.releaseAnimation(this.backgroundFile);
      this.backgroundFile = null;
    }
  }

  releaseAllUrls() {
    this.releaseBackgroundUrl();

    for (const url of this.layerUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.layerUrls.clear();
    this.layerFiles.clear();
    this.animations.clear();
    this.animationPromises.clear();

    for (const url of this.pendingUrls) {
      URL.revokeObjectURL(url);
    }
    this.pendingUrls.clear();
  }

  createPendingUrl(file) {
    const url = URL.createObjectURL(file);
    this.pendingUrls.add(url);
    return url;
  }

  releasePendingUrl(url) {
    if (this.pendingUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.pendingUrls.delete(url);
    }
  }

  loadImage(image, url) {
    return new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
      image.src = url;
    });
  }

  isSupportedImage(file) {
    return (
      SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()) ||
      /\.(gif|jpe?g|png)$/i.test(file.name)
    );
  }

  isGifFile(file) {
    return Boolean(
      file &&
      (
        file.type.toLowerCase() === "image/gif" ||
        /\.gif$/i.test(file.name)
      )
    );
  }

  async ensureAnimation(file) {
    if (this.animations.has(file)) {
      return this.animations.get(file);
    }

    if (this.animationPromises.has(file)) {
      return this.animationPromises.get(file);
    }

    const animationPromise = GifAnimation.fromFile(
      file,
      ANIMATION_MAX_WIDTH,
      ANIMATION_MAX_HEIGHT
    );
    this.animationPromises.set(file, animationPromise);

    try {
      const animation = await animationPromise;

      if (this.animationPromises.get(file) === animationPromise) {
        this.animations.set(file, animation);
      }

      return animation;
    } finally {
      if (this.animationPromises.get(file) === animationPromise) {
        this.animationPromises.delete(file);
      }
    }
  }

  getAnimationFrame(file, timeMs) {
    if (!this.isGifFile(file)) {
      return null;
    }

    return this.animations.get(file)?.getFrameAt(timeMs) || null;
  }

  releaseAnimation(file) {
    this.animations.delete(file);
    this.animationPromises.delete(file);
  }

  reportInvalidFile(input) {
    input.value = "";
    input.setCustomValidity("Choose a PNG, JPEG, or GIF image.");
    input.reportValidity();
    window.setTimeout(() => input.setCustomValidity(""), 0);
  }

  readDimension(input) {
    const minimum = Number(input.min);
    const maximum = Number(input.max);
    const value = Number(input.value);

    const dimension = Math.min(
      maximum,
      Math.max(minimum, value || minimum)
    );
    input.value = String(dimension);
    return dimension;
  }

  setImageControlsHidden(hidden) {
    for (const row of this.imageControlRows) {
      row.classList.toggle("hidden", hidden);
    }
  }
}
