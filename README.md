# Handwriting Notes

A note-taking web app that turns what you type into neat handwriting on ruled paper.
You start on a blank page and build the note with a full set of tools: titles and
headings, bold, italic, underline and colour, lists, tables, callout boxes, and
hand-drawn diagrams. You can also draw and fill shapes freehand, and ask an AI to
draft a whole note for you using those same tools.

Everything runs in the browser. There is no backend and nothing to deploy or pay for.
Your work is saved locally in the browser. The app and all of its tools are free; the
AI drafting feature calls the provider you choose (Claude, ChatGPT, Gemini, or DeepSeek)
with a key you enter once, which stays on your device and is sent only to that provider.

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
- **Write with AI, live.** Describe the note you want, attach photos, a PDF, a video with
  its transcript, or a recorded voice note, and watch the AI write it onto a fresh page in
  real time, line by line, using the same tools you have. Stop any time, then keep editing
  what it wrote. This needs your own key for the provider you connect (see below).
- **Nothing is lost.** Text, drawings, settings, and attachments save to the browser
  and come back after a refresh or going offline.
- **Save as.** Export to PDF (a true vector page) or to a Word document.

## Connecting an AI

Drafting and rewriting are the only features that call out to a provider, and they use
**your own key**. Open the key button and pick a provider; each shows the short steps and
a link to create a key. A key is stored only in this browser and sent only to its own
vendor. You can connect more than one and switch which is in use; Claude is the default.

| Provider | Reads | Where to get a key | Default model (override) |
|---|---|---|---|
| **Claude** (Anthropic) | text, images, PDF | [console.anthropic.com](https://console.anthropic.com/settings/keys) | `claude-sonnet-5` (`VITE_ANTHROPIC_MODEL`) |
| **ChatGPT** (OpenAI) | text, images, PDF, Word and other documents | [platform.openai.com](https://platform.openai.com/api-keys) | `gpt-5.5` (`VITE_OPENAI_MODEL`) |
| **Gemini** (Google) | text, images, PDF | [aistudio.google.com](https://aistudio.google.com/app/apikey) | `gemini-flash-latest` (`VITE_GEMINI_MODEL`) |
| **DeepSeek** | text only | [platform.deepseek.com](https://platform.deepseek.com/api_keys) | `deepseek-v4-flash` (`VITE_DEEPSEEK_MODEL`) |

Attachments are matched to what the chosen model can read: images go to the ones with
vision, a PDF goes to the ones that open PDFs, ChatGPT also reads Word, PowerPoint, Excel,
and CSV files, and a plain text file is readable by all of them. Anything a model cannot
take is summarised in a line instead, so the request still goes through.

To pin a different model, set the matching `VITE_*_MODEL` variable in a `.env.local` file.
Model names move quickly; these defaults were current in mid 2026, and the override lets
you follow a newer one without a code change.
A recorded voice note is transcribed on the device (the browser's recogniser, falling
back to a small on-device model) and the text is what reaches the AI.

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
  compose/   the AI panel, attachments, voice notes, and the provider call
  ai/        prompt, attachment encoding, output parsing, dash lint
  ai/providers/  Claude, ChatGPT, Gemini, and DeepSeek behind one interface
  store/     document and settings stores, local persistence
  export/    PDF and Word exporters
```
