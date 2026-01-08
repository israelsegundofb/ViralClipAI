export {};

declare global {
  interface VideoFrameMetadata {
    presentationTime: number;
    expectedDisplayTime: number;
    width: number;
    height: number;
    mediaTime: number;
    presentedFrames: number;
    processingDuration?: number;
    captureTime?: number;
    receiveTime?: number;
    rtpTimestamp?: number;
  }

  interface HTMLVideoElement {
    requestVideoFrameCallback(callback: (now: number, metadata: VideoFrameMetadata) => void): number;
    cancelVideoFrameCallback(handle: number): void;
  }
}
