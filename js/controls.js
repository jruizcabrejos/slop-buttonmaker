import { BUTTON_HEIGHT, BUTTON_WIDTH } from "./editor.js";
import { parseVisualCss } from "./css-background.js";

const DEFAULT_PREVIEW_TEXT = "Sphynx of black quartz, judge my vow";
const BUTTON_EFFECTS = new Set([
  "none",
  "glitch",
  "distortion",
  "shimmer",
  "rotate"
]);
const TEXT_EFFECTS = new Set([
  "none",
  "bounce",
  "glow",
  "fly-in",
  "blink",
  "letter-sweep",
  "wave"
]);
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
const CLASSIC_BORDER_COLOR = "#c0c0c0";
const CLASSIC_BORDER_WIDTH = 2;
const DEFAULT_BORDER_COLOR = "#808080";
const PROJECT_CONTROL_IDS = [
  "background_color",
  "border_color",
  "border_width",
  "border_style",
  "border_radius",
  "background_size",
  "background_gradient",
  "button_effect",
  "button_effect_speed",
  "button_effect_color"
];

export class ControlsController {
  constructor({ editor, media }) {
    this.editor = editor;
    this.media = media;
    this.tabButtons = document.querySelectorAll(".menu-tab");
    this.panels = document.querySelectorAll(".menu[data-panel]");
    this.backgroundColor = document.getElementById("background_color");
    this.backgroundDefault = document.getElementById(
      "background_default"
    );
    this.backgroundTransparent = document.getElementById(
      "background_transparent"
    );
    this.borderColor = document.getElementById("border_color");
    this.borderWidth = document.getElementById("border_width");
    this.borderStyle = document.getElementById("border_style");
    this.borderRadius = document.getElementById("border_radius");
    this.borderDefault = document.getElementById("border_default");
    this.borderTransparent = document.getElementById(
      "border_transparent"
    );
    this.fontTransparent = document.getElementById("font_transparent");
    this.buttonEffect = document.getElementById("button_effect");
    this.buttonEffectSpeed = document.getElementById(
      "button_effect_speed"
    );
    this.buttonEffectColor = document.getElementById(
      "button_effect_color"
    );
    this.buttonEffectSpeedOptions = document.getElementById(
      "button_effect_speed_options"
    );
    this.buttonEffectColorOptions = document.getElementById(
      "button_effect_color_options"
    );
    this.textEffect = document.getElementById("text_effect");
    this.textEffectEpoch = performance.now();
    this.cssBackgroundVisual = {};
    this.textSpeedOptions = document.getElementById(
      "text_speed_options"
    );
    this.textMotionOptions = document.getElementById(
      "text_motion_options"
    );
    this.textColorEffectOptions = document.getElementById(
      "text_color_effect_options"
    );
    this.baseControls = [
      this.backgroundColor,
      this.borderColor,
      this.borderWidth,
      this.borderStyle,
      this.borderRadius,
      document.getElementById("background_size"),
      document.getElementById("background_gradient"),
      this.buttonEffect,
      this.buttonEffectSpeed,
      this.buttonEffectColor
    ];
    this.textForm = document.querySelector("section.text form");
    this.textControls = this.textForm.querySelectorAll(
      "textarea, input, select"
    );
    this.fontPreview = document.querySelector("#font_preview .message");
    this.detailButtons = document.querySelectorAll(".detail-option");

    this.handleBaseControl = this.handleBaseControl.bind(this);
    this.handleTabKeydown = this.handleTabKeydown.bind(this);
    this.applyDefaultBackground =
      this.applyDefaultBackground.bind(this);
    this.applyDefaultBorder = this.applyDefaultBorder.bind(this);
    this.toggleBackgroundTransparency =
      this.toggleBackgroundTransparency.bind(this);
    this.toggleBorderTransparency =
      this.toggleBorderTransparency.bind(this);
    this.toggleFontTransparency =
      this.toggleFontTransparency.bind(this);
    this.syncTextEffectOptions =
      this.syncTextEffectOptions.bind(this);
    this.syncButtonEffectOptions =
      this.syncButtonEffectOptions.bind(this);
    this.previewFont = this.previewFont.bind(this);
    this.drawText = this.drawText.bind(this);

    this.bindTabs();
    this.bindBaseControls();
    this.bindTextControls();
    this.bindDetails();
    this.backgroundDefault.addEventListener(
      "click",
      this.applyDefaultBackground
    );
    this.borderDefault.addEventListener("click", this.applyDefaultBorder);
    this.backgroundTransparent.addEventListener(
      "click",
      this.toggleBackgroundTransparency
    );
    this.borderTransparent.addEventListener(
      "click",
      this.toggleBorderTransparency
    );
    this.fontTransparent.addEventListener(
      "click",
      this.toggleFontTransparency
    );
    this.textEffect.addEventListener(
      "change",
      this.syncTextEffectOptions
    );
    this.backgroundColor.addEventListener("input", () => {
      this.setTransparentState(this.backgroundTransparent, false);
    });
    document.getElementById("font_color").addEventListener("input", () => {
      this.setTransparentState(this.fontTransparent, false);
    });
    this.media.backgroundInput.addEventListener("change", () => {
      this.setTransparentState(this.backgroundTransparent, false);
    });
    this.applyBaseDefaults();
    this.syncTextEffectOptions();
    this.previewFont();
    this.activateTab("base");

    this.editor.onReset(() => this.reset());
  }

  bindTabs() {
    for (const button of this.tabButtons) {
      button.addEventListener("click", () => {
        this.activateTab(button.dataset.value);
      });
      button.addEventListener("keydown", this.handleTabKeydown);
    }
  }

  handleTabKeydown(event) {
    const currentIndex = Array.from(this.tabButtons).indexOf(
      event.currentTarget
    );
    let nextIndex;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % this.tabButtons.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex =
          (currentIndex - 1 + this.tabButtons.length) %
          this.tabButtons.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = this.tabButtons.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = this.tabButtons[nextIndex];
    this.activateTab(nextTab.dataset.value);
    nextTab.focus();
  }

  bindBaseControls() {
    for (const control of this.baseControls) {
      const eventName =
        control.matches("select") ? "change" : "input";
      control.addEventListener(eventName, this.handleBaseControl);
    }
  }

  bindTextControls() {
    for (const control of this.textControls) {
      control.addEventListener("input", this.previewFont);
      control.addEventListener("change", this.previewFont);
    }

    this.textForm.addEventListener("submit", this.drawText);
  }

  bindDetails() {
    for (const button of this.detailButtons) {
      button.addEventListener("click", () => this.addDetail(button));
    }
  }

  async addDetail(button) {
    const source = button.querySelector("img");
    let layer = null;

    if (button.dataset.mediaAsset === "true") {
      try {
        const response = await fetch(source.currentSrc || source.src);

        if (!response.ok) {
          throw new Error(`Asset request failed: ${response.status}`);
        }

        const blob = await response.blob();
        const pathname = new URL(source.currentSrc || source.src).pathname;
        const filename =
          decodeURIComponent(pathname.split("/").at(-1)) ||
          source.alt ||
          "asset";
        const file = new File(
          [blob],
          filename,
          { type: blob.type || "image/gif" }
        );
        layer = await this.media.addImageFile(
          file,
          null,
          { type: "detail" }
        );
      } catch (error) {
        console.warn("The built-in asset could not be loaded.", error);
      }
    } else {
      const image = source.cloneNode(true);
      image.draggable = false;
      layer = this.editor.addLayer(image, {
        type: "detail",
        animationClass: "glow_box"
      });
    }

    if (layer && button.dataset.sessionCredit) {
      document.getElementById(button.dataset.sessionCredit).hidden = false;
    }
  }

  handleBaseControl(event) {
    const control = event.currentTarget;

    switch (control.id) {
      case "background_color":
        this.media.clearBackgroundImage();
        this.editor.button.style.background = control.value;
        this.applyBackgroundSizing();
        break;
      case "background_gradient":
        if (this.applyBackgroundValue(control.value, control)) {
          this.setTransparentState(this.backgroundTransparent, false);
          this.applyBackgroundSizing();
        }
        break;
      case "background_size":
        this.applyBackgroundSizing();
        break;
      case "border_width":
      case "border_radius":
        this.applyBorderAppearance();
        break;
      case "border_color":
        this.setTransparentState(this.borderTransparent, false);
        this.applyBorderAppearance();
        break;
      case "border_style":
        this.applyBorderAppearance();
        break;
      case "button_effect":
        this.syncButtonEffectOptions();
        this.applyButtonEffect(control.value);
        break;
      case "button_effect_speed":
      case "button_effect_color":
        this.applyButtonEffect(this.buttonEffect.value);
        break;
      default:
        break;
    }
  }

  applyDefaultBackground() {
    this.backgroundColor.value = this.backgroundColor.defaultValue;
    this.setTransparentState(this.backgroundTransparent, false);
    this.media.clearBackgroundImage();
    this.editor.button.style.background = this.backgroundColor.value;
    this.applyBackgroundSizing();
  }

  applyDefaultBorder() {
    this.borderColor.value = DEFAULT_BORDER_COLOR;
    this.setTransparentState(this.borderTransparent, false);
    this.applyBorderAppearance();
  }

  toggleBackgroundTransparency() {
    const active = !this.isTransparent(this.backgroundTransparent);
    this.setTransparentState(this.backgroundTransparent, active);
    this.media.clearBackgroundImage();
    this.editor.button.style.background = active
      ? "transparent"
      : this.backgroundColor.value;
    this.applyBackgroundSizing();
  }

  toggleFontTransparency() {
    const active = !this.isTransparent(this.fontTransparent);
    this.setTransparentState(this.fontTransparent, active);
    this.previewFont();
  }

  toggleBorderTransparency() {
    const active = !this.isTransparent(this.borderTransparent);
    this.setTransparentState(this.borderTransparent, active);
    this.applyBorderAppearance();
  }

  setTransparentState(button, active) {
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  isTransparent(button) {
    return button.getAttribute("aria-pressed") === "true";
  }

  applyButtonEffect(effect) {
    const safeEffect = BUTTON_EFFECTS.has(effect) ? effect : "none";
    const speed = Object.hasOwn(
      BUTTON_EFFECT_SPEED_FACTORS,
      this.buttonEffectSpeed.value
    )
      ? this.buttonEffectSpeed.value
      : "normal";
    const color = /^#[0-9a-f]{6}$/i.test(this.buttonEffectColor.value)
      ? this.buttonEffectColor.value
      : "#ffffff";
    const speedFactor = BUTTON_EFFECT_SPEED_FACTORS[speed];
    const duration = Math.round(
      (BUTTON_EFFECT_DURATIONS[safeEffect] || 1200) * speedFactor
    );

    for (const name of BUTTON_EFFECTS) {
      if (name !== "none") {
        this.editor.button.classList.remove(`button-effect-${name}`);
      }
    }

    this.editor.button.dataset.buttonEffect = safeEffect;
    this.editor.button.dataset.buttonEffectSpeed = speed;
    this.editor.button.dataset.buttonEffectColor = color;
    this.editor.button.style.setProperty(
      "--button-effect-duration",
      `${duration}ms`
    );
    this.editor.button.style.setProperty(
      "--button-effect-overlay-duration",
      `${Math.round(240 * speedFactor)}ms`
    );
    this.editor.button.style.setProperty(
      "--button-effect-color-strong",
      this.hexToRgba(color, 0.72)
    );
    this.editor.button.style.setProperty(
      "--button-effect-color-soft",
      this.hexToRgba(color, 0.25)
    );

    if (safeEffect !== "none") {
      this.editor.button.classList.add(`button-effect-${safeEffect}`);
    }
  }

  syncButtonEffectOptions() {
    const effect = this.buttonEffect.value;
    this.buttonEffectSpeedOptions.classList.toggle(
      "hidden",
      effect === "none"
    );
    this.buttonEffectColorOptions.classList.toggle(
      "hidden",
      effect !== "shimmer"
    );
  }

  hexToRgba(color, alpha) {
    const channels = color.match(/[0-9a-f]{2}/gi)?.map(value => (
      Number.parseInt(value, 16)
    ));

    return channels
      ? `rgba(${channels.join(", ")}, ${alpha})`
      : `rgba(255, 255, 255, ${alpha})`;
  }

  applyBackgroundValue(value, input = null, options = {}) {
    const visual = parseVisualCss(value);

    if (!visual) {
      input?.setCustomValidity(
        "Enter a background value, CSS declarations, or a CSS rule."
      );
      return false;
    }

    input?.setCustomValidity("");
    this.media.clearBackgroundImage();
    this.cssBackgroundVisual = visual.empty ? {} : visual;
    this.editor.button.style.background = visual.background || "";
    this.editor.button.style.backgroundClip =
      visual.backgroundClip || "";
    this.editor.button.style.imageRendering =
      visual.imageRendering || "";

    if (!visual.empty && options.syncControls !== false) {
      this.syncCssVisualControls(visual);
    }

    this.applyBorderAppearance();
    return true;
  }

  syncCssVisualControls(visual) {
    const radius = this.readCssPixels(visual.borderRadius);

    if (radius !== null) {
      this.borderRadius.value = String(this.clampControlValue(
        this.borderRadius,
        radius
      ));
    }

    const width = this.readCssPixels(visual.borderWidth);

    if (width !== null) {
      this.borderWidth.value = String(this.clampControlValue(
        this.borderWidth,
        width
      ));
    }

    const borderStyle = visual.borderStyle?.match(
      /(?:^|\s)(solid|outset|inset|dashed|dotted)(?:\s|$)/i
    )?.[1]?.toLowerCase();

    if (borderStyle) {
      this.borderStyle.value = borderStyle;
    }

    const borderColor = this.normalizeCssColor(visual.borderColor);

    if (borderColor?.transparent) {
      this.setTransparentState(this.borderTransparent, true);
    } else if (borderColor?.hex) {
      this.borderColor.value = borderColor.hex;
      this.setTransparentState(this.borderTransparent, false);
    }
  }

  readCssPixels(value) {
    if (!value || (!value.endsWith("px") && value !== "0")) {
      return null;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  clampControlValue(control, value) {
    const minimum = Number(control.min);
    const maximum = Number(control.max);
    return Math.min(
      Number.isFinite(maximum) ? maximum : value,
      Math.max(Number.isFinite(minimum) ? minimum : value, value)
    );
  }

  normalizeCssColor(value) {
    if (!value) {
      return null;
    }

    const colorStyle = document.createElement("div").style;
    colorStyle.color = value;

    if (!colorStyle.color) {
      return null;
    }

    const context = document.createElement("canvas").getContext("2d");
    context.fillStyle = colorStyle.color;
    const normalized = context.fillStyle;

    if (/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(normalized)) {
      return { transparent: true };
    }

    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
      return { hex: normalized };
    }

    if (/^#[0-9a-f]{3}$/i.test(normalized)) {
      return {
        hex: `#${Array.from(normalized.slice(1))
          .map(channel => channel.repeat(2))
          .join("")}`
      };
    }

    const channels = normalized.match(
      /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i
    );

    if (!channels) {
      return null;
    }

    return {
      hex: `#${channels.slice(1, 4).map(channel => (
        Math.round(Number(channel)).toString(16).padStart(2, "0")
      )).join("")}`
    };
  }

  applyBaseDefaults() {
    const gradient = document.getElementById("background_gradient");

    if (!this.applyBackgroundValue(gradient.value, gradient)) {
      this.editor.button.style.background = this.backgroundColor.value;
      this.applyBorderAppearance();
    }
    this.applyBackgroundSizing();
    this.applyButtonEffect(this.buttonEffect.value);
    this.syncButtonEffectOptions();
  }

  applyBackgroundSizing() {
    const size = document.getElementById("background_size").value;
    this.editor.button.style.backgroundSize = size;
    this.editor.button.style.backgroundRepeat =
      size === "contain" ? "repeat" : "no-repeat";
  }

  applyBorderAppearance() {
    const borderWidth = Number(this.borderWidth.value);
    const safeWidth = Math.max(
      0,
      Math.min(15, Number.isFinite(borderWidth) ? borderWidth : 0)
    );
    const borderStyle = this.borderStyle.value;
    const borderColor = this.borderColor.value;
    const borderRadius = Number(this.borderRadius.value);
    const safeRadius = Math.max(
      0,
      Math.min(44, Number.isFinite(borderRadius) ? borderRadius : 0)
    );
    const transparent = this.isTransparent(this.borderTransparent);
    const borderImageSource =
      this.cssBackgroundVisual.borderImageSource || "none";
    const customBorderImage = borderImageSource !== "none";
    const bevel = ["inset", "outset"].includes(borderStyle);
    const classic =
      !transparent &&
      safeWidth === CLASSIC_BORDER_WIDTH &&
      borderColor.toLowerCase() === CLASSIC_BORDER_COLOR;
    const classicOutset =
      classic && borderStyle === "outset" && !customBorderImage;
    const light = transparent
      ? "rgba(255, 255, 255, 0.55)"
      : classic
        ? "#ffffff"
        : this.mixBorderColor(borderColor, 255, 0.65);
    const dark = transparent
      ? "rgba(0, 0, 0, 0.45)"
      : classic
        ? "#000000"
        : this.mixBorderColor(borderColor, 0, 0.65);
    const bevelColors = borderStyle === "inset"
      ? `${dark} ${light} ${light} ${dark}`
      : `${light} ${dark} ${dark} ${light}`;

    this.editor.button.style.borderWidth = `${safeWidth}px`;
    this.editor.button.style.borderStyle = borderStyle;
    this.editor.button.style.borderColor = "transparent";
    this.editor.button.style.borderRadius = `${safeRadius}px`;
    this.editor.button.style.width =
      `${BUTTON_WIDTH - 2 * safeWidth}px`;
    this.editor.button.style.height =
      `${BUTTON_HEIGHT - 2 * safeWidth}px`;
    this.editor.borderLayer.classList.toggle(
      "button-border-classic",
      classicOutset
    );

    Object.assign(this.editor.borderLayer.style, {
      borderColor: classicOutset
        ? "transparent"
        : bevel
          ? bevelColors
          : transparent
            ? "transparent"
            : borderColor,
      borderStyle: classicOutset
        ? "none"
        : bevel
          ? "solid"
          : borderStyle,
      borderWidth: classicOutset ? "0" : `${safeWidth}px`,
      borderRadius: `${safeRadius}px`,
      borderImageSource,
      borderImageSlice:
        this.cssBackgroundVisual.borderImageSlice || "",
      borderImageWidth:
        this.cssBackgroundVisual.borderImageWidth || "",
      borderImageOutset:
        this.cssBackgroundVisual.borderImageOutset || "",
      borderImageRepeat:
        this.cssBackgroundVisual.borderImageRepeat || "",
      boxSizing: "border-box",
      clipPath: safeRadius > 0
        ? `inset(0 round ${safeRadius}px)`
        : "none",
      height: `${BUTTON_HEIGHT}px`,
      left: `${-safeWidth}px`,
      top: `${-safeWidth}px`,
      width: `${BUTTON_WIDTH}px`
    });
  }

  mixBorderColor(color, target, amount) {
    const channels = color.match(/[0-9a-f]{2}/gi)?.map(value => (
      Number.parseInt(value, 16)
    ));

    if (!channels || channels.length !== 3) {
      return color;
    }

    return `#${channels.map(channel => (
      Math.round(channel + (target - channel) * amount)
        .toString(16)
        .padStart(2, "0")
    )).join("")}`;
  }

  drawText(event) {
    event.preventDefault();

    const text = document.createElement("div");
    text.classList.add("text-layer");
    this.applyTextAttributes(text, this.getTextProperties());
    this.editor.addLayer(text, { type: "text" });
  }

  previewFont() {
    this.applyTextAttributes(
      this.fontPreview,
      this.getTextProperties()
    );
  }

  getTextProperties() {
    return {
      content: document.getElementById("text_content").value,
      family: document.getElementById("font_family").value,
      decoration: document.getElementById("text_decoration").value,
      style: document.getElementById("font_style").value,
      weight: document.getElementById("font_weight").value,
      size: `${document.getElementById("font_size").value}pt`,
      color: this.isTransparent(this.fontTransparent)
        ? "transparent"
        : document.getElementById("font_color").value,
      align: document.getElementById("text_align").value,
      effect: this.textEffect.value,
      effectColor: document.getElementById("text_effect_color").value,
      effectDirection:
        document.getElementById("text_effect_direction").value,
      effectSpeed: document.getElementById("text_effect_speed").value
    };
  }

  applyTextAttributes(text, properties) {
    text.style.fontFamily = properties.family;
    text.style.fontSize = properties.size;
    text.style.fontStyle = properties.style;
    text.style.fontWeight = properties.weight;
    text.style.textAlign = properties.align;
    text.style.textDecoration = properties.decoration;
    text.style.color = properties.color;
    text.textContent = properties.content || DEFAULT_PREVIEW_TEXT;
    this.applyTextEffect(text, properties.effect, {
      color: properties.effectColor,
      direction: properties.effectDirection,
      primaryColor: properties.color,
      speed: properties.effectSpeed
    });
  }

  applyTextEffect(text, effect, options = {}) {
    const safeEffect = TEXT_EFFECTS.has(effect) ? effect : "none";
    const direction = options.direction === "right-to-left"
      ? "right-to-left"
      : "left-to-right";
    const speed = Object.hasOwn(TEXT_EFFECT_DURATIONS, options.speed)
      ? options.speed
      : "normal";
    const effectColor = /^#[0-9a-f]{6}$/i.test(options.color)
      ? options.color
      : "#ffffff";
    const primaryColor = options.primaryColor || text.style.color || "#000";

    for (const name of TEXT_EFFECTS) {
      if (name !== "none") {
        text.classList.remove(`text-effect-${name}`);
      }
    }

    text.dataset.textEffect = safeEffect;
    text.dataset.textEffectColor = effectColor;
    text.dataset.textEffectDirection = direction;
    text.dataset.textEffectSpeed = speed;
    text.dataset.textPrimaryColor = primaryColor;
    text.style.setProperty("--text-effect-color", effectColor);
    text.style.setProperty("--text-primary-color", primaryColor);
    text.style.setProperty(
      "--text-effect-duration",
      `${TEXT_EFFECT_DURATIONS[speed]}ms`
    );
    text.style.setProperty(
      "--text-effect-delay",
      `${-(performance.now() - this.textEffectEpoch).toFixed(3)}ms`
    );

    if (safeEffect !== "none") {
      text.classList.add(`text-effect-${safeEffect}`);
    }

    if (["letter-sweep", "wave"].includes(safeEffect)) {
      this.wrapTextLetters(text);
    }
  }

  wrapTextLetters(text) {
    const content = text.textContent;
    const fragment = document.createDocumentFragment();
    let letterIndex = 0;

    Array.from(content).forEach(character => {
      if (character === "\n") {
        fragment.appendChild(document.createTextNode(character));
        return;
      }

      const letter = document.createElement("span");
      letter.className = "text-effect-letter";
      letter.style.setProperty("--letter-index", String(letterIndex));
      letter.style.textDecoration = text.style.textDecoration;
      letter.textContent = character;
      fragment.appendChild(letter);
      letterIndex += 1;
    });

    text.replaceChildren(fragment);
  }

  syncTextEffectOptions() {
    const effect = this.textEffect.value;
    this.textSpeedOptions.classList.toggle(
      "hidden",
      effect === "none"
    );
    this.textMotionOptions.classList.toggle(
      "hidden",
      effect !== "fly-in"
    );
    this.textColorEffectOptions.classList.toggle(
      "hidden",
      !["blink", "letter-sweep"].includes(effect)
    );
  }

  getProjectState() {
    const controls = {};

    for (const id of PROJECT_CONTROL_IDS) {
      controls[id] = document.getElementById(id).value;
    }

    return {
      controls,
      background: this.media.getBackgroundFile()
        ? null
        : this.editor.button.style.background,
      backgroundTransparent:
        this.isTransparent(this.backgroundTransparent),
      borderTransparent:
        this.isTransparent(this.borderTransparent),
      position: {
        left: this.readPosition(this.editor.button.style.left),
        top: this.readPosition(this.editor.button.style.top)
      }
    };
  }

  applyProjectState(state) {
    const values = state?.controls || {};

    for (const id of PROJECT_CONTROL_IDS) {
      const control = document.getElementById(id);
      const storedValue = values[id];
      const value =
        id === "background_size" && storedValue === "auto"
          ? "contain"
          : storedValue;

      if (typeof value !== "string") {
        continue;
      }

      if (
        control instanceof HTMLSelectElement &&
        !Array.from(control.options).some(option => option.value === value)
      ) {
        continue;
      }

      if (
        control.type === "color" &&
        !/^#[0-9a-f]{6}$/i.test(value)
      ) {
        continue;
      }

      if (control.type === "number") {
        const numericValue = Number(value);
        const minimum = Number(control.min);
        const maximum = Number(control.max);

        if (!Number.isFinite(numericValue)) {
          continue;
        }

        control.value = String(Math.min(
          Number.isFinite(maximum) ? maximum : numericValue,
          Math.max(
            Number.isFinite(minimum) ? minimum : numericValue,
            numericValue
          )
        ));
      } else {
        control.value = value;
      }
    }

    this.setTransparentState(
      this.borderTransparent,
      Boolean(state?.borderTransparent)
    );
    const cssInput = document.getElementById("background_gradient");
    this.applyBackgroundValue(
      cssInput.value,
      cssInput,
      { syncControls: false }
    );
    this.applyBorderAppearance();
    this.applyButtonEffect(this.buttonEffect.value);
    this.syncButtonEffectOptions();

    if (typeof state?.background === "string") {
      this.media.clearBackgroundImage();
      this.editor.button.style.background = state.background;
    }
    this.applyBackgroundSizing();
    const transparent = Boolean(state?.backgroundTransparent);
    this.setTransparentState(this.backgroundTransparent, transparent);

    if (transparent) {
      this.media.clearBackgroundImage();
      this.editor.button.style.background = "transparent";
    }

    const left = Number(state?.position?.left);
    const top = Number(state?.position?.top);
    this.editor.button.style.left = `${Number.isFinite(left) ? left : 0}px`;
    this.editor.button.style.top = `${Number.isFinite(top) ? top : 0}px`;
  }

  readPosition(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  activateTab(name) {
    for (const button of this.tabButtons) {
      const isActive = button.dataset.value === name;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    }

    for (const panel of this.panels) {
      const isActive = panel.dataset.panel === name;
      panel.classList.toggle("visible", isActive);
      panel.setAttribute("aria-hidden", String(!isActive));
    }

  }

  reset() {
    this.textEffectEpoch = performance.now();
    for (const control of this.baseControls) {
      this.resetControl(control);
    }

    this.textForm.reset();
    this.setTransparentState(this.backgroundTransparent, false);
    this.setTransparentState(this.borderTransparent, false);
    this.setTransparentState(this.fontTransparent, false);
    this.applyBaseDefaults();
    this.syncTextEffectOptions();
    this.previewFont();
    this.activateTab("base");
  }

  resetControl(control) {
    if (control.matches("select")) {
      const defaultIndex = Array.from(control.options).findIndex(
        option => option.defaultSelected
      );
      control.selectedIndex = defaultIndex >= 0 ? defaultIndex : 0;
    } else {
      control.value = control.defaultValue;
    }
  }
}
