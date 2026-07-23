import {
  decompressFrames,
  parseGIF
} from "../gifuct/gifuct.esm.js";

const DEFAULT_FRAME_DELAY = 100;
const MINIMUM_FRAME_DELAY = 20;
const YIELD_INTERVAL = 25;

export class GifAnimation {
  constructor(frames) {
    this.frames = frames;
    this.duration = frames.at(-1)?.endsAt || DEFAULT_FRAME_DELAY;
  }

  static async fromFile(file, maximumWidth, maximumHeight) {
    const parsedGif = parseGIF(await file.arrayBuffer());
    const decodedFrames = decompressFrames(parsedGif, true);

    if (decodedFrames.length === 0) {
      throw new Error("The GIF does not contain any image frames.");
    }

    const sourceWidth = Math.max(1, parsedGif.lsd.width);
    const sourceHeight = Math.max(1, parsedGif.lsd.height);
    const scale = Math.min(
      1,
      maximumWidth / sourceWidth,
      maximumHeight / sourceHeight
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const frames = [];
    let elapsed = 0;
    let previousFrame = null;

    for (let index = 0; index < decodedFrames.length; index += 1) {
      const frame = decodedFrames[index];

      GifAnimation.applyDisposal(context, previousFrame);

      const restorePixels =
        frame.disposalType === 3
          ? context.getImageData(0, 0, canvas.width, canvas.height)
          : null;
      const frameRect = GifAnimation.scaleFrameRect(frame.dims, scale);
      const patchCanvas = document.createElement("canvas");
      patchCanvas.width = frame.dims.width;
      patchCanvas.height = frame.dims.height;
      patchCanvas.getContext("2d").putImageData(
        new ImageData(
          frame.patch,
          frame.dims.width,
          frame.dims.height
        ),
        0,
        0
      );
      context.drawImage(
        patchCanvas,
        0,
        0,
        patchCanvas.width,
        patchCanvas.height,
        frameRect.left,
        frameRect.top,
        frameRect.width,
        frameRect.height
      );

      elapsed += Math.max(
        MINIMUM_FRAME_DELAY,
        Number(frame.delay) || DEFAULT_FRAME_DELAY
      );
      frames.push({
        source: canvas.toDataURL("image/png"),
        endsAt: elapsed
      });
      previousFrame = {
        disposalType: frame.disposalType,
        rect: frameRect,
        restorePixels
      };

      if ((index + 1) % YIELD_INTERVAL === 0) {
        await GifAnimation.yieldToBrowser();
      }
    }

    return new GifAnimation(frames);
  }

  getFrameAt(timeMs) {
    const position =
      ((timeMs % this.duration) + this.duration) % this.duration;
    return (
      this.frames.find(frame => position < frame.endsAt) ||
      this.frames.at(-1)
    ).source;
  }

  static applyDisposal(context, previousFrame) {
    if (!previousFrame) {
      return;
    }

    if (previousFrame.disposalType === 2) {
      const { left, top, width, height } = previousFrame.rect;
      context.clearRect(left, top, width, height);
    } else if (
      previousFrame.disposalType === 3 &&
      previousFrame.restorePixels
    ) {
      context.putImageData(previousFrame.restorePixels, 0, 0);
    }
  }

  static scaleFrameRect(dimensions, scale) {
    const left = Math.round(dimensions.left * scale);
    const top = Math.round(dimensions.top * scale);
    const right = Math.round(
      (dimensions.left + dimensions.width) * scale
    );
    const bottom = Math.round(
      (dimensions.top + dimensions.height) * scale
    );

    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  }

  static yieldToBrowser() {
    return new Promise(resolve => window.setTimeout(resolve, 0));
  }
}
