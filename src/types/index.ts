// Domain types shared across the editor, stores, AI layer, and exporters.

export type PenType = 'pencil' | 'fine' | 'marker' | 'highlighter' | 'eraser'

export type InkColor = string

/** A single freehand stroke captured from the ink canvas of one page. */
export interface Stroke {
  id: string
  tool: PenType
  color: InkColor
  width: number
  points: StrokePoint[]
}

export interface StrokePoint {
  x: number
  y: number
  pressure: number
}

/**
 * A run of handwriting placed on the rule grid. `role` picks the font and colour
 * from the active handwriting: a title uses the header font in title blue, a
 * heading uses the header font in section red, body uses the body font in ink.
 */
export type TextRole = 'title' | 'heading' | 'body'

export type TextAlign = 'left' | 'justify'

export interface TextBlock {
  id: string
  role: TextRole
  content: string
  /** Colour override; when absent the colour comes from the role. */
  color?: string
  bold?: boolean
  align?: TextAlign
  /** Extra left inset in millimetres, for indented callouts. */
  indent?: number
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

/** A block flows down a page: either handwriting or a diagram. */
export type Block =
  | { id: string; type: 'text'; text: TextBlock }
  | { id: string; type: 'diagram'; spec: DiagramSpec; heightRules: number }

export interface Page {
  id: string
  index: number
  presetId: string
  blocks: Block[]
  strokes: Stroke[]
}

export interface NoteDocument {
  id: string
  title: string
  pages: Page[]
  createdAt: number
  updatedAt: number
}

export type AttachmentKind = 'image' | 'video' | 'document'

export interface Attachment {
  id: string
  kind: AttachmentKind
  name: string
  mime: string
  size: number
  /** Key of the blob held in IndexedDB. */
  blobRef: string
  /** Optional pasted transcript, used for video since raw video is not model readable. */
  transcript?: string
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

export interface Settings {
  activeHandwritingId: string
  penColors: string[]
  activeTool: PenType
  activeColor: string
  activeWidth: number
}
