import { tags } from "typia";

export namespace ITodoAppTodoUserPassword {
  /**
   * Request payload for an authenticated todoUser to change their password.
   *
   * This request maps to the Prisma model todo_app_users, where the new
   * credential is stored only as a password_hash. The server validates the
   * provided currentPassword against the existing hash and, if correct,
   * persists the new password by computing a fresh password_hash. Plaintext
   * passwords must never be persisted or logged.
   *
   * Security constraints: The payload must not include any actor identifiers
   * (e.g., userId) or system-managed fields. Implementations are expected to
   * enforce password policy limits (e.g., 8–64 characters) and, when
   * requested via revokeOtherSessions, revoke other sessions in
   * todo_app_sessions and related refresh tokens. This endpoint affects only
   * the caller’s account and should be handled over secure transport.
   */
  export type IChange = {
    /**
     * Current password for verification.
     *
     * Security: plaintext is accepted only in transit for verification and
     * NEVER persisted. Server verifies against todo_app_users.password_hash
     * and immediately discards the plaintext.
     */
    currentPassword: string &
      tags.MinLength<8> &
      tags.MaxLength<64> &
      tags.Format<"password">;

    /**
     * New password to be applied.
     *
     * Security: plaintext is accepted only in transit and will be hashed
     * into todo_app_users.password_hash. Do not log or persist the
     * plaintext.
     */
    newPassword: string &
      tags.MinLength<8> &
      tags.MaxLength<64> &
      tags.Format<"password">;

    /**
     * If true, the server will revoke other active sessions
     * (todo_app_sessions) and their refresh chains after the password
     * change.
     *
     * Maps to operational behavior that writes todo_app_session_revocations
     * and sets revoked_at on the affected sessions. Defaults are
     * policy-dependent.
     */
    revokeOtherSessions?: boolean | undefined;
  };
}
