import { tags } from "typia";

export namespace ITodoAppSystemAdminLogout {
  /**
   * Admin self-logout request body.
   *
   * Contains only optional context fields. SECURITY: Must NOT include any
   * actor/session IDs; the server derives these from the authenticated
   * context.
   */
  export type ICreate = {
    /**
     * Optional human-readable reason for logout to be recorded in session
     * revocation.
     *
     * Maps to todo_app_session_revocations.reason where applicable.
     */
    reason?: (string & tags.MaxLength<500>) | null | undefined;
  };
}
