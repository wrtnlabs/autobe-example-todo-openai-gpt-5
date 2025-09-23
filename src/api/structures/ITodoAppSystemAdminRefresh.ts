export namespace ITodoAppSystemAdminRefresh {
  /**
   * Refresh request for system administrators.
   *
   * The server validates the provided refresh_token against
   * todo_app_refresh_tokens (by token_hash), rotates the chain, and returns
   * renewed credentials. Optional client context may be recorded in the
   * session for audit and security analytics.
   */
  export type ICreate = {
    /**
     * Opaque refresh token provided by the client. The server validates it
     * by matching a one-way token_hash in todo_app_refresh_tokens and
     * enforces rotation/expiry semantics.
     */
    refresh_token: string;

    /**
     * Optional client IP captured for anomaly detection and recorded on the
     * renewed session if applicable (todo_app_sessions.ip).
     */
    ip?: string | undefined;

    /**
     * Optional client user agent string captured at refresh time
     * (todo_app_sessions.user_agent) for diagnostics.
     */
    user_agent?: string | undefined;
  };
}
