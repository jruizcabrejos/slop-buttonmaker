import { BUTTON_HEIGHT, BUTTON_WIDTH } from "./editor.js";

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
const PROJECT_CONTROL_IDS = [
  "background_color",
  "border_color",
  "border_width",
  "border_style",
  "background_size",
  "background_gradient",
  "button_effect"
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
    this.fontTransparent = document.getElementById("font_transparent");
    this.buttonEffect = document.getElementById("button_effect");
    this.textEffect = document.getElementById("text_effect");
    this.textMotionOptions = document.getElementById(
      "text_motion_options"
    );
    this.textColorEffectOptions = document.getElementById(
      "text_color_effect_options"
    );
    this.baseControls = [
      this.backgroundColor,
      document.getElementById("border_color"),
      document.getElementById("border_width"),
      document.getElementById("border_style"),
      document.getElementById("background_size"),
      document.getElementById("background_gradient"),
      this.buttonEffect
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
    this.toggleBackgroundTransparency =
      this.toggleBackgroundTransparency.bind(this);
    this.toggleFontTransparency =
      this.toggleFontTransparency.bind(this);
    this.syncTextEffectOptions =
      this.syncTextEffectOptions.bind(this);
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
    this.backgroundTransparent.addEventListener(
      "click",
      this.toggleBackgroundTransparency
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
      button.addEventListener("click", () => {
        const image = button.querySelector("img").cloneNode(true);
        image.draggable = false;
        this.editor.addLayer(image, {
          type: "detail",
          animationClass: "glow_box"
        });
      });
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
        this.applyBorderAppearance();
        break;
      case "border_color":
        this.applyBorderAppearance();
        break;
      case "border_style":
        this.applyBorderAppearance();
        break;
      case "button_effect":
        this.applyButtonEffect(control.value);
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

  setTransparentState(button, active) {
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  isTransparent(button) {
    return button.getAttribute("aria-pressed") === "true";
  }

  applyButtonEffect(effect) {
    const safeEffect = BUTTON_EFFECTS.has(effect) ? effect : "none";

    for (const name of BUTTON_EFFECTS) {
      if (name !== "none") {
        this.editor.button.classList.remove(`button-effect-${name}`);
      }
    }

    this.editor.button.dataset.buttonEffect = safeEffect;
    if (safeEffect !== "none") {
      this.editor.button.classList.add(`button-effect-${safeEffect}`);
    }
  }

  applyBackgroundValue(value, input = null) {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      this.media.clearBackgroundImage();
      this.editor.button.style.background = "";
      input?.setCustomValidity("");
      return true;
    }

    const style = document.createElement("div").style;

    if (/(?:^|;)\s*background\s*:/i.test(trimmedValue)) {
      style.cssText = trimmedValue;
    } else {
      style.background = trimmedValue;
    }

    const background = style.background;

    if (!background) {
      input?.setCustomValidity(
        "Enter a background value or CSS background declarations."
      );
      return false;
    }

    input?.setCustomValidity("");
    this.media.clearBackgroundImage();
    this.editor.button.style.background = background;
    return true;
  }

  applyBaseDefaults() {
    this.applyBorderAppearance();
    const gradient = document.getElementById("background_gradient");

    if (!this.applyBackgroundValue(gradient.value, gradient)) {
      this.editor.button.style.background = this.backgroundColor.value;
    }
    this.applyBackgroundSizing();
    this.applyButtonEffect(this.buttonEffect.value);
  }

  applyBackgroundSizing() {
    const size = document.getElementById("background_size").value;
    this.editor.button.style.backgroundSize = size;
    this.editor.button.style.backgroundRepeat =
      size === "contain" ? "repeat" : "no-repeat";
  }

  applyBorderAppearance() {
    const borderWidth = Number(
      document.getElementById("border_width").value
    );
    const safeWidth = Math.max(
      0,
      Math.min(15, Number.isFinite(borderWidth) ? borderWidth : 0)
    );
    const borderStyle = document.getElementById("border_style").value;
    const borderColor = document.getElementById("border_color").value;

    this.editor.button.style.borderWidth = `${safeWidth}px`;
    this.editor.button.style.borderStyle = borderStyle;
    this.editor.button.style.borderColor = "transparent";
    this.editor.button.style.width =
      `${BUTTON_WIDTH - 2 * safeWidth}px`;
    this.editor.button.style.height =
      `${BUTTON_HEIGHT - 2 * safeWidth}px`;

    Object.assign(this.editor.borderLayer.style, {
      borderColor,
      borderStyle,
      borderWidth: `${safeWidth}px`,
      boxSizing: "border-box",
      height: `${BUTTON_HEIGHT}px`,
      left: `${-safeWidth}px`,
      top: `${-safeWidth}px`,
      width: `${BUTTON_WIDTH}px`
    });
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
      letter.textContent = character;
      fragment.appendChild(letter);
      letterIndex += 1;
    });

    text.replaceChildren(fragment);
  }

  syncTextEffectOptions() {
    const effect = this.textEffect.value;
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

    this.applyBorderAppearance();
    this.applyButtonEffect(this.buttonEffect.value);

    if (typeof state?.background === "string") {
      this.applyBackgroundValue(
        state.background,
        document.getElementById("background_gradient")
      );
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
    for (const control of this.baseControls) {
      this.resetControl(control);
    }

    this.textForm.reset();
    this.setTransparentState(this.backgroundTransparent, false);
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
