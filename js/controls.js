import { BUTTON_HEIGHT, BUTTON_WIDTH } from "./editor.js";

const DEFAULT_PREVIEW_TEXT = "Sphynx of black quartz, judge my vow";

export class ControlsController {
  constructor({ editor, media }) {
    this.editor = editor;
    this.media = media;
    this.tabButtons = document.querySelectorAll(".menu-tab");
    this.panels = document.querySelectorAll(".menu[data-panel]");
    this.tutorials = document.querySelectorAll(
      "#tutorials img[data-tutorial]"
    );
    this.baseControls = [
      document.getElementById("background_color"),
      document.getElementById("border_color"),
      document.getElementById("border_width"),
      document.getElementById("border_style"),
      document.getElementById("background_size"),
      document.getElementById("background_gradient")
    ];
    this.textForm = document.querySelector("section.text form");
    this.textControls = this.textForm.querySelectorAll(
      "textarea, input, select"
    );
    this.fontPreview = document.querySelector("#font_preview .message");
    this.detailButtons = document.querySelectorAll(".detail-option");

    this.handleBaseControl = this.handleBaseControl.bind(this);
    this.handleTabKeydown = this.handleTabKeydown.bind(this);
    this.previewFont = this.previewFont.bind(this);
    this.drawText = this.drawText.bind(this);

    this.bindTabs();
    this.bindBaseControls();
    this.bindTextControls();
    this.bindDetails();
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
        this.media.clearBackgroundImage();
        this.editor.button.style.background = control.value;
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
      default:
        break;
    }
  }

  applyBaseDefaults() {
    this.applyBorderWidth();
    this.editor.button.style.borderColor =
      document.getElementById("border_color").value;
    this.editor.button.style.borderStyle =
      document.getElementById("border_style").value;
    this.editor.button.style.background =
      document.getElementById("background_gradient").value ||
      document.getElementById("background_color").value;
    this.editor.button.style.backgroundSize =
      document.getElementById("background_size").value;
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
    this.editor.addLayer(text, {
      type: "text",
      animationClass: "glow_text"
    });
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
      align: document.getElementById("text_align").value
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

    for (const tutorial of this.tutorials) {
      const isActive = tutorial.dataset.tutorial === name;
      tutorial.classList.toggle("visible", isActive);
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
