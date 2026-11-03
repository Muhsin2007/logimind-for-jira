// Control, zero-width and bidi-override characters can hide or reorder text shown to a model.
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u001F\u007F​-‏‪-‮⁠-⁩﻿]/g;

/**
 * Makes CSV-sourced (untrusted) text safe to show to a model: hidden characters and line
 * breaks become spaces, whitespace is collapsed and the length capped with an ellipsis.
 */
export function cleanUntrusted(value: string | null | undefined, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replace(HIDDEN, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}
