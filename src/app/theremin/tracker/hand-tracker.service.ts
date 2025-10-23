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

  async startCamera(video: HTMLVideoElement, useFront = true) {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {facingMode: useFront ? 'user' : 'environment', width: {ideal: 1280}, height: {ideal: 720}},
      audio: false
    });
    video.srcObject = this.stream;
    await video.play();
  }

  stopCamera() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
  }

  async initHandLandmarker() {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm`);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `assets/models/hand_landmarker.task`
      },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
  }

  detect(video: HTMLVideoElement): HandLandmarkerResult {
    if (!this.landmarker) return {landmarks: []} as any;
    return this.landmarker.detectForVideo(video, performance.now());
  }

  smoothX(v: number, k: number) {
    this.sx = this.sx * k + v * (1 - k);
    return this.sx;
  }

  smoothY(v: number, k: number) {
    this.sy = this.sy * k + v * (1 - k);
    return this.sy;
  }
}
