// The access policy: whether an actor may perform a capability on a resource. Today it is decided
// purely by role, and the single local user is the owner of everything, so every action is allowed.
// The resource is already part of the decision, so per-note and per-space rules (shared read-only
// documents, an educator's worksheet, an organisation's policy doc) slot in here when sharing lands
// — without any caller changing.
import type { Actor, Capability, Resource, Role } from './types'

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  owner: ['read', 'write', 'delete', 'retrieve', 'generate', 'admin'],
  editor: ['read', 'write', 'retrieve', 'generate'],
  commenter: ['read', 'retrieve', 'generate'],
  viewer: ['read', 'retrieve'],
}

export function can(actor: Actor, capability: Capability, _resource: Resource): boolean {
  return ROLE_CAPABILITIES[actor.role]?.includes(capability) ?? false
}

// The current user of a purely local library: its sole owner. When accounts and sharing arrive, an
// actor is resolved from the session instead, and agents arrive with their own actor and role.
export const localOwner: Actor = { kind: 'human', id: 'local', role: 'owner' }

export class PermissionError extends Error {
  constructor(actor: Actor, capability: Capability, resource: Resource) {
    super(`A ${actor.role} may not ${capability} a ${resource.kind}`)
    this.name = 'PermissionError'
  }
}
