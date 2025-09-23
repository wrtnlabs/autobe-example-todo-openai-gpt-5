import { tags } from "typia";

export namespace ITodoAppSystemAdminPasswordResetConfirm {
  /**
   * Confirmation payload to complete an administrator password reset.
   *
   * Business flow: Validates token against
   * todo_app_password_resets.token_hash and expiry (expires_at), marks
   * consumed_at, and updates todo_app_users.password_hash. May revoke
   * sessions in todo_app_sessions and refresh tokens in
   * todo_app_refresh_tokens according to policy.
   *
   * Security: Never return sensitive data; never accept user identifiers in
   * the body.
   */
  export type ICreate = {
    /**
     * One-time opaque reset token delivered via an out-of-band channel.
     *
     * Server validates this by computing/looking up
     * todo_app_password_resets.token_hash and enforcing expiry via
     * expires_at. The raw token is never stored in the database and MUST
     * NOT be logged.
     */
    token: string;

    /**
     * New password for the administrator account.
     *
     * On success, the server updates todo_app_users.password_hash and may
     * revoke active sessions/refresh chains per policy. Policy guidance in
     * requirements specifies a minimum length of 8 and maximum of 64
     * characters.
     */
    new_password: string & tags.MinLength<8> & tags.MaxLength<64>;
  };
}
