// The tool registry: the set of actions the kernel can perform on the notes. A tool is the unit
// that both a human's UI and an autonomous agent invoke — the same tool, gated by the same policy.
// Each tool declares the capability it needs and the resource it touches, so the kernel can check
// access before running it, and describes its input so an agent can discover how to call it.
import type { Actor, Capability, Resource } from './types'

export interface ToolContext {
  actor: Actor
}

export interface Tool<Input = unknown, Output = unknown> {
  /** Stable, dotted name, e.g. "note.rename". */
  name: string
  /** One line an agent can read to know what it does. */
  description: string
  /** The capability the caller must hold to run it. */
  capability: Capability
  /** The resource this call touches, derived from its input, for a per-resource policy check. */
  resource: (input: Input) => Resource
  /** A plain description of each input field, so an agent can call it without reading the code. */
  input: Record<string, string>
  run: (input: Input, ctx: ToolContext) => Promise<Output> | Output
}

const registry = new Map<string, Tool>()

export function registerTool<Input, Output>(tool: Tool<Input, Output>): void {
  registry.set(tool.name, tool as unknown as Tool)
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name)
}

export function listTools(): Tool[] {
  return [...registry.values()]
}
