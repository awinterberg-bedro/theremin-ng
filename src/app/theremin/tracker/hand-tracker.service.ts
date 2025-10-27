import {Injectable} from '@angular/core';
import {FilesetResolver, HandLandmarker, HandLandmarkerResult} from '@mediapipe/tasks-vision';

@Injectable({
  providedIn: 'root'
})
export class HandTrackerService {
  private stream?: MediaStream;
  private landmarker?: HandLandmarker;
  private sx = 0.5; // smoothed X
  private sy = 0.5; // smoothed Y

  /**
   * Starts a camera stream and attaches it to a <video> element.
   * No-op if a stream is already active.
   */
  async startCamera(video: HTMLVideoElement, useFront = true) {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {facingMode: useFront ? 'user' : 'environment', width: {ideal: 1920}, height: {ideal: 1080}},
      audio: false
    });
    video.srcObject = this.stream;
    await video.play();
  }

  /**
   * Stops all active media tracks and clears the stream reference.
   */
  stopCamera() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
  }

  /**
   * Initializes the HandLandmarker with a local model.
   * Configured for VIDEO mode, single hand, with modest confidence thresholds.
   * No-op if already initialized.
   */
  async initHandLandmarker() {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm`);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `assets/models/hand_landmarker.task`
      },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
  }

  /**
   * Runs hand landmark detection for a video frame.
   * Returns empty landmarks if the landmarker is not ready.
   */
  detect(video: HTMLVideoElement): HandLandmarkerResult {
    if (!this.landmarker) return {landmarks: []} as any;
    return this.landmarker.detectForVideo(video, performance.now());
  }

  /**
   * Exponential moving average for X coordinate.
   * k: 0..1 (higher = smoother/slower to change).
   */
  smoothX(v: number, k: number) {
    this.sx = this.sx * k + v * (1 - k);
    return this.sx;
  }

  /**
   * Exponential moving average for Y coordinate.
   * k: 0..1 (higher = smoother/slower to change).
   */
  smoothY(v: number, k: number) {
    this.sy = this.sy * k + v * (1 - k);
    return this.sy;
  }
}
