/**
 * Haptic feedback utility for mobile interactions.
 *
 * Uses the Vibration API on Android and falls back to a no-op
 * on iOS / desktop (iOS Safari doesn't support navigator.vibrate,
 * but native-wrapped PWAs can add their own bridge).
 *
 * Intensity presets map to vibration durations in ms.
 */

type HapticStyle = "light" | "medium" | "heavy" | "selection";

const DURATIONS: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  selection: [5, 5, 5], // double-tap pattern
};

export function haptic(style: HapticStyle = "light") {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(DURATIONS[style]);
    } catch {
      // Silently fail — vibration is non-critical
    }
  }
}

/**
 * Returns true if the device likely supports haptic feedback.
 * Useful for conditionally showing haptic-related UI hints.
 */
export function supportsHaptics(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}
