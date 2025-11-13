import {AfterViewInit, Component, DestroyRef, ElementRef, inject, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AudioService} from './tracker/audio.service';
import {HandTrackerService} from './tracker/hand-tracker.service';

@Component({
  selector: 'app-theremin',
  imports: [
    FormsModule
  ],
  templateUrl: './theremin.html',
  styleUrl: './theremin.scss',
})
export class Theremin implements AfterViewInit {
  @ViewChild('video', {static: true}) videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('overlay', {static: true}) canvasEl!: ElementRef<HTMLCanvasElement>;

  // Selects which audio path is active:
  // - 'web': direct WebAudio oscillator
  // - 'strudel': external Strudel engine reads window.thereminX/Y
  audioMode: 'web' | 'strudel' = 'web';

  useFront = true;
  waveform: OscillatorType = 'sawtooth';
  smooth = 0.75; // 0..0.95, higher = more smoothing
  gainMax = 0.8; // 0.1..1, limits overall loudness
  pitchRange = 48;

  strudelRunning = false;
  started = false;
  hands = 0;
  freqDisp = '–';
  midiDisp = '–';
  gainPct = 0;
  audio: AudioService = inject(AudioService);
  private raf = 0;

  constructor(
    private tracker: HandTrackerService,
    private destroy: DestroyRef
  ) {
  }

  /**
   * Sets up canvas resizing to match the video element on layout changes.
   */
  ngAfterViewInit() {
    // Resize canvas to video on layout changes
    const ro = new ResizeObserver(() => this.resizeCanvas());
    ro.observe(this.videoEl.nativeElement);
    this.destroy.onDestroy(() => ro.disconnect());
  }

  /**
   * Starts camera and hand tracking. Activates the selected audio path.
   * Kicks off the animation loop for continuous tracking and rendering.
   */
  async start() {
    try {
      await this.tracker.startCamera(this.videoEl.nativeElement, this.useFront);
      await this.tracker.initHandLandmarker();

      // start/stop WebAudio depending on current mode
      if (this.audioMode === 'web') this.audio.start(this.waveform);
      else this.audio.stop();

      this.started = true;
      cancelAnimationFrame(this.raf);
      this.loop();
    } catch (e) {
      alert('Kamera/Tracking konnte nicht gestartet werden: ' + e);
    }
  }


  stop() {
    this.started = false;
    cancelAnimationFrame(this.raf);
    this.audio.stop();
    this.tracker.stopCamera();

    const video = this.videoEl.nativeElement;
    try {
      video.pause();
      (video as any).srcObject = null;
      video.removeAttribute('src');
      video.load();
    } catch (e) {}

    const ctx = this.canvasEl.nativeElement.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvasEl.nativeElement.width, this.canvasEl.nativeElement.height);
    this.hands = 0;
    this.freqDisp = '–';
    this.midiDisp = '–';
    this.gainPct = 0;
  }


  /**
   * Main animation loop:
   * - resizes canvas to match video on each frame (handles CSS scaling/DPR)
   * - runs hand detection and draws HUD
   * - maps smoothed finger tip position to pitch (Y) and gain (X)
   * - updates WebAudio or publishes values for Strudel
   */
  private loop() {
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    const ctx = canvas.getContext('2d')!;
    this.resizeCanvas();

    const res = this.tracker.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (res.landmarks && res.landmarks[0]) {
      this.hands = 1;
      const lm = res.landmarks[0];

      // Use index finger tip (landmark 8). Coordinates are normalized (0..1).
      const tip = lm[8];
      const rawX = this.useFront ? 1 - tip.x : tip.x; // mirror horizontally for front camera
      const rawY = tip.y;

      // Exponential smoothing to stabilize jittery landmarks.
      const k = this.smooth;
      const sx = this.tracker.smoothX(rawX, k);
      const sy = this.tracker.smoothY(rawY, k);

      // Expose values for external engines (e.g., Strudel) and emit a custom event.
      (window as any).thereminX = sx;
      (window as any).thereminY = sy;
      (window as any).thereminMode = this.audioMode;
      const e = new CustomEvent('theremin', {detail: {x: sx, y: sy, mode: this.audioMode}});
      window.dispatchEvent(e)

      this.drawHUD(ctx, canvas, lm, sx, sy);

      // Map Y -> pitch (higher on screen = lower pitch), X -> gain.
      const midi = 40 + (1 - sy) * this.pitchRange;
      const freq = this.audio.midiToFreq(midi);
      const g = Math.max(0, Math.min(1, sx)) * this.gainMax; // clamp to 0..1 then apply max

      // WebAudio path only if mode=web; otherwise keep WebAudio silent.
      if (this.audioMode === 'web') {
        this.audio.update(freq, g);
      } else {
        this.audio.update(null, 0);
      }

      // Update UI readouts.
      this.freqDisp = freq.toFixed(1);
      this.midiDisp = midi.toFixed(1);
      this.gainPct = Math.round(Math.max(0, Math.min(1, sx)) * 100);
    } else {
      // No hand detected; silence audio and reset stats.
      this.hands = 0;
      (window as any).thereminMode = this.audioMode;
      this.audio.update(null, 0);
      this.freqDisp = this.midiDisp = '–';
      this.gainPct = 0;
    }

    this.raf = requestAnimationFrame(() => this.loop());
  }

  /**
   * Matches canvas to the current CSS size and device pixel ratio
   * to keep drawings correctly scaled.
   */
  private resizeCanvas() {
    const video = this.videoEl.nativeElement;
    const canvas = this.canvasEl.nativeElement;
    const rect = video.getBoundingClientRect();
    const dpr = devicePixelRatio;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Renders landmarks and simple HUD:
   * - dots for each landmark
   * - circle at the smoothed tip position
   * - crosshair lines indicating current X/Y
   */
  private drawHUD(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, lm: any[], nx: number, ny: number) {
    const W = canvas.width / devicePixelRatio;
    const H = canvas.height / devicePixelRatio;
    ctx.save();
    ctx.strokeStyle = '#6ea8ff';
    ctx.fillStyle = '#6ea8ff';
    ctx.lineWidth = 2;

    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const x = (1 - nx) * W, y = ny * H;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([6, 6]);
    ctx.globalAlpha = .7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Returns the Strudel editor element if present in the DOM.
   */
  private get strudelEl(): any {
    return document.querySelector('strudel-editor') as any;
  }

  /**
   * Attempts to start evaluation in Strudel editor and starts the scheduler, if available.
   * Sets strudelRunning flag on true.
   */
  private evalStrudelIfAvailable() {
    try {
      this.strudelEl?.editor?.evaluate?.();
      this.strudelEl?.editor?.start();
      this.strudelRunning = true;
    } catch {
    }
  }

  /**
   * Attempts to stop Strudel playback, if available.
   * Clears strudelRunning flag on success.
   */
  private stopStrudelIfAvailable() {
    try {
      this.strudelEl?.editor?.stop();
      this.strudelRunning = false;
    } catch {
    }
  }

  /**
   * Updates the currently selected waveform; only applies to WebAudio mode.
   */
  setWaveform(type: OscillatorType) {
    this.waveform = type;
    if (this.audioMode === 'web') this.audio.setType(type);
  }

  /**
   * Switches between WebAudio and Strudel modes.
   * Starts or stops the corresponding engine and publishes the mode globally.
   */
  onAudioModeChange() {
    // publish the current mode for Strudel to read
    (window as any).thereminMode = this.audioMode;
    if (this.audioMode === 'web') {
      this.audio.start(this.waveform);
      this.stopStrudelIfAvailable()
    } else {
      this.audio.stop();
      this.evalStrudelIfAvailable();
    }
  }
}
