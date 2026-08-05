const VISUAL_PROPERTIES = [
  "background",
  "backgroundClip",
  "imageRendering",
  "borderRadius",
  "borderWidth",
  "borderStyle",
  "borderColor",
  "borderImageSource",
  "borderImageSlice",
  "borderImageWidth",
  "borderImageOutset",
  "borderImageRepeat"
];

export function parseVisualCss(value) {
  const source = value.trim();

  if (!source) {
    return { empty: true };
  }

  const declarations = readDeclarations(source);

  if (!declarations) {
    return null;
  }

  const visual = {};

  for (const property of VISUAL_PROPERTIES) {
    const cssName = property.replace(/[A-Z]/g, match => (
      `-${match.toLowerCase()}`
    ));
    const propertyValue = declarations.getPropertyValue(cssName).trim();

    if (propertyValue) {
      visual[property] = propertyValue;
    }
  }

  return Object.keys(visual).length > 0 ? visual : null;
}

function readDeclarations(source) {
  const style = document.createElement("div").style;

  if (source.includes("{")) {
    const ruleStyle = readRuleStyle(source);

    if (!ruleStyle) {
      return null;
    }

    style.cssText = ruleStyle.cssText;
  } else {
    style.cssText = source;

    if (style.length === 0) {
      style.background = source;
    }
  }

  return style.length > 0 ? style : null;
}

function readRuleStyle(source) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(source);
    return findStyleRule(sheet.cssRules)?.style || null;
  } catch {
    const openBrace = source.indexOf("{");
    const closeBrace = source.lastIndexOf("}");

    if (openBrace < 0 || closeBrace <= openBrace) {
      return null;
    }

    const style = document.createElement("div").style;
    style.cssText = source.slice(openBrace + 1, closeBrace);
    return style.length > 0 ? style : null;
  }
}

function findStyleRule(rules) {
  for (const rule of rules) {
    if (rule.style) {
      return rule;
    }

    if (rule.cssRules) {
      const nested = findStyleRule(rule.cssRules);

      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

export async function rasterizeBorderImage(
  element,
  { width, height, scale = 1, radius = 0, pixelated = false }
) {
  const style = getComputedStyle(element);
  const source = element.style.borderImageSource || style.borderImageSource;
  const url = readCssUrl(source);

  if (!url) {
    return null;
  }

  const image = await loadImage(url);
  const slices = parseSlices(
    element.style.borderImageSlice || style.borderImageSlice,
    image.naturalWidth,
    image.naturalHeight
  );
  const borderWidths = [
    parseFloat(style.borderTopWidth) || 0,
    parseFloat(style.borderRightWidth) || 0,
    parseFloat(style.borderBottomWidth) || 0,
    parseFloat(style.borderLeftWidth) || 0
  ];
  const widths = parseWidths(
    element.style.borderImageWidth || style.borderImageWidth,
    width,
    height,
    borderWidths,
    slices
  );
  const repeats = parseRepeat(
    element.style.borderImageRepeat || style.borderImageRepeat
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.imageSmoothingEnabled = !pixelated;

  if (context.imageSmoothingEnabled) {
    context.imageSmoothingQuality = "high";
  }

  drawNineSlice(
    context,
    image,
    width,
    height,
    slices,
    widths,
    repeats
  );

  if (radius > 0) {
    context.globalCompositeOperation = "destination-in";
    context.beginPath();
    context.roundRect(0, 0, width, height, radius);
    context.fill();
  }

  return canvas.toDataURL("image/png");
}

function readCssUrl(source) {
  const match = source?.match(/^url\((['"]?)([\s\S]*?)\1\)$/i);
  return match ? match[2] : null;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }

    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("The CSS border image could not be loaded.")),
      { once: true }
    );
    image.src = url;
  });
}

function parseSlices(value, sourceWidth, sourceHeight) {
  const fill = /(?:^|\s)fill(?:\s|$)/i.test(value);
  const tokens = value
    .replace(/(?:^|\s)fill(?:\s|$)/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const expanded = expandQuad(tokens.length > 0 ? tokens : ["100%"]);
  const dimensions = [
    sourceHeight,
    sourceWidth,
    sourceHeight,
    sourceWidth
  ];
  const sides = expanded.map((token, index) => {
    const number = parseFloat(token);

    if (!Number.isFinite(number)) {
      return dimensions[index];
    }

    return token.endsWith("%")
      ? dimensions[index] * number / 100
      : number;
  });

  fitPair(sides, 0, 2, sourceHeight);
  fitPair(sides, 3, 1, sourceWidth);
  return { sides, fill };
}

function parseWidths(
  value,
  targetWidth,
  targetHeight,
  borderWidths,
  slices
) {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  const expanded = expandQuad(tokens.length > 0 ? tokens : ["1"]);
  const dimensions = [
    targetHeight,
    targetWidth,
    targetHeight,
    targetWidth
  ];
  const sides = expanded.map((token, index) => {
    if (token === "auto") {
      return slices.sides[index];
    }

    const number = parseFloat(token);

    if (!Number.isFinite(number)) {
      return borderWidths[index];
    }

    if (token.endsWith("%")) {
      return dimensions[index] * number / 100;
    }

    return token.match(/[a-z]/i)
      ? number
      : number * borderWidths[index];
  });

  fitPair(sides, 0, 2, targetHeight);
  fitPair(sides, 3, 1, targetWidth);
  return sides;
}

function parseRepeat(value) {
  const valid = new Set(["stretch", "repeat", "round", "space"]);
  const tokens = value.trim().split(/\s+/).filter(valid.has.bind(valid));
  const horizontal = tokens[0] || "stretch";
  return [horizontal, tokens[1] || horizontal];
}

function expandQuad(tokens) {
  switch (tokens.length) {
    case 1:
      return [tokens[0], tokens[0], tokens[0], tokens[0]];
    case 2:
      return [tokens[0], tokens[1], tokens[0], tokens[1]];
    case 3:
      return [tokens[0], tokens[1], tokens[2], tokens[1]];
    default:
      return tokens.slice(0, 4);
  }
}

function fitPair(values, first, second, limit) {
  const total = values[first] + values[second];

  if (total <= limit || total === 0) {
    return;
  }

  const ratio = limit / total;
  values[first] *= ratio;
  values[second] *= ratio;
}

function drawNineSlice(
  context,
  image,
  width,
  height,
  slices,
  borders,
  repeats
) {
  const [sourceTop, sourceRight, sourceBottom, sourceLeft] =
    slices.sides;
  const [top, right, bottom, left] = borders;
  const sourceCenterWidth = image.naturalWidth - sourceLeft - sourceRight;
  const sourceCenterHeight = image.naturalHeight - sourceTop - sourceBottom;
  const centerWidth = width - left - right;
  const centerHeight = height - top - bottom;

  drawPart(context, image, 0, 0, sourceLeft, sourceTop, 0, 0, left, top);
  drawPart(
    context,
    image,
    image.naturalWidth - sourceRight,
    0,
    sourceRight,
    sourceTop,
    width - right,
    0,
    right,
    top
  );
  drawPart(
    context,
    image,
    0,
    image.naturalHeight - sourceBottom,
    sourceLeft,
    sourceBottom,
    0,
    height - bottom,
    left,
    bottom
  );
  drawPart(
    context,
    image,
    image.naturalWidth - sourceRight,
    image.naturalHeight - sourceBottom,
    sourceRight,
    sourceBottom,
    width - right,
    height - bottom,
    right,
    bottom
  );

  drawEdge(context, image, {
    source: [sourceLeft, 0, sourceCenterWidth, sourceTop],
    target: [left, 0, centerWidth, top],
    axis: "horizontal",
    repeat: repeats[0]
  });
  drawEdge(context, image, {
    source: [
      sourceLeft,
      image.naturalHeight - sourceBottom,
      sourceCenterWidth,
      sourceBottom
    ],
    target: [left, height - bottom, centerWidth, bottom],
    axis: "horizontal",
    repeat: repeats[0]
  });
  drawEdge(context, image, {
    source: [0, sourceTop, sourceLeft, sourceCenterHeight],
    target: [0, top, left, centerHeight],
    axis: "vertical",
    repeat: repeats[1]
  });
  drawEdge(context, image, {
    source: [
      image.naturalWidth - sourceRight,
      sourceTop,
      sourceRight,
      sourceCenterHeight
    ],
    target: [width - right, top, right, centerHeight],
    axis: "vertical",
    repeat: repeats[1]
  });

  if (slices.fill) {
    drawPart(
      context,
      image,
      sourceLeft,
      sourceTop,
      sourceCenterWidth,
      sourceCenterHeight,
      left,
      top,
      centerWidth,
      centerHeight
    );
  }
}

function drawPart(context, image, sx, sy, sw, sh, dx, dy, dw, dh) {
  if ([sw, sh, dw, dh].some(value => value <= 0)) {
    return;
  }

  context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawEdge(context, image, options) {
  const [sx, sy, sw, sh] = options.source;
  const [dx, dy, dw, dh] = options.target;

  if ([sw, sh, dw, dh].some(value => value <= 0)) {
    return;
  }

  if (options.repeat === "stretch") {
    drawPart(context, image, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }

  const horizontal = options.axis === "horizontal";
  const targetLength = horizontal ? dw : dh;
  const crossScale = horizontal ? dh / sh : dw / sw;
  const naturalLength = Math.max(0.01, (horizontal ? sw : sh) * crossScale);
  let count = Math.max(1, Math.round(targetLength / naturalLength));
  let tileLength = naturalLength;
  let gap = 0;

  if (options.repeat === "round") {
    tileLength = targetLength / count;
  } else if (options.repeat === "space") {
    count = Math.max(1, Math.floor(targetLength / naturalLength));
    gap = count > 1
      ? (targetLength - count * naturalLength) / (count - 1)
      : (targetLength - naturalLength) / 2;
  } else {
    count = Math.ceil(targetLength / naturalLength) + 1;
  }

  const occupied = count * tileLength + Math.max(0, count - 1) * gap;
  const start = options.repeat === "space"
    ? Math.max(0, gap)
    : (targetLength - occupied) / 2;

  context.save();
  context.beginPath();
  context.rect(dx, dy, dw, dh);
  context.clip();

  for (let index = 0; index < count; index += 1) {
    const offset = start + index * (tileLength + gap);
    drawPart(
      context,
      image,
      sx,
      sy,
      sw,
      sh,
      horizontal ? dx + offset : dx,
      horizontal ? dy : dy + offset,
      horizontal ? tileLength : dw,
      horizontal ? dh : tileLength
    );
  }

  context.restore();
}
