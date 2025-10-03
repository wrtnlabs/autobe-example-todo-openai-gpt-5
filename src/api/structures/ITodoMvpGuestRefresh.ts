export namespace ITodoMvpGuestRefresh {
  /**
   * Refresh request payload for guest sessions.
   *
   * Contains only the refresh_token required to locate and rotate the
   * underlying Auth.todo_mvp_sessions entry per the Prisma schema
   * commentary.
   */
  export type IRequest = {
    /**
     * Refresh token previously issued to the guest.
     *
     * The server hashes this value and matches it against
     * Auth.todo_mvp_sessions.session_token_hash before rotating credentials
     * and extending expires_at.
     */
    refresh_token: string;
  };
}
