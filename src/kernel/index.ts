// The kernel's public surface. Importing this once registers the tools and, in the browser,
// exposes the kernel on the window so an agent or a console can drive the notes through the same
// gated API a human's UI uses — humans and agents as co-equal users of one substrate.
import { kernel } from './kernel'

export * from './kernel'
export * from './types'
export { localOwner, PermissionError } from './policy'
export { getTool, listTools } from './tools'
export type { Tool, ToolContext } from './tools'

declare global {
  interface Window {
    notesKernel?: typeof kernel
  }
}

if (typeof window !== 'undefined') {
  window.notesKernel = kernel
}
