export namespace ITodoMvpAdminRefresh {
  /**
   * Admin token refresh request.
   *
   * The presented refresh_token is hashed server-side and compared to
   * Auth.todo_mvp_sessions.session_token_hash. On success, providers rotate
   * tokens, update last_accessed_at/updated_at, and may extend expires_at
   * according to policy. This DTO contains no identity fields to avoid
   * bypassing authentication context.
   */
  export type ICreate = {
    /**
     * Client-presented refresh token used to renew administrator
     * authorization.
     *
     * Implementation hashes this value and matches it against
     * Auth.todo_mvp_sessions.session_token_hash. The surrounding lifecycle
     * fields (expires_at, revoked_at, last_accessed_at) govern whether the
     * session can be refreshed as described in the Prisma schema comments.
     */
    refresh_token: string;
  };
}
