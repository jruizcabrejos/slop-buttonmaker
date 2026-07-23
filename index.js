import { ControlsController } from "./js/controls.js";
import { DragController } from "./js/drag.js";
import { Editor } from "./js/editor.js";
import {
  ExportController,
  ExportOptionsController
} from "./js/export.js";
import { MediaController } from "./js/media.js";
import { initAddons } from "./js/addons/index.js";

function init() {
  const editor = new Editor({
    stage: document.getElementById("stage"),
    previewBounds: document.getElementById("preview_bounds"),
    previewVisual: document.getElementById("preview_visual")
  });
  const media = new MediaController({ editor });
  new ControlsController({ editor, media });
  const drag = new DragController({ editor });
  const exportOptions = new ExportOptionsController({ editor });
  new ExportController({ editor, media, options: exportOptions });
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
