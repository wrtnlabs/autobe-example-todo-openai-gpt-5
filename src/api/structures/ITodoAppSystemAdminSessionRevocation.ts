import { tags } from "typia";

export namespace ITodoAppSystemAdminSessionRevocation {
  /**
   * Request body to revoke sessions for the authenticated system
   * administrator.
   *
   * Targets Auth.todo_app_sessions by user, creating one record per session
   * in Auth.todo_app_session_revocations (unique per session). Ownership is
   * derived from the authenticated principal; client must not provide user or
   * session IDs.
   */
  export type ICreate = {
    /**
     * When true, revoke the current authenticated session as well as other
     * sessions.
     *
     * Default behavior typically revokes only other active sessions. This
     * flag allows self-termination of the current session too (Prisma
     * Auth.todo_app_sessions).
     */
    revoke_current?: boolean | undefined;

    /**
     * Optional human-readable reason to record with revocation audit
     * trails.
     *
     * Can be stored in Auth.todo_app_session_revocations.reason for each
     * revoked session. Avoid sensitive secrets.
     */
    reason?: (string & tags.MaxLength<1000>) | undefined;
  };
}
