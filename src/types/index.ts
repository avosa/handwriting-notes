// Domain types shared across the editor, stores, AI layer, and exporters.

export type PenType = 'pencil' | 'fine' | 'marker' | 'highlighter' | 'eraser' | 'fill'

export type InkColor = string

/** A single freehand stroke captured from the ink canvas of one page. */
export interface Stroke {
  id: string
  tool: PenType
  color: InkColor
  width: number
  points: StrokePoint[]
  /** When set, the closed shape the stroke outlines is flooded with this colour. */
  fill?: string
}

export interface StrokePoint {
  x: number
  y: number
  pressure: number
}

/**
 * The kind of line a paragraph is. The role sets the default font and colour: titles
 * and headings use the header font, body and captions the body font. Every default is
 * only a starting point; a paragraph or an individual run can override the colour.
 */
export type TextRole = 'title' | 'subtitle' | 'heading' | 'subheading' | 'body' | 'caption'

export type TextAlign = 'left' | 'center' | 'justify'

/** A span of text carrying its own emphasis and colour. */
export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  highlight?: string
}

/** One line of writing: a role, its runs, and how it sits on the page. */
export interface Paragraph {
  id: string
  role: TextRole
  runs: TextRun[]
  align?: TextAlign
  /** Extra left inset in millimetres, for indented passages. */
  indent?: number
}

/** A coloured, bordered box holding a heading and a few lines, drawn hand-ruled. */
export interface CalloutBox {
  color: string
  heading: TextRun[]
  items: TextRun[][]
}

/**
 * The primitive vocabulary of the diagram engine. Any figure a user or the AI asks
 * for is a list of these pen-drawn shapes on a normalised canvas; the wobble engine
 * turns each into a hand-drawn path and labels carry the writing. Coordinates span
 * 0..canvas.width by 0..canvas.height, so a scene is independent of the size it
 * renders at on the page.
 */
export type DiagramShape =
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; color: string; fill?: string }
  | { type: 'rect'; x: number; y: number; w: number; h: number; color: string; fill?: string }
  | { type: 'triangle'; points: [Point, Point, Point]; color: string; fill?: string }
  | { type: 'arrow'; from: Point; to: Point; color: string }
  | { type: 'line'; from: Point; to: Point; color: string }
  | { type: 'label'; at: Point; text: string; color: string; size?: number; anchor?: 'start' | 'middle' | 'end' }

export interface Point {
  x: number
  y: number
}

/** A complete drawing: a canvas the shapes live on, painted in order. */
export interface DiagramScene {
  canvas: { width: number; height: number }
  shapes: DiagramShape[]
}

/**
 * What the AI emits and the store persists. A `scene` is a fully custom drawing so
 * any figure is expressible. The named kinds are shorthands for the Venn layouts in
 * the sample notes; the client expands them into a scene before rendering, so custom
 * and preset diagrams run through the exact same pen-drawn engine.
 */
export type DiagramSpec =
  | { kind: 'scene'; scene: DiagramScene }
  | {
      kind: 'venn-subset'
      universeLabel: string
      outer: LabeledSet
      inner: LabeledSet
      caption: string
    }
  | {
      kind: 'venn-overlap'
      universeLabel: string
      left: LabeledSet
      right: LabeledSet
      middleLabel?: string
      middleColor?: string
      shade?: 'intersection' | 'union' | 'none'
      caption: string
    }
  | {
      kind: 'venn-disjoint'
      universeLabel: string
      left: LabeledSet
      right: LabeledSet
      caption: string
    }
  | {
      kind: 'venn-three'
      universeLabel: string
      a: LabeledSet
      b: LabeledSet
      c: LabeledSet
      centerLabel?: string
      caption: string
    }
  | {
      kind: 'triangle'
      direction: 'up' | 'down'
      topLabel: string
      bottomLabel: string
      color: string
    }

export interface LabeledSet {
  label: string
  color: string
}

/**
 * Where a floating figure sits on its page, in millimetres from the top left, and how
 * wide it is drawn. A block without this flows down the page in order; a block with it is
 * lifted out and can be dragged anywhere.
 */
export interface FloatPos {
  x: number
  y: number
  width: number
}

/**
 * How large a block's writing is drawn, as a multiple of its natural size. Left unset it
 * is 1; a writer can dial any block up or down so a heading, a table's cells, or a
 * diagram's letters carry exactly the weight they want.
 */
export type FontScale = number

/** The things that flow down a page, in order, unless lifted out to float. */
export type Block =
  | { id: string; type: 'text'; text: Paragraph; float?: FloatPos; scale?: FontScale }
  | {
      id: string
      type: 'list'
      ordered: boolean
      items: TextRun[][]
      indent?: number
      float?: FloatPos
      scale?: FontScale
    }
  | {
      id: string
      type: 'table'
      header: string[]
      rows: string[][]
      caption?: string
      float?: FloatPos
      scale?: FontScale
    }
  | { id: string; type: 'callouts'; boxes: CalloutBox[]; caption?: string; float?: FloatPos; scale?: FontScale }
  | { id: string; type: 'diagram'; spec: DiagramSpec; heightRules: number; float?: FloatPos; scale?: FontScale }

/**
 * A line of writing placed anywhere on the page, the way you would jot a note beside a
 * figure. It sits at a position in millimetres with no box around it, just handwriting.
 */
export interface FreeText {
  id: string
  x: number
  y: number
  runs: TextRun[]
  color?: string
  /** How large the note is drawn, a multiple of the body size; matches a block's scale. */
  scale?: FontScale
  /** What kind of line the note is, so it can be made a title or heading like a paragraph.
   *  Unset means body. */
  role?: TextRole
}

export interface Page {
  id: string
  index: number
  presetId: string
  blocks: Block[]
  strokes: Stroke[]
  /** Free notes placed anywhere on the page, over and around the flowing content. */
  notes?: FreeText[]
}

export interface NoteDocument {
  id: string
  title: string
  pages: Page[]
  createdAt: number
  updatedAt: number
}

/** One row in the notes library: enough to list and open a note without loading it. */
export interface LibraryEntry {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  favorite: boolean
}

export type AttachmentKind = 'image' | 'video' | 'document' | 'audio'

export interface Attachment {
  id: string
  kind: AttachmentKind
  name: string
  mime: string
  size: number
  /** Key of the blob held in IndexedDB. */
  blobRef: string
  /** Transcript text. Pasted for video, spoken-and-recognised for audio, since neither
   *  is readable by the model as raw bytes. */
  transcript?: string
  /** Length in milliseconds, for audio and video. */
  durationMs?: number
  /** True while a voice note is being transcribed on the device. */
  transcribing?: boolean
}

export interface Handwriting {
  id: string
  name: string
  bodyFont: string
  headerFont: string
  palette: ColorScheme
}

export interface ColorScheme {
  title: string
  heading: string
  ink: string
  penBlue: string
  penGreen: string
  penRed: string
}

export type ThemeChoice = 'system' | 'light' | 'dark'

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek'

export interface Settings {
  activeHandwritingId: string
  /** Which theme the writer prefers; 'system' follows the OS setting. */
  theme: ThemeChoice
  /** Which AI provider drafts and rewrites notes. */
  activeProvider: ProviderId
  /** Saved swatches shown first in every colour picker. */
  penColors: string[]
  /** Colours the user recently chose anywhere, most recent first. */
  recentColors: string[]
  activeTool: PenType
  activeColor: string
  activeWidth: number
}
