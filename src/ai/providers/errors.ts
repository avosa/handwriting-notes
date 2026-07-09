// Turns a vendor's HTTP failure into one calm sentence a writer can act on. The vendors
// answer with different envelopes and a wall of JSON; this reads the useful line out of
// them and maps the common cases (a refused key, spent quota, an outage) to plain words.
function messageFrom(body: string): string {
  try {
    const data: unknown = JSON.parse(body)
    const holder = Array.isArray(data) ? data[0] : data
    const record = holder as { error?: { message?: unknown }; message?: unknown } | null
    const raw = record?.error?.message ?? record?.message
    if (typeof raw === 'string') {
      return raw
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.\s]+$/, '')
    }
  } catch {
    // Not JSON; nothing useful to lift out.
  }
  return ''
}

export function describeHttpError(name: string, status: number, body: string): string {
  const detail = messageFrom(body)
  if (status === 401 || status === 403) {
    return `${name} did not accept your key. Open the key button to check or replace it.`
  }
  if (status === 429) {
    return `${name} is out of quota or busy right now. Check your ${name} plan and billing, or switch to another AI from the key button.`
  }
  if (status === 402) {
    return `${name} needs billing set up on your account before it can run.`
  }
  if (status >= 500) {
    return `${name} is having trouble right now. Give it a moment and try again.`
  }
  if (status === 400 && detail) {
    return `${name} could not handle that request: ${detail}.`
  }
  return detail ? `${name}: ${detail}.` : `${name} returned an error (${status}).`
}
