const DRAG_THRESHOLD = 3;

export class DragController {
  constructor({ editor }) {
    this.editor = editor;
    this.button = editor.button;
    this.activeDrag = null;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleLostPointerCapture = this.handleLostPointerCapture.bind(this);
    this.cancel = this.cancel.bind(this);

    this.button.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("blur", this.cancel);
  }

  handlePointerDown(event) {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    const element = event.target.closest("[data-draggable='true']");

    if (!element || !this.button.contains(element)) {
      return;
    }

    this.cancel();
    event.preventDefault();
    event.stopPropagation();

    element.dataset.dragMoved = "false";
    this.editor.bringToFront(element);

    this.activeDrag = {
      element,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: this.readPosition(element.style.left, element.offsetLeft),
      startTop: this.readPosition(element.style.top, element.offsetTop),
      moved: false
    };

    element.classList.add("is-dragging");
    element.addEventListener(
      "lostpointercapture",
      this.handleLostPointerCapture
    );

    window.addEventListener("pointermove", this.handlePointerMove, {
      passive: false
    });
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerUp);

    if (element.setPointerCapture) {
      element.setPointerCapture(event.pointerId);
    }
  }

  handlePointerMove(event) {
    const drag = this.activeDrag;

    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const screenDeltaX = event.clientX - drag.startClientX;
    const screenDeltaY = event.clientY - drag.startClientY;

    if (
      !drag.moved &&
      Math.hypot(screenDeltaX, screenDeltaY) < DRAG_THRESHOLD
    ) {
      return;
    }

    event.preventDefault();
    drag.moved = true;
    drag.element.dataset.dragMoved = "true";

    const scale = this.editor.getPreviewScale() || 1;
    const left = Math.round(drag.startLeft + screenDeltaX / scale);
    const top = Math.round(drag.startTop + screenDeltaY / scale);

    drag.element.style.left = `${left}px`;
    drag.element.style.top = `${top}px`;
  }

  handlePointerUp(event) {
    if (
      this.activeDrag &&
      event.pointerId === this.activeDrag.pointerId
    ) {
      this.finishDrag();
    }
  }

  handleLostPointerCapture(event) {
    if (
      this.activeDrag &&
      event.pointerId === this.activeDrag.pointerId
    ) {
      this.finishDrag();
    }
  }

  cancel() {
    if (this.activeDrag) {
      this.finishDrag();
    }
  }

  finishDrag() {
    const drag = this.activeDrag;

    if (!drag) {
      return;
    }

    this.activeDrag = null;
    drag.element.classList.remove("is-dragging");
    drag.element.removeEventListener(
      "lostpointercapture",
      this.handleLostPointerCapture
    );

    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);

    if (
      drag.element.hasPointerCapture &&
      drag.element.hasPointerCapture(drag.pointerId)
    ) {
      drag.element.releasePointerCapture(drag.pointerId);
    }
  }

  readPosition(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
