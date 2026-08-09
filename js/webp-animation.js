import { GifAnimation } from "./gif-animation.js";

const DEFAULT_FRAME_DELAY = 100;
const MINIMUM_FRAME_DELAY = 20;
const YIELD_INTERVAL = 25;

export class WebpAnimation {
  static async fromFile(file, maximumWidth, maximumHeight) {
    if (
      typeof globalThis.ImageDecoder !== "function" ||
      !await globalThis.ImageDecoder.isTypeSupported("image/webp")
    ) {
      return null;
    }

    const decoder = new globalThis.ImageDecoder({
      data: await file.arrayBuffer(),
      type: "image/webp",
      preferAnimation: true
    });

    try {
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;

      if (!track?.animated || track.frameCount < 2) {
        return null;
      }

      const frames = [];
      let canvas = null;
      let context = null;
      let elapsed = 0;

      for (let index = 0; index < track.frameCount; index += 1) {
        const decoded = await decoder.decode({ frameIndex: index });
        const frame = decoded.image;

        try {
          if (!canvas) {
            const sourceWidth = Math.max(
              1,
              frame.displayWidth || frame.codedWidth
            );
            const sourceHeight = Math.max(
              1,
              frame.displayHeight || frame.codedHeight
            );
            const scale = Math.min(
              1,
              maximumWidth / sourceWidth,
              maximumHeight / sourceHeight
            );
            canvas = document.createElement("canvas");
            canvas.width = Math.max(
              1,
              Math.round(sourceWidth * scale)
            );
            canvas.height = Math.max(
              1,
              Math.round(sourceHeight * scale)
            );
            context = canvas.getContext("2d", {
              willReadFrequently: true
            });
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
          }

          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(frame, 0, 0, canvas.width, canvas.height);
          elapsed += Math.max(
            MINIMUM_FRAME_DELAY,
            Math.round(Number(frame.duration) / 1000) ||
              DEFAULT_FRAME_DELAY
          );
          frames.push({
            source: canvas.toDataURL("image/png"),
            endsAt: elapsed
          });
        } finally {
          frame.close();
        }

        if ((index + 1) % YIELD_INTERVAL === 0) {
          await new Promise(resolve => window.setTimeout(resolve, 0));
        }
      }

      return new GifAnimation(frames);
    } finally {
      decoder.close();
    }
  }
}
