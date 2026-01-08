export {};

declare global {
  interface HTMLVideoElement {
    captureStream(fps?: number): MediaStream;
    mozCaptureStream(fps?: number): MediaStream;
  }
}
