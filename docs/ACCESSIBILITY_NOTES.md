# Accessibility notes

Target: WCAG 2.2 level AA. This is a design target and an automated-test result, **not** a certification.

## Contrast (computed from the CSS tokens)

| Pair | Light | Dark |
|---|---:|---:|
| Body text on page background | 16.7 : 1 | 18.1 : 1 |
| Muted text on page background | 7.3 : 1 | 9.2 : 1 |
| Muted text on raised surface | 7.0 : 1 | 7.1 : 1 |
| Link colour on page background | 6.4 : 1 | 11.0 : 1 |
| Primary button text on button colour | 6.7 : 1 | 5.2 : 1 |
| Text on difficulty/status tints | ≥ 14 : 1 | ≥ 9 : 1 |
| Input border (muted) on surface | 7.6 : 1 | 8.1 : 1 |
| Diagram stroke on surface | 5.7 : 1 | |

Required: 4.5:1 text, 3:1 non-text.

## Keyboard model

Skip link; visible 3 px focus ring on every control; no keyboard traps (native `<dialog>` for confirmations); targets at least 40 px; scroll containers (tables, code, diagrams) are focusable. Study shortcuts: **Space** show answer, **1–4** rate (only after the answer is shown), **← →** previous/next, **B** bookmark, **R** read aloud, **Esc** stop audio or pause. Shortcuts are ignored while typing in a field, can be switched off in Settings, and never fire with Ctrl, Meta or Alt.

## Announcements

Route changes move focus to the page `<h1>` and announce the title; rating results, timer expiry, filter result counts, audio state, download progress and errors use live regions or `role="alert"`/`role="status"`. The countdown itself is not announced every second, only at expiry.

## Motion, colour, zoom

`prefers-reduced-motion` disables transitions and animations. Light and dark themes follow the system and can be overridden. The layout is fluid; no horizontal page scroll was found at 375 px on key pages (automated). 320 px and 400 % zoom were not checked by hand.

## What was tested

- axe-core (WCAG 2.0/2.1/2.2 A and AA rules plus best practices) on 12 public and app pages and a live study session, in light and dark themes: 0 violations at the time of writing (see the validation report).
- Lighthouse accessibility 100 on a question page (mobile profile).
- Keyboard-driven end-to-end flows.

## What was not tested

Real screen readers (NVDA, JAWS, VoiceOver, TalkBack), speech-control software, forced-colours mode, 400 % zoom by hand, or an independent audit. Treat conformance claims accordingly.
