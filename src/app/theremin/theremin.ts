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


  useFront = true;
  waveform: OscillatorType = 'sawtooth';
  smooth = 0.75; // 0..0.95
  gainMax = 0.8; // 0.1..1
  pitchRange = 48; // semitones


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


  ngAfterViewInit() {
// Resize canvas to video on layout changes
    const ro = new ResizeObserver(() => this.resizeCanvas());
    ro.observe(this.videoEl.nativeElement);
    this.destroy.onDestroy(() => ro.disconnect());
  }

  async start() {
    try {
      await this.tracker.startCamera(this.videoEl.nativeElement, this.useFront);
      await this.tracker.initHandLandmarker();
      this.audio.start(this.waveform);
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
    const ctx = this.canvasEl.nativeElement.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvasEl.nativeElement.width, this.canvasEl.nativeElement.height);
    this.hands = 0;
    this.freqDisp = '–';
    this.midiDisp = '–';
    this.gainPct = 0;
  }


  flip() {
    this.useFront = !this.useFront;
    if (this.started) {
      this.tracker.stopCamera();
      this.tracker.startCamera(this.videoEl.nativeElement, this.useFront);
    }
  }

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
      const tip = lm[8];
      const rawX = this.useFront ? 1 - tip.x : tip.x;
      const rawY = tip.y;
      const k = this.smooth;
      const sx = this.tracker.smoothX(rawX, k);
      const sy = this.tracker.smoothY(rawY, k);
      (window as any).thereminX = sx;
      (window as any).thereminY = sy;


      this.drawHUD(ctx, canvas, lm, sx, sy);


// Map Y -> pitch, X -> gain
      const midi = 40 + (1 - sy) * this.pitchRange;
      const freq = this.audio.midiToFreq(midi);
      const g = Math.max(0, Math.min(1, sx)) * this.gainMax;


      this.audio.update(freq, g);
      this.freqDisp = freq.toFixed(1);
      this.midiDisp = midi.toFixed(1);
      this.gainPct = Math.round(Math.max(0, Math.min(1, sx)) * 100);
    } else {
      this.hands = 0;
      this.audio.update(null, 0);
      this.freqDisp = this.midiDisp = '–';
      this.gainPct = 0;
    }

    this.raf = requestAnimationFrame(() => this.loop());
  }


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
    const x = nx * W, y = ny * H;
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
}
