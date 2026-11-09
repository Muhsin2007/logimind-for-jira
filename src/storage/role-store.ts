import type { RoleState } from '../domain/roles';

/** Port for the stored LogiMind roles. */
export interface RoleStore {
  read(): Promise<RoleState>;
  /**
   * Applies `change` to the current state under an exclusive lock and saves the result.
   * The change must check the actor's rights itself; throwing saves nothing.
   * Throws RoleError('BUSY') while another change is in progress.
   */
  update(change: (state: RoleState) => RoleState): Promise<RoleState>;
}
