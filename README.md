# Handwriting Notes

A note taking web app that renders notes as neat handwriting on ruled paper, lets you
draw over them with pens and pencils, and turns an instruction plus attachments into
finished handwritten pages with the Claude API. It opens on a full set of Sets and
Venn Diagrams notes so you can see the look immediately.

Everything runs in the browser. There is no backend and nothing to deploy or pay for:
your work is saved locally in the browser, and the Claude API is called directly with
a key you enter once and that never leaves your machine except to reach Anthropic.

## Running it

```bash
bun install
bun dev
```

Open the printed URL. To generate notes with Claude, click the key button and paste an
Anthropic API key from console.anthropic.com. It is stored only in this browser.

## What it does

- **The paper.** A ruled A4 sheet drawn as real vector lines, uniform at any zoom. Sheet
  styles are presets; the light blue college ruled sheet is the default.
- **Handwriting.** Two embedded fonts, Caveat for body and Indie Flower for titles and
  headings, coloured with the note palette. Nothing is fetched from a CDN.
- **Hand-drawn diagrams.** A seeded wobble engine draws circles, boxes, triangles, and
  arrows so figures look pen-drawn, never like clip art. Any figure is expressible as a
  scene of primitives, so the engine is not limited to the built-in Venn layouts.
- **Drawing.** Pencil, fine pen, marker, highlighter, and eraser, with adjustable width
  and an editable colour palette that also tints generated diagrams.
- **Compose with Claude.** Type an instruction, attach photos, PDFs, or a video with a
  pasted transcript, and Claude writes the notes onto new pages.
- **Local first.** Text, ink, settings, and attachments autosave to IndexedDB and
  restore after a refresh, a crash, or going offline.
- **Export.** PDF (a true vector page: the sheet as lines, the writing in the embedded
  fonts, the diagrams as pen paths) and DOCX.

## Verifying

```bash
bun run typecheck   # vue-tsc
bun run lint        # eslint + prettier
bun run test        # vitest unit tests
bun run test:e2e    # playwright: ruling uniformity + hand-drawn diagrams
```

## Layout

```
src/
  paper/        the ruled sheet: spec and vector component
  diagrams/     wobble engine, scene model, renderer, component
  editor/       note page, writing layer, ink layer, grid alignment
  tools/        pens, toolbar, colour palette
  compose/      instruction bar, attachments, the Claude call
  ai/           system prompt, attachment encoding, output parsing, dash lint
  store/        document and settings stores, IndexedDB persistence
  content/      the default Sets and Venn Diagrams document
  export/       PDF and DOCX exporters
```
