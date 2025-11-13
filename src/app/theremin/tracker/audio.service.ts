import {Injectable} from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private ctx?: AudioContext;
  private osc?: OscillatorNode;
  private gain?: GainNode;

  /**
   * Initializes WebAudio (Oscillator -> Gain -> Destination) and starts the oscillator.
   * No-op if already started.
   * @param type Oscillator waveform type
   */
  start(type: OscillatorType = 'sawtooth') {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.osc = this.ctx.createOscillator();
    this.gain = this.ctx.createGain();
    this.osc.type = type;
    this.osc.frequency.value = 220; // default pitch (A3)
    this.gain.gain.value = 0;      // start muted to avoid clicks
    this.osc.connect(this.gain).connect(this.ctx.destination);
    this.osc.start();
  }

  /**
   * Updates oscillator waveform type if active.
   */
  setType(type: OscillatorType) {
    if (this.osc) this.osc.type = type;
  }

  /**
   * Converts a MIDI note number to frequency in Hz.
   * A4 (69) = 440 Hz.
   */
  midiToFreq(n: number) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  /**
   * Smoothly updates frequency and gain using setTargetAtTime to avoid clicks.
   * Pass freq = null to keep current frequency while still updating gain.
   * No-op if audio graph not initialized.
   */
  update(freq: number | null, g: number) {
    if (!this.ctx || !this.osc || !this.gain) return;
    const now = this.ctx.currentTime;
    if (freq != null) this.osc.frequency.setTargetAtTime(freq, now, 0.01);
    this.gain.gain.setTargetAtTime(g, now, 0.02);
  }

  /**
   * Gracefully stops audio:
   * - ramps gain to 0 to prevent pop
   * - stops and disconnects nodes
   * - closes AudioContext and clears references
   */
  stop() {
    if (!this.ctx) return;
    try {
      this.gain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    } catch {
    }
    setTimeout(() => {
      try {
        this.osc?.stop();
      } catch {
      }
      try {
        this.osc?.disconnect();
        this.gain?.disconnect();
      } catch {
      }
      this.ctx?.close();
      this.ctx = undefined;
      this.osc = undefined;
      this.gain = undefined;
    }, 120);
  }
}
