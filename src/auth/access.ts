/**
 * Raised when the caller's LogiMind role does not allow a change. The checks themselves live in
 * RoleService (src/services/role-service.ts) and run server-side for every write.
 */
export class ForbiddenError extends Error {
  constructor(message = 'Only the LogiMind owner and managers (or Jira administrators, until an owner is set) can change LogiMind data.') {
    super(message);
  }
}
