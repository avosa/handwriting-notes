// Pulls finished note blocks out of a JSON reply while it is still streaming in. The
// model writes { "title": ..., "pages": [[ block, block, ... ]] }; this watches the
// growing text, waits until the pages array has started, then hands back each block
// object the moment its braces balance, so the page can fill in one line at a time.
import type { Block } from '@/types'
import { adoptBlock } from './noteSchema'

export class BlockStreamer {
  private buffer = ''
  private cursor = 0
  private inPages = false
  title: string | undefined

  push(chunk: string): Block[] {
    this.buffer += chunk
    const out: Block[] = []

    if (!this.inPages) {
      const pagesAt = this.buffer.indexOf('"pages"')
      if (pagesAt === -1) return out
      const bracket = this.buffer.indexOf('[', pagesAt)
      if (bracket === -1) return out
      this.captureTitle()
      this.cursor = bracket + 1
      this.inPages = true
    }

    for (;;) {
      const start = this.nextObjectStart(this.cursor)
      if (start === -1) break
      const end = this.matchBrace(start)
      if (end === -1) break // the object is still arriving
      const raw = this.buffer.slice(start, end + 1)
      try {
        const block = adoptBlock(JSON.parse(raw))
        if (block) out.push(block)
      } catch {
        // A malformed object is skipped rather than stalling the stream.
      }
      this.cursor = end + 1
    }
    return out
  }

  private captureTitle() {
    const m = this.buffer.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (m) this.title = m[1].replace(/\\"/g, '"')
  }

  // The next '{' at or after `from`, skipping the array and comma punctuation between
  // pages and blocks.
  private nextObjectStart(from: number): number {
    for (let i = from; i < this.buffer.length; i++) {
      if (this.buffer[i] === '{') return i
    }
    return -1
  }

  // Index of the '}' that closes the object opened at `start`, or -1 if it has not
  // arrived yet. Strings and escapes are respected so braces inside text do not count.
  private matchBrace(start: number): number {
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < this.buffer.length; i++) {
      const c = this.buffer[i]
      if (inString) {
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') inString = false
      } else if (c === '"') {
        inString = true
      } else if (c === '{') {
        depth++
      } else if (c === '}') {
        depth--
        if (depth === 0) return i
      }
    }
    return -1
  }
}
