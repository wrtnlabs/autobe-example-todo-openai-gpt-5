export namespace ITodoMvpUserRefresh {
  /**
   * Refresh request to rotate and renew an existing authenticated session
   * stored in Prisma Auth.todo_mvp_sessions.
   *
   * Minimal input: a refresh_token string, which is never stored in plaintext
   * at rest. Validation checks include revoked_at and expires_at semantics
   * per Prisma schema commentary.
   */
  export type IRequest = {
    /**
     * Refresh token presented by the client for session renewal.
     *
     * The implementation hashes this value and compares it with
     * Auth.todo_mvp_sessions.session_token_hash. On success, the session
     * rotates/extends per lifecycle rules (updated_at, last_accessed_at,
     * expires_at).
     */
    refresh_token: string;
  };
}
