export function initZoomAddon({ editor }) {
  const zoomControl = document.getElementById("zoom_level");

  function applyZoom() {
    const scale = Number(zoomControl.value) || 1;
    const previewWidth = editor.previewVisual.offsetWidth;
    const previewHeight = editor.previewVisual.offsetHeight;

    editor.setPreviewScale(scale);
    editor.previewVisual.style.transform = `scale(${scale})`;
    editor.previewBounds.style.width = `${previewWidth * scale}px`;
    editor.previewBounds.style.height = `${previewHeight * scale}px`;
  }

  zoomControl.addEventListener("change", applyZoom);
  editor.onReset(() => {
    zoomControl.value = zoomControl.options[0].value;
    applyZoom();
    editor.stage.scrollLeft = 0;
    editor.stage.scrollTop = 0;
  });

  applyZoom();

  return {
    name: "zoom",
    destroy() {
      zoomControl.removeEventListener("change", applyZoom);
    }
  };
}
