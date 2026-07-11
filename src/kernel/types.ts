// The kernel's vocabulary. Every operation on the notes is expressed as an actor performing an
// action (a capability) on a resource. Today there is a single local owner and everything is
// allowed, but modelling it this way means that when notes are shared — with people or with
// agents, across individuals, educators, and organisations — access is gated by changing the
// policy, not by rewriting the callers.

/** Who is acting: a person or an autonomous agent. Both are first-class users of the kernel. */
export type ActorKind = 'human' | 'agent'

/** What an actor is allowed to do, in ascending power. A viewer can only read and retrieve; an
 *  owner can do everything. Sharing assigns one of these per space or note. */
export type Role = 'owner' | 'editor' | 'commenter' | 'viewer'

export interface Actor {
  kind: ActorKind
  id: string
  role: Role
}

/** The kinds of thing an action touches. */
export type Capability = 'read' | 'write' | 'delete' | 'retrieve' | 'generate' | 'admin'

export type ResourceKind = 'corpus' | 'note' | 'block'

/** What an action is being performed on, so a policy can allow or deny per resource later. */
export interface Resource {
  kind: ResourceKind
  noteId?: string
  blockId?: string
}
