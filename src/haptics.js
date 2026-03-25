/**
 * Haptic when the user presses the hold-to-record control (long-press gesture).
 * Must be called synchronously from pointerdown so iOS/WebKit keeps user activation.
 * Uses Vibration API (iOS support varies; strong on Android). No web UIFeedbackGenerator.
 */
export function hapticRecordingLongPress() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate([12, 52, 14]);
  } catch (_) {
    try {
      navigator.vibrate(14);
    } catch (_) {
      /* ignore */
    }
  }
}
