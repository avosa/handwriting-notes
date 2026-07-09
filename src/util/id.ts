// Short unique ids for documents, pages, blocks, strokes, and attachments.
export function uid(prefix = ''): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.abs(Math.floor(performance.now() * 1000)).toString(36) + Math.floor(performance.now()).toString(36)
  return prefix ? `${prefix}_${random}` : random
}
