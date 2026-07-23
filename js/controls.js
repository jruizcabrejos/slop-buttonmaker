import { BUTTON_HEIGHT, BUTTON_WIDTH } from "./editor.js";

const DEFAULT_PREVIEW_TEXT = "Sphynx of black quartz, judge my vow";
const BUTTON_EFFECTS = new Set(["none", "glitch", "shimmer", "rotate"]);
const TEXT_EFFECTS = new Set(["none", "bounce", "glow", "fly-in"]);
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
    this.buttonEffect = document.getElementById("button_effect");
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
    this.applyBaseDefaults();
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
        break;
      case "background_gradient":
        this.applyBackgroundValue(control.value, control);
        break;
      case "background_size":
        this.editor.button.style.backgroundSize = control.value;
        break;
      case "border_width":
        this.applyBorderWidth();
        break;
      case "border_color":
        this.editor.button.style.borderColor = control.value;
        break;
      case "border_style":
        this.editor.button.style.borderStyle = control.value;
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
    this.media.clearBackgroundImage();
    this.editor.button.style.background = this.backgroundColor.value;
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
    this.applyBorderWidth();
    this.editor.button.style.borderColor =
      document.getElementById("border_color").value;
    this.editor.button.style.borderStyle =
      document.getElementById("border_style").value;
    const gradient = document.getElementById("background_gradient");

    if (!this.applyBackgroundValue(gradient.value, gradient)) {
      this.editor.button.style.background = this.backgroundColor.value;
    }
    this.editor.button.style.backgroundSize =
      document.getElementById("background_size").value;
    this.applyButtonEffect(this.buttonEffect.value);
  }

  applyBorderWidth() {
    const borderWidth = Number(
      document.getElementById("border_width").value
    );
    const safeWidth = Number.isFinite(borderWidth) ? borderWidth : 0;

    this.editor.button.style.borderWidth = `${safeWidth}px`;
    this.editor.button.style.width =
      `${BUTTON_WIDTH - 2 * safeWidth}px`;
    this.editor.button.style.height =
      `${BUTTON_HEIGHT - 2 * safeWidth}px`;
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
      color: document.getElementById("font_color").value,
      align: document.getElementById("text_align").value,
      effect: document.getElementById("text_effect").value
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
    this.applyTextEffect(text, properties.effect);
    text.textContent = properties.content || DEFAULT_PREVIEW_TEXT;
  }

  applyTextEffect(text, effect) {
    const safeEffect = TEXT_EFFECTS.has(effect) ? effect : "none";

    for (const name of TEXT_EFFECTS) {
      if (name !== "none") {
        text.classList.remove(`text-effect-${name}`);
      }
    }

    text.dataset.textEffect = safeEffect;
    if (safeEffect !== "none") {
      text.classList.add(`text-effect-${safeEffect}`);
    }
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
      const value = values[id];

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

    this.applyBorderWidth();
    this.editor.button.style.borderColor =
      document.getElementById("border_color").value;
    this.editor.button.style.borderStyle =
      document.getElementById("border_style").value;
    this.editor.button.style.backgroundSize =
      document.getElementById("background_size").value;
    this.applyButtonEffect(this.buttonEffect.value);

    if (typeof state?.background === "string") {
      this.applyBackgroundValue(
        state.background,
        document.getElementById("background_gradient")
      );
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
    this.applyBaseDefaults();
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
