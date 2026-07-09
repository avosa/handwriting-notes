// Reads a server sent event stream and yields the payload of each `data:` line. Both the
// chat vendors stream their replies this way; only the JSON inside each event differs, so
// the reading is shared and the parsing lives with each provider.
export async function* sseData(response: Response): AsyncGenerator<string> {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let split
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      const line = event.split('\n').find((l) => l.startsWith('data:'))
      if (line) yield line.slice(5).trim()
    }
  }
}
