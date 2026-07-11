// The notes kernel: the single, stable way to act on the notes, for a human's UI and an agent
// alike. Every call names a tool and passes an actor; the kernel checks the policy for that actor,
// capability, and resource, then runs the tool. Reads, retrieval, mutation, and generation all flow
// through the same gate, so access is enforced in one place and a new skin or agent needs nothing
// but this surface.
import { useDocument } from '@/store/document'
import { useLibrary } from '@/store/library'
import { can, localOwner, PermissionError } from './policy'
import { getTool, listTools, type Tool } from './tools'
import type { Actor, Capability } from './types'
// Registers the core tools as a side effect of loading the kernel.
import './coreTools'

// Run a tool by name for an actor, after checking it is allowed. This is the one entry point; the
// named helpers below are thin, intent-revealing wrappers around it.
export async function perform<Output = unknown>(
  toolName: string,
  input: unknown = {},
  actor: Actor = localOwner,
): Promise<Output> {
  const tool = getTool(toolName)
  if (!tool) throw new Error(`Unknown tool: ${toolName}`)
  const resource = tool.resource(input)
  if (!can(actor, tool.capability, resource)) throw new PermissionError(actor, tool.capability, resource)
  return (await tool.run(input, { actor })) as Output
}

// Run a tool but first refuse it if its capability is not one this entry point is meant for, so a
// read helper cannot be used to write. Async, so a refusal is a rejected promise like any other.
async function withCapability(allowed: Capability[], toolName: string, input: unknown, actor: Actor): Promise<unknown> {
  const tool = getTool(toolName)
  if (tool && !allowed.includes(tool.capability)) {
    throw new Error(`${toolName} is a ${tool.capability} tool, not usable here`)
  }
  return perform(toolName, input, actor)
}

// Read or search the corpus.
export function query<O = unknown>(toolName: string, input: unknown = {}, actor: Actor = localOwner): Promise<O> {
  return withCapability(['read', 'retrieve'], toolName, input, actor) as Promise<O>
}
// Change the corpus.
export function mutate<O = unknown>(toolName: string, input: unknown = {}, actor: Actor = localOwner): Promise<O> {
  return withCapability(['write', 'delete'], toolName, input, actor) as Promise<O>
}
// Retrieve the most relevant material by meaning.
export function retrieve<O = unknown>(toolName: string, input: unknown = {}, actor: Actor = localOwner): Promise<O> {
  return withCapability(['retrieve'], toolName, input, actor) as Promise<O>
}
// Generate text.
export function generate<O = unknown>(toolName: string, input: unknown = {}, actor: Actor = localOwner): Promise<O> {
  return withCapability(['generate'], toolName, input, actor) as Promise<O>
}

// Watch the corpus for any change, so a skin or agent can react to edits it did not make. Returns
// an unsubscribe function.
export function subscribe(onChange: () => void): () => void {
  const offDoc = useDocument().$subscribe(() => onChange())
  const offLib = useLibrary().$subscribe(() => onChange())
  return () => {
    offDoc()
    offLib()
  }
}

// The tools an actor can discover and call, described plainly so an agent can use them.
export function tools(): {
  name: string
  description: string
  capability: Capability
  input: Record<string, string>
}[] {
  return listTools().map((t: Tool) => ({
    name: t.name,
    description: t.description,
    capability: t.capability,
    input: t.input,
  }))
}

export const kernel = { perform, query, mutate, retrieve, generate, subscribe, tools, defaultActor: localOwner }
export type Kernel = typeof kernel
