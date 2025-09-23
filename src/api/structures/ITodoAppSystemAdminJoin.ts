import { tags } from "typia";

export namespace ITodoAppSystemAdminJoin {
  /**
   * System administrator registration payload.
   *
   * This request creates a new administrative identity in todo_app_users and
   * typically inserts a role grant in todo_app_systemadmins. Only business
   * inputs are accepted: email and password. Client context (ip, user_agent)
   * may be captured and associated to the initial session in
   * todo_app_sessions.
   *
   * Security: Do not accept or echo sensitive system fields like id,
   * created_at, updated_at, or actor identifiers. Password is hashed
   * server-side and never persisted in plaintext.
   */
  export type ICreate = {
    /**
     * Login identifier and notification address for the system
     * administrator.
     *
     * Maps to todo_app_users.email (Actors schema). Must be unique across
     * all users. Value is validated as an email address and is persisted on
     * the user record upon successful registration.
     */
    email: string & tags.Format<"email">;

    /**
     * Plaintext password submitted by the client and never stored directly.
     * The service derives todo_app_users.password_hash from this value and
     * persists only the hash.
     *
     * Business policy: minimum 8 and maximum 64 characters; stronger
     * composition rules may be enforced server-side. This field is only
     * accepted on join/login flows and is not returned in responses.
     */
    password: string & tags.MinLength<8> & tags.MaxLength<64>;

    /**
     * Optional client IP address captured for security analytics and audit.
     *
     * Not persisted directly on the user record; providers may store it on
     * the new session (todo_app_sessions.ip) created during registration.
     */
    ip?: string | undefined;

    /**
     * Optional client user agent string captured at registration time for
     * diagnostics and device recognition.
     *
     * Not stored on the user record; providers may persist it on the
     * session (todo_app_sessions.user_agent) created for the
     * administrator.
     */
    user_agent?: string | undefined;
  };
}
