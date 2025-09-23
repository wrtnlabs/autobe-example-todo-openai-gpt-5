import { tags } from "typia";

export namespace ITodoAppSystemAdminLogin {
  /**
   * Login payload for authenticating a system administrator.
   *
   * On success, the service issues a session in todo_app_sessions and a
   * refresh token in todo_app_refresh_tokens. This request accepts only
   * business inputs (email/password) and optional client context
   * (ip/user_agent).
   */
  export type ICreate = {
    /**
     * Email address used to authenticate a system administrator.
     *
     * Corresponds to todo_app_users.email (Actors schema).
     */
    email: string & tags.Format<"email">;

    /**
     * Plaintext credential to be verified against
     * todo_app_users.password_hash.
     *
     * Never logged or persisted in plaintext; compliant with policy
     * constraints (min 8, max 64).
     */
    password: string & tags.MinLength<8> & tags.MaxLength<64>;

    /**
     * Optional client IP for security analytics; may be stored with the
     * issued session at todo_app_sessions.ip.
     */
    ip?: string | undefined;

    /**
     * Optional client user agent captured at login; may be stored with the
     * issued session at todo_app_sessions.user_agent.
     */
    user_agent?: string | undefined;
  };
}
