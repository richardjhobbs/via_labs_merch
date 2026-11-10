// Who may change whom on the Team section of Settings. Owners and managers manage the team; a manager never
// makes an owner or changes one; nobody changes their own role; the last owner stays.
export const TEAM_ROLES = ['owner', 'manager', 'merchandiser', 'qc', 'compliance', 'logistics', 'viewer'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const isTeamRole = (r: string): r is TeamRole => (TEAM_ROLES as readonly string[]).includes(r);
export const managesTeam = (role: string) => role === 'owner' || role === 'manager';

// roles this person may hand out on an invite or a change
export function assignable(actor: string): TeamRole[] {
  if (actor === 'owner') return [...TEAM_ROLES];
  if (actor === 'manager') return TEAM_ROLES.filter((r) => r !== 'owner');
  return [];
}

export function canEdit(actor: string, target: string, self: boolean): boolean {
  if (!managesTeam(actor) || target === 'partner') return false;
  if (self) return true; // title, customers and tracks only; the role is checked by canSetRole
  return !(actor === 'manager' && target === 'owner');
}

export function canSetRole(actor: string, current: string, next: string, self: boolean, owners: number): boolean {
  if (current === next) return canEdit(actor, current, self);
  if (self || !canEdit(actor, current, false) || !assignable(actor).includes(next as TeamRole)) return false;
  return !(current === 'owner' && owners <= 1);
}

export function canRemove(actor: string, target: string, self: boolean, owners: number): boolean {
  if (self || !canEdit(actor, target, false)) return false;
  return !(target === 'owner' && owners <= 1);
}
