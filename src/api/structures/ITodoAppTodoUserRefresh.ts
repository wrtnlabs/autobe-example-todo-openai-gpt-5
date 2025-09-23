export namespace ITodoAppTodoUserRefresh {
  /**
   * Refresh token rotation request for a member (todoUser).
   *
   * The server validates the token against todo_app_refresh_tokens
   * (issued_at, expires_at, rotated_at, revoked_at) and its session in
   * todo_app_sessions before issuing new credentials. This request
   * intentionally excludes actor IDs and other system-managed fields.
   */
  export type IRequest = {
    /**
     * Opaque refresh token presented by the client. On the server side,
     * this is looked up via a one-way hash against
     * todo_app_refresh_tokens.token_hash (Prisma).
     *
     * Security: never store this plaintext value; persist and compare only
     * the hash.
     */
    refresh_token: string;
  };
}
