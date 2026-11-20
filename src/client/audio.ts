/**
 * Procedural Web Audio fairy-tale sound effects (client-only; never imported by src/core).
 */
export class FairyAudio {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType,
    gainPeak: number,
    delaySec = 0,
    slideToFreq?: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playMotePick(carried: number): void {
    const base = 523.25 * Math.pow(1.06, Math.min(carried, 6));
    this.playTone(base, 0.16, 'sine', 0.11);
    this.playTone(base * 1.5, 0.18, 'triangle', 0.06, 0.04);
  }

  public playDeposit(): void {
    this.playTone(440, 0.14, 'triangle', 0.1);
    this.playTone(659.25, 0.2, 'sine', 0.09, 0.06);
  }

  public playLanternLit(): void {
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f, idx) => {
      this.playTone(f, 0.55, 'sine', 0.09, idx * 0.06);
    });
  }

  public playPulse(): void {
    this.playTone(320, 0.32, 'sine', 0.13, 0, 880);
    this.playTone(640, 0.28, 'triangle', 0.07, 0.05, 1120);
  }

  public playHit(): void {
    this.playTone(190, 0.26, 'sawtooth', 0.09, 0, 95);
  }

  public playWin(): void {
    const melody = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    melody.forEach((f, idx) => {
      this.playTone(f, 0.45, 'triangle', 0.1, idx * 0.1);
    });
  }

  public playLose(): void {
    const notes = [392.0, 349.23, 293.66, 220.0];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.4, 'sine', 0.09, idx * 0.12);
    });
  }
}
