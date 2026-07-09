# Handwriting Notes

A note-taking web app that turns what you type into neat handwriting on ruled paper.
You start on a blank page and build the note with a full set of tools: titles and
headings, bold, italic, underline and colour, lists, tables, callout boxes, and
hand-drawn diagrams. You can also draw and fill shapes freehand, and ask Claude to
draft a whole note for you using those same tools.

Everything runs in the browser. There is no backend and nothing to deploy or pay for.
Your work is saved locally in the browser. The app and all of its tools are free; the
AI drafting feature calls Claude with a key you enter once, which stays on your device.

## Running it

```bash
bun install
bun dev
```

Open the printed URL and start writing.

## What you can do

- **Write on real paper.** A ruled sheet drawn as crisp vector lines that grows as you
  fill it, so you are never stopped by a page edge. Add pages or break to a new one
  whenever you like.
- **Format freely.** Turn any line into a title, subtitle, heading, subheading, body,
  or caption. Make text bold, italic, or underlined, and colour any word, heading, or
  highlight from a rich colour picker with a full spectrum, hex entry, and your recent
  and saved swatches. Long-press or select text for the quick menu.
- **Structure a note.** Numbered and bulleted lists, tables, and coloured callout
  boxes, all ruled by hand so they match the paper.
- **Draw diagrams.** Insert Venn diagrams, triangles, and flow figures, or let the
  engine place any custom shape. Every figure is drawn pen-style, never a stiff
  perfect circle.
- **Draw by hand.** Pencil, fine pen, marker, highlighter, and an eraser, with
  adjustable width and any colour. Tap the fill tool inside a shape you drew to colour
  it in.
- **Write with AI, live.** Describe the note you want, attach photos, a PDF, or a video
  with its transcript, and watch Claude write it onto a fresh page in real time, line by
  line, using the same tools you have. Stop any time, then keep editing what it wrote.
  This needs your own Anthropic key, entered from the key button.
- **Nothing is lost.** Text, drawings, settings, and attachments save to the browser
  and come back after a refresh or going offline.
- **Save as.** Export to PDF (a true vector page) or to a Word document.

## Verifying

```bash
bun run typecheck
bun run lint
bun run test
bun run test:e2e
```

## Layout

```
src/
  paper/     the ruled sheet: spec and vector component
  editor/    pages, the writing layer, blocks, ink, the tool bar and menus
  diagrams/  the pen-drawn shape engine, scene model, and presets
  tools/     pens and widths
  ui/        icons, colour picker, popovers, dialogs
  compose/   the AI panel, attachments, and the Claude call
  ai/        prompt, attachment encoding, output parsing, dash lint
  store/     document and settings stores, local persistence
  export/    PDF and Word exporters
```
