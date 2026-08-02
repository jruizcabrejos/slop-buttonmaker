import { MAX_SEQUENCE_SCENES } from "./sequence.js";

const PROJECT_FORMAT = "slop-buttonmaker";
const PROJECT_VERSION = 1;
const MAX_PROJECT_SIZE = 150 * 1024 * 1024;
const MAX_LAYERS = 1000;
const MAX_TEXT_LENGTH = 100000;

const LAYER_STYLE_PROPERTIES = [
  "left",
  "top",
  "width",
  "height",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "textAlign",
  "textDecoration",
  "color",
  "objectFit",
  "clipPath"
];

const LAYER_DATA_PROPERTIES = [
  "aspectRatio",
  "resizeMode",
  "cropLeft",
  "cropTop",
  "cropRight",
  "cropBottom",
  "textEffect",
  "textEffectColor",
  "textEffectDirection",
  "textEffectSpeed",
  "textPrimaryColor",
  "sequenceStep"
];

export class ProjectController {
  constructor({ editor, media, controls, sequence }) {
    this.editor = editor;
    this.media = media;
    this.controls = controls;
    this.sequence = sequence;
    this.exportButton = document.getElementById("export_raw");
    this.importButton = document.getElementById("import_raw");
    this.importInput = document.getElementById("import_raw_file");

    this.exportProject = this.exportProject.bind(this);
    this.chooseImport = this.chooseImport.bind(this);
    this.importProject = this.importProject.bind(this);

    this.exportButton.addEventListener("click", this.exportProject);
    this.importButton.addEventListener("click", this.chooseImport);
    this.importInput.addEventListener("change", this.importProject);
  }

  async exportProject() {
    const originalText = this.exportButton.textContent;
    this.setBusy(true);
    this.exportButton.textContent = "Exporting...";

    try {
      const project = await this.serializeProject();
      const blob = new Blob(
        [JSON.stringify(project, null, 2)],
        { type: "application/json" }
      );

      if (blob.size > MAX_PROJECT_SIZE) {
        throw new Error("The raw project exceeds 150 MiB.");
      }

      this.downloadBlob(blob, "button-project.json");
    } catch (error) {
      console.error(error);
      window.alert("The raw project could not be exported.");
    } finally {
      this.exportButton.textContent = originalText;
      this.setBusy(false);
    }
  }

  chooseImport() {
    this.importInput.click();
  }

  async importProject(event) {
    const file = event.target.files[0];
    this.importInput.value = "";

    if (!file) {
      return;
    }

    if (file.size > MAX_PROJECT_SIZE) {
      window.alert("Choose a raw project smaller than 150 MiB.");
      return;
    }

    const originalText = this.importButton.textContent;

    try {
      const project = JSON.parse(await file.text());
      this.validateProject(project);

      if (!window.confirm(
        "Import this raw project and replace the current button?"
      )) {
        return;
      }

      this.setBusy(true);
      this.importButton.textContent = "Importing...";
      await this.restoreProject(project);
    } catch (error) {
      console.error(error);
      window.alert("The selected file is not a valid raw button project.");
    } finally {
      this.importButton.textContent = originalText;
      this.setBusy(false);
    }
  }

  async serializeProject() {
    const layers = [];

    for (const layer of this.editor.getLayers()) {
      layers.push(await this.serializeLayer(layer));
    }

    return {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      exportedAt: new Date().toISOString(),
      button: this.controls.getProjectState(),
      sequence: this.sequence.getProjectState(),
      backgroundFile: await this.serializeFile(
        this.media.getBackgroundFile()
      ),
      layers
    };
  }

  async serializeLayer(layer) {
    if (this.editor.isBorderLayer(layer)) {
      return {
        kind: "border",
        type: "border",
        hidden: layer.hidden,
        style: {},
        data: {}
      };
    }

    const isImage = layer instanceof HTMLImageElement;
    const record = {
      kind: isImage ? "image" : "text",
      type: layer.dataset.layerType || (isImage ? "image" : "text"),
      hidden: layer.hidden,
      style: this.pickProperties(layer.style, LAYER_STYLE_PROPERTIES),
      data: this.pickProperties(layer.dataset, LAYER_DATA_PROPERTIES)
    };

    if (!isImage) {
      record.text = layer.textContent;
      return record;
    }

    let file = this.media.getLayerFile(layer);

    if (!file) {
      const response = await fetch(layer.currentSrc || layer.src);

      if (!response.ok) {
        throw new Error(`Could not read layer asset: ${layer.alt}`);
      }

      const blob = await response.blob();
      file = new File(
        [blob],
        layer.alt || "asset",
        { type: blob.type || "image/png" }
      );
    }

    record.alt = layer.alt;
    record.file = await this.serializeFile(file);
    return record;
  }

  serializeFile(file) {
    if (!file) {
      return null;
    }

    return this.fileToDataUrl(file).then(data => ({
      name: file.name || "asset",
      type: file.type,
      lastModified: file.lastModified || 0,
      data
    }));
  }

  async restoreProject(project) {
    const backgroundFile = project.backgroundFile
      ? await this.deserializeFile(project.backgroundFile)
      : null;
    const preparedLayers = [];
    const restoredLayers = [];

    for (const record of project.layers) {
      preparedLayers.push({
        record,
        file: record.kind === "image"
          ? await this.deserializeFile(record.file)
          : null
      });
    }

    this.editor.reset();
    this.controls.applyProjectState(project.button);
    this.sequence.applyProjectState(project.sequence);

    if (backgroundFile) {
      const backgroundLoaded = await this.media.addBackgroundFile(
        backgroundFile
      );

      if (!backgroundLoaded) {
        throw new Error("The project background could not be loaded.");
      }
    }

    for (const prepared of preparedLayers) {
      restoredLayers.push(
        await this.restoreLayer(prepared.record, prepared.file)
      );
    }

    this.editor.setLayerOrder(restoredLayers);
    this.editor.selectLayer(null);
    this.editor.selectLayer(
      restoredLayers[restoredLayers.length - 1] || null
    );
  }

  async restoreLayer(record, file) {
    let layer;

    if (record.kind === "border") {
      this.editor.setBorderLayerEnabled(true);
      layer = this.editor.borderLayer;
    } else if (record.kind === "image") {
      layer = await this.media.addImageFile(
        file,
        null,
        { type: record.type === "detail" ? "detail" : "image" }
      );

      if (!layer) {
        throw new Error("A project image could not be loaded.");
      }
      layer.alt = record.alt || file.name;
    } else {
      layer = document.createElement("div");
      layer.classList.add("text-layer");
      layer.textContent = record.text;
      this.editor.addLayer(layer, { type: "text" });
    }

    this.applyProperties(
      layer.style,
      record.style,
      LAYER_STYLE_PROPERTIES
    );
    this.applyProperties(
      layer.dataset,
      record.data,
      LAYER_DATA_PROPERTIES
    );
    layer.hidden = Boolean(record.hidden);

    if (record.kind === "text") {
      this.controls.applyTextEffect(layer, record.data.textEffect, {
        color: record.data.textEffectColor,
        direction: record.data.textEffectDirection,
        primaryColor:
          record.data.textPrimaryColor || layer.style.color,
        speed: record.data.textEffectSpeed
      });
    }

    return layer;
  }

  validateProject(project) {
    if (
      !project ||
      project.format !== PROJECT_FORMAT ||
      project.version !== PROJECT_VERSION ||
      !Array.isArray(project.layers) ||
      project.layers.length > MAX_LAYERS
    ) {
      throw new Error("Unsupported project format.");
    }

    if (project.backgroundFile) {
      this.validateFileRecord(project.backgroundFile);
    }

    if (
      project.sequence !== undefined &&
      (
        !project.sequence ||
        typeof project.sequence !== "object" ||
        typeof project.sequence.duration !== "string"
      )
    ) {
      throw new Error("Invalid sequence settings.");
    }

    if (project.sequence?.sceneDurations !== undefined) {
      const durations = project.sequence.sceneDurations;

      if (
        !durations ||
        typeof durations !== "object" ||
        Array.isArray(durations)
      ) {
        throw new Error("Invalid scene durations.");
      }

      for (const [step, duration] of Object.entries(durations)) {
        if (
          !Number.isInteger(Number(step)) ||
          Number(step) < 1 ||
          Number(step) > MAX_SEQUENCE_SCENES ||
          !Number.isFinite(Number(duration)) ||
          Number(duration) < 0.1 ||
          Number(duration) > 30
        ) {
          throw new Error("Invalid scene duration.");
        }
      }
    }

    let borderCount = 0;

    for (const layer of project.layers) {
      if (
        !layer ||
        !["border", "image", "text"].includes(layer.kind) ||
        !layer.style ||
        !layer.data ||
        typeof layer.style !== "object" ||
        typeof layer.data !== "object"
      ) {
        throw new Error("Invalid layer record.");
      }

      if (layer.kind === "border") {
        borderCount += 1;

        if (borderCount > 1) {
          throw new Error("Invalid border layer.");
        }
      } else if (layer.kind === "image") {
        this.validateFileRecord(layer.file);
      } else if (
        typeof layer.text !== "string" ||
        layer.text.length > MAX_TEXT_LENGTH
      ) {
        throw new Error("Invalid text layer.");
      }

      if (
        layer.data.sequenceStep !== undefined &&
        (
          typeof layer.data.sequenceStep !== "string" ||
          Number(layer.data.sequenceStep) < 1 ||
          Number(layer.data.sequenceStep) > MAX_SEQUENCE_SCENES ||
          !Number.isInteger(Number(layer.data.sequenceStep))
        )
      ) {
        throw new Error("Invalid layer scene.");
      }
    }
  }

  validateFileRecord(record) {
    if (
      !record ||
      typeof record.name !== "string" ||
      typeof record.type !== "string" ||
      typeof record.data !== "string" ||
      !record.data.startsWith("data:image/")
    ) {
      throw new Error("Invalid embedded image.");
    }
  }

  async deserializeFile(record) {
    const response = await fetch(record.data);
    const blob = await response.blob();

    return new File(
      [blob],
      record.name || "asset",
      {
        type: record.type || blob.type,
        lastModified: Number(record.lastModified) || 0
      }
    );
  }

  pickProperties(source, names) {
    const properties = {};

    for (const name of names) {
      if (source[name]) {
        properties[name] = source[name];
      }
    }

    return properties;
  }

  applyProperties(target, properties, names) {
    for (const name of names) {
      if (typeof properties?.[name] === "string") {
        target[name] = properties[name];
      }
    }
  }

  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result), {
        once: true
      });
      reader.addEventListener("error", reject, { once: true });
      reader.readAsDataURL(file);
    });
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  setBusy(busy) {
    this.exportButton.disabled = busy;
    this.importButton.disabled = busy;
  }
}
