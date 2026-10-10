// canvas/mp4-encoder.js - Browser-seitiger H.264/MP4-Encoder (WebCodecs + mp4-muxer)
//
// Ersetzt den alten whammy/WebM->Server-ffmpeg->MP4-Pfad vollständig.
// Erzeugt deterministisch, frame-by-frame, gestochen scharfes H.264-MP4 DIREKT im Browser.
// Kein Server, keine whammy-Kompression, keine Framedrops.
//
// mp4-muxer wird lazy als UMD-Global (window.Mp4Muxer) geladen.

const MUXER_URL = "/static/vendor/mp4-muxer.min.js";

// Lädt mp4-muxer einmalig nach (UMD -> window.Mp4Muxer).
export function loadMp4MuxerIfNeeded() {
  if (typeof window.Mp4Muxer !== "undefined") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MUXER_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("mp4-muxer konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
}

// True, wenn der Browser natives H.264-Encoding via WebCodecs unterstützt.
export async function isMp4EncodingSupported() {
  if (typeof window.VideoEncoder === "undefined") return false;
  try {
    const support = await window.VideoEncoder.isConfigSupported({
      codec: "avc1.42001f", // H.264 Baseline, Level 3.1
      width: 1280,
      height: 720
    });
    return !!(support && support.supported);
  } catch {
    return false;
  }
}

// Erzeugt einen Encoder für eine feste Auflösung.
// Breite/Höhe MÜSSEN gerade sein (H.264 yuv420p) - wird hart erzwungen.
export async function createMp4Encoder({ width, height, fps = 30, bitrate = 12_000_000 }) {
  await loadMp4MuxerIfNeeded();
  const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;

  // Gerade Dimensionen erzwingen (yuv420p Anforderung).
  const w = Math.floor(width / 2) * 2;
  const h = Math.floor(height / 2) * 2;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: w,
      height: h,
      frameRate: fps
    },
    // Ermöglicht Streaming/Abspielen ohne vollständiges Laden (moov-Atom an den Anfang).
    fastStart: "in-memory"
  });

  let encoderError = null;
  const encoder = new window.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderError = e; }
  });

  encoder.configure({
    codec: "avc1.42001f",
    width: w,
    height: h,
    bitrate,
    framerate: fps
  });

  const frameDurationUs = Math.round(1_000_000 / fps);
  let frameIndex = 0;

  return {
    width: w,
    height: h,

    // Fügt einen Frame aus einem Canvas (oder beliebigem CanvasImageSource) hinzu.
    addFrame(source) {
      if (encoderError) throw encoderError;
      const timestamp = frameIndex * frameDurationUs;
      const frame = new window.VideoFrame(source, {
        timestamp,
        duration: frameDurationUs
      });
      // Keyframe alle 1s (fps-Frames) fuer saubere Seekbarkeit.
      const keyFrame = (frameIndex % fps) === 0;
      encoder.encode(frame, { keyFrame });
      frame.close();
      frameIndex++;
    },

    // Schliesst ab und liefert den fertigen MP4-Blob.
    async finalize() {
      await encoder.flush();
      if (encoderError) throw encoderError;
      muxer.finalize();
      encoder.close();
      return new Blob([target.buffer], { type: "video/mp4" });
    },

    get frameCount() { return frameIndex; }
  };
}
