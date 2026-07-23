"use strict";

(function() {
  const DRAG_THRESHOLD = 3;
  let activeDrag = null;
  let dragIndex = 0;

  window.addEventListener("load", init);

  /** Adds event listeners and initializes button */
  function init() {
    let menuTabs = qsa("aside > ul > li:not(:first-child)");
    let styleOptions = qsa("section.base input, section.base select, #new_image");
    let imageDims = qsa("#new_image_height, #new_image_width");
    let details = qsa("section.extra li");

    qs("section.text form").addEventListener("change", previewFont);
    id("save_img").addEventListener("click", saveImage);
    qs(".text > form").addEventListener("submit", function(e) {
      e.preventDefault();
      drawText();
    });

    for (let i = 0; i < details.length; i++) {
      details[i].addEventListener("click", appendImage);
    }
    
    for (let i = 0; i < menuTabs.length; i++) {
      menuTabs[i].addEventListener("click", toggleTabs);
    }
    
    for (let i = 0; i < styleOptions.length; i++) {
      styleOptions[i].addEventListener("change", updateStyles);
    }

    for (let i = 0; i < imageDims.length; i++) {
      imageDims[i].addEventListener("change", setImageDims);
    }

    window.addEventListener("blur", cancelDrag);
    buildABase();
  }

  function previewFont() {
    let properties = getProperties();
    let text = setTextAttributes(qs("#font_preview .message"), properties);

    console.log(text);
  }

  /** Appends an image to the stage when selected */
  function appendImage() {
    var itm = this.querySelector("img");
    var image = itm.cloneNode(true);

    makeDraggable(image);
    makeRemoveable(image);
    setToStage(image, "glow_box");
  }

  function setToStage(elem, anim) {
    elem.classList.add(anim);
    setTimeout(() => {
      elem.classList.remove(anim);
    }, 5000);
    qs(".button").appendChild(elem);
  }

  /** Creates a text element based on input and appends it to the stage */
  function drawText() {
    let properties = getProperties();

    let text = document.createElement("div");
    text = setTextAttributes(text, properties);

    makeRemoveable(text);

    setToStage(text, "glow_text");
    makeDraggable(text);
  }

  function setTextAttributes(text, properties) {
    text.style["font"] = properties.fontStyle +
    " " +
    properties.fontWeight +
    " " +
    properties.fontSize +
    " '" +
    properties.fontFamily +
    "'";

    console.log(properties)

    text.style["textAlign"] = properties.textAlign;

    text.style["textDecoration"] = properties.textDecoration;
    text.style["color"] = properties.fontColor;

    if (properties.wordContent.length != "") {
      text.textContent = properties.wordContent;
    } else {
      text.textContent = "Sphynx of black quartz, judge my vow"
    }

    return text;
  }

  function getProperties() {
    let results = {
      wordContent: id("text_content").value,
      fontFamily: id("font_family").value,
      textDecoration: id("text_decoration").value,
      fontStyle: id("font_style").value,
      fontWeight: id("font_weight").value,
      fontSize: id("font_size").value + "pt",
      fontColor: id("font_color").value,
      textAlign: id("text_align").value
    }

    console.log(results)

    return results;
  }
  
  /**
   * Opens a tab based on the value of the clicked
   * tab.
   * @param {Event} e - the user's click event
   */
  function toggleTabs(e) {
    let selector = this.getAttribute("data-value");
    let visible = qsa(".visible");
    let allWithClass = qsa("." + selector);

    for (let i = 0; i < visible.length; i++) {
      visible[i].classList.remove("visible");
    }

    for (let i = 0; i < allWithClass.length; i++) {
      allWithClass[i].classList.add('visible');
    }
  }
  
  /** Builds a button based on values in the input */
  function buildABase() {
    let toSearch = qsa("section.base input, section.base select");
    
    let button = document.createElement("div");
    button.classList.add('button');
    makeDraggable(button);
    
    for (let i = 0; i < toSearch.length; i++) {
      let newStyle = toSearch[i].getAttribute("name");

      if (newStyle === "border-width") {
        button.style[newStyle] = toSearch[i].value + "px";
        button.style["height"] = 31 - (2 * toSearch[i].value) + "px";
        button.style["width"] = 88 - (2 * toSearch[i].value) + "px";
      } else {
        button.style[newStyle] = toSearch[i].value;
      }
    }

    id("stage").appendChild(button);
  }
  
  /**
   * Changes the styles of the button based on values set by
   * the user.
   * @param {Event} e - the event of the changed input value 
   */
  function updateStyles(e) {
    let toUpdate = this.getAttribute("name");

    if (this.getAttribute("type") === "file") {
      imgUpload(e, toUpdate);
    } else if (this.getAttribute("type") === "number") {
      intUpload(e, toUpdate);
    } else {
      qs(".button").style[toUpdate] = this.value;
    }
  }

  /**
   * Updates the styles if the value to update accepts integers.
   * @param {Event} e - the event of the value getting changed.
   * @param {String} styles - the style to change.
   */
  function intUpload(e, styles) {
    if (styles === "border-width") {
      qs(".button").style["height"] = 31 - (2 * e.target.value) + "px";
      qs(".button").style["width"] = 88 - (2 * e.target.value) + "px";
    }
    qs(".button").style[styles] = e.target.value + "px";
  }
  
  /**
   * Updates the styles if the value to update accepts and image.
   * @param {Event} e - the event of the value getting changed.
   * @param {String} styles - the style to change.
   */
  function imgUpload(e, styles) {
    let imgInput = URL.createObjectURL(e.target.files[0]);
      
    if (styles === "background") {
      qs(".button").style[styles] = "url(" + imgInput + ")";
      qs(".button").style["backgroundSize"] = id("background_size").value;
    } else {
      let newImage = document.createElement("img");
      let hiddenDims = qsa(".menu ul li.hidden");

      newImage.src = imgInput;

      if (qsa(".active_img").length > 0) {
        qs(".active_img").classList.remove("active_img");
      }

      for (let i = 0; i < hiddenDims.length; i++) {
        hiddenDims[i].classList.remove("hidden");
      }
      
      newImage.classList.add("active_img");
      makeDraggable(newImage);
      makeRemoveable(newImage);

      qs("input[name='new-image']").value = "";
      setToStage(newImage, "glow_box");

      setImageDims();
    }
  }

  /** Sets the dimensions of the active uploaded image */
  function setImageDims() {
    let image = qs(".active_img");

    image.style.height = id("new_image_height").value + "px";
    image.style.width = id("new_image_width").value + "px";
  }

  /**
   * On double click, the item becomes removable
   * @param {Element} item - the item that is being
   * made removable
   */
  function makeRemoveable(item) {
    item.addEventListener("dblclick", function() {
      this.remove();
    })
  }

  /** SAves an image using html2canvas */
  async function saveImage() {
    let canvas = await html2canvas(qs(".button"), {
      scale: 1,
      backgroundColor: null
    });

    var link = document.createElement('a');
    link.download = 'button.gif';
    link.href = canvas.toDataURL("image/gif");
    link.click();
  }

  /**
   * Makes stuff dragabble
   * @param {*} elmnt element to be made draggable
  */
  function makeDraggable(elmnt) {
    const elements =
      typeof elmnt.length === "number" ? elmnt : [elmnt];

    for (let i = 0; i < elements.length; i++) {
      elements[i].draggable = false;
      elements[i].addEventListener("pointerdown", startDrag);
    }
  }

  function startDrag(e) {
    if (!e.isPrimary || e.button !== 0) {
      return;
    }

    cancelDrag();
    e.preventDefault();
    e.stopPropagation();

    const element = e.currentTarget;
    dragIndex += 1;
    element.style.zIndex = dragIndex;
    element.classList.add("is-dragging");

    activeDrag = {
      element: element,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft: readPosition(element.style.left, element.offsetLeft),
      startTop: readPosition(element.style.top, element.offsetTop),
      moved: false
    };

    element.addEventListener("lostpointercapture", endDrag);
    window.addEventListener("pointermove", dragElement, {
      passive: false
    });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    if (element.setPointerCapture) {
      element.setPointerCapture(e.pointerId);
    }
  }

  function dragElement(e) {
    if (!activeDrag || e.pointerId !== activeDrag.pointerId) {
      return;
    }

    const deltaX = e.clientX - activeDrag.startClientX;
    const deltaY = e.clientY - activeDrag.startClientY;

    if (
      !activeDrag.moved &&
      Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD
    ) {
      return;
    }

    e.preventDefault();
    activeDrag.moved = true;
    activeDrag.element.style.left =
      Math.round(activeDrag.startLeft + deltaX) + "px";
    activeDrag.element.style.top =
      Math.round(activeDrag.startTop + deltaY) + "px";
  }

  function endDrag(e) {
    if (activeDrag && e.pointerId === activeDrag.pointerId) {
      finishDrag();
    }
  }

  function cancelDrag() {
    if (activeDrag) {
      finishDrag();
    }
  }

  function finishDrag() {
    const drag = activeDrag;

    if (!drag) {
      return;
    }

    activeDrag = null;
    drag.element.classList.remove("is-dragging");
    drag.element.removeEventListener("lostpointercapture", endDrag);
    window.removeEventListener("pointermove", dragElement);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);

    if (
      drag.element.hasPointerCapture &&
      drag.element.hasPointerCapture(drag.pointerId)
    ) {
      drag.element.releasePointerCapture(drag.pointerId);
    }
  }

  function readPosition(value, fallback) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /* ------------------------------ Helper Functions  ------------------------------ */
  /**
   * Returns the element that has the ID attribute with the specified value.
   * @param {string} id - element ID
   * @return {object} DOM object associated with id.
   */
  function id(id) {
    return document.getElementById(id);
  }

  /**
   * Returns the first element that matches the given CSS selector.
   * @param {string} query - CSS query selector.
   * @returns {object[]} array of DOM objects matching the query.
   */
  function qs(query) {
    return document.querySelector(query);
  }

  /**
   * Returns the array of elements that match the given CSS selector.
   * @param {string} query - CSS query selector
   * @returns {object[]} array of DOM objects matching the query.
   */
  function qsa(query) {
    return document.querySelectorAll(query);
  }
})();
