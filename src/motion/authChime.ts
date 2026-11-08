/** A short original, low-volume entry chime. It is called only from an explicit
 * user gesture so browsers do not attempt unsolicited audio on page load. */
export function playAuthChime(): void {
  if (typeof window === 'undefined') return;
  const Ctor = window.AudioContext;
  if (!Ctor) return;
  try {
    const context = new Ctor();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.055, now + 0.035);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    master.connect(context.destination);

    // A small rising, glassy chord; intentionally original and quieter than UI sounds.
    for (const [index, frequency] of [392, 523.25, 659.25].entries()) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.025);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(index === 0 ? 0.48 : 0.24, now + 0.045 + index * 0.02);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.36 + index * 0.025);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(now + index * 0.025);
      oscillator.stop(now + 0.42 + index * 0.025);
    }
    window.setTimeout(() => { void context.close().catch(() => {}); }, 650);
  } catch {
    // Audio is a decorative enhancement; registration must work if audio is unavailable.
  }
}
