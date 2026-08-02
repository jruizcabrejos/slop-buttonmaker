import { AssetLibraryController } from "./js/assets.js";
import { ControlsController } from "./js/controls.js";
import { DragController } from "./js/drag.js";
import { Editor } from "./js/editor.js";
import { LayersController } from "./js/layers.js";
import {
  ExportController,
  ExportOptionsController
} from "./js/export.js";
import { MediaController } from "./js/media.js";
import { ProjectController } from "./js/project.js";
import { SequenceController } from "./js/sequence.js";
import { initAddons } from "./js/addons/index.js";

function init() {
  const editor = new Editor({
    stage: document.getElementById("stage"),
    previewBounds: document.getElementById("preview_bounds"),
    previewVisual: document.getElementById("preview_visual")
  });
  const media = new MediaController({ editor });
  new AssetLibraryController({ media });
  const controls = new ControlsController({ editor, media });
  new LayersController({ editor });
  const drag = new DragController({ editor });
  const exportOptions = new ExportOptionsController({ editor });
  const sequence = new SequenceController({ editor });
  new ExportController({
    editor,
    media,
    options: exportOptions,
    sequence
  });
  new ProjectController({ editor, media, controls, sequence });
  initAddons({ editor });

  editor.onBeforeReset(() => drag.cancel());

  document.getElementById("reset_button").addEventListener("click", () => {
    const shouldReset = window.confirm(
      "Reset the button and discard all changes?"
    );

    if (shouldReset) {
      editor.reset();
    }
  });
}

init();
