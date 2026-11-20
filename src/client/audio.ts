/**
 * Procedural Web Audio night soundtrack + full Phase 2 SFX suite.
 * Client-only; never imported by src/core/.
 */
export class FairyAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  public volume = 0.65;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || this.volume <= 0.001 || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
    return this.ctx;
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
  }

  public setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
  }

  public startNightMusic(): void {
    if (this.bgmTimer !== null || typeof window === 'undefined') return;
    // Gentle Vietnamese pentatonic lullaby notes (D minor / F major pentatonic)
    const scale = [293.66, 349.23, 392.0, 440.0, 523.25, 440.0, 392.0, 349.23];
    this.bgmTimer = window.setInterval(() => {
      const ctx = this.ensureContext();
      if (!ctx || !this.masterGain) return;
      const freq = scale[this.bgmStep % scale.length]!;
      this.bgmStep += 1;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.032, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.4);
    }, 1500);
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
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideToFreq), now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playMotePick(carried: number): void {
    const base = 523.25 * Math.pow(1.05, Math.min(carried, 10));
    this.playTone(base, 0.14, 'sine', 0.14);
    this.playTone(base * 1.5, 0.16, 'triangle', 0.08, 0.03);
  }

  public playDeposit(): void {
    this.playTone(440, 0.14, 'triangle', 0.12);
    this.playTone(659.25, 0.2, 'sine', 0.11, 0.05);
  }

  public playLanternLit(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      this.playTone(f, 0.55, 'sine', 0.12, idx * 0.06);
    });
  }

  public playPulse(): void {
    this.playTone(300, 0.3, 'sine', 0.16, 0, 920);
    this.playTone(620, 0.26, 'triangle', 0.09, 0.04, 1180);
  }

  public playJump(): void {
    this.playTone(260, 0.15, 'sine', 0.1, 0, 520);
  }

  public playDash(): void {
    this.playTone(640, 0.16, 'triangle', 0.13, 0, 240);
    this.playTone(880, 0.12, 'sine', 0.07, 0.02, 420);
  }

  public playCharm(): void {
    [587.33, 880, 1174.66].forEach((f, i) => this.playTone(f, 0.24, 'triangle', 0.11, i * 0.05));
  }

  public playHit(): void {
    this.playTone(185, 0.28, 'sawtooth', 0.12, 0, 82);
  }

  public playShadeSpawn(): void {
    this.playTone(140, 0.42, 'sine', 0.1, 0, 95);
    this.playTone(210, 0.35, 'triangle', 0.06, 0.08, 130);
  }

  public playDrifterSteal(): void {
    this.playTone(760, 0.22, 'sawtooth', 0.08, 0, 310);
  }

  public playWindWarning(): void {
    this.playTone(220, 0.5, 'sine', 0.08, 0, 340);
  }

  public playCountdownTick(): void {
    this.playTone(880, 0.08, 'square', 0.07);
  }

  public playWin(): void {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, idx) => {
      this.playTone(f, 0.45, 'triangle', 0.12, idx * 0.09);
    });
  }

  public playLose(): void {
    [392.0, 349.23, 293.66, 220.0].forEach((f, idx) => {
      this.playTone(f, 0.42, 'sine', 0.12, idx * 0.12);
    });
  }
}
