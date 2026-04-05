---
description: "Use when editing JavaScript or HTML templates for the web annotation UI. Covers canvas drawing, fetch API calls, CSRF tokens, and dark theme CSS patterns."
applyTo: ["web/static/**", "web/templates/**"]
---

# Frontend Conventions

## JavaScript (annotator.js)
- Vanilla JS only — no frameworks, no build step.
- Wrapped in an IIFE: `(function() { ... })()`.
- Canvas coordinates convert between display and original image size via `toCanvas()` / `toOriginal()`.
- API calls use `fetch()` with `X-CSRFToken` header from `window.CSRF_TOKEN`.
- Annotations stored in a local `annotations` array, synced with the server on save.

## Templates
- All templates extend `base.html` which provides `{% block title %}` and `{% block content %}`.
- `annotate.html` injects JS variables in a `<script>` block: `VIDEO_ID`, `FRAME_URL`, `INITIAL_ANNOTATIONS`, `CSRF_TOKEN`, `IMG_WIDTH`, `IMG_HEIGHT`.
- Use `{% csrf_token %}` in all forms.
- Static files loaded with `{% load static %}` and `{% static 'path' %}`.

## CSS (style.css)
- Dark theme using CSS custom properties: `--bg-primary`, `--bg-secondary`, `--text-primary`, `--accent`.
- Component classes: `.navbar`, `.sidebar`, `.canvas-area`, `.btn`, `.btn-accent`, `.upload-zone`.
- No CSS preprocessor — plain CSS only.
