# Expo Smooth Scroll

A lightweight Chrome Extension (Manifest V3) that adds silky-smooth scrolling across all websites using an **Expo Out** easing curve:

```text
easeOutExpo(t) = 1 - 2^(-10t)
```

## Features

- **Expo Out Easing:** Fast initial response with a smooth exponential deceleration tail.
- **Nested Scroll Containers:** Works on `window` as well as inner scrollable containers (sidebars, modals, chat panes, code blocks) and supports `Shift + Wheel` horizontal scrolling.
- **Boundary & External Scroll Safe:** Respects browser zoom (`Ctrl/Cmd + Wheel`), scrollbar dragging, and page-handled widgets (`e.defaultPrevented`).
- **Popup Controls:**
  - Global enable/disable toggle
  - Per-site exclusion toggle
  - Adjustable **Expo Out Duration** (`200ms` – `1500ms`)
  - Adjustable **Scroll Step Scale** (`0.5x` – `2.5x`)
  - Optional **Keyboard Smooth Scroll** (Arrows, `Space`, `PageUp` / `PageDown`)

## Installation (Developer Mode)

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select this project folder.

## Files

- `manifest.json` — Extension manifest (MV3)
- `content.js` — Smooth scroll engine
- `popup.html`, `popup.css`, `popup.js` — Settings popup UI
- `icons/` — Extension icons (`16px`, `48px`, `128px`)
