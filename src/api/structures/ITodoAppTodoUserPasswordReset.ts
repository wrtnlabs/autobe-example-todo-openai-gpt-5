import { tags } from "typia";

export namespace ITodoAppTodoUserPasswordReset {
  /**
   * Password reset initiation request for a member user (todoUser). This
   * request is privacy-preserving and MUST NOT include actor IDs. The server
   * records the request in todo_app_password_resets (email, token_hash,
   * requested_at, expires_at) without revealing whether the email maps to an
   * existing account.
   *
   * Source reference: Prisma model todo_app_password_resets — supports
   * privacy-preserving requests by email only, with optional user linkage via
   * todo_app_user_id.
   */
  export type IRequest = {
    /**
     * Email address to receive reset instructions. Business validation
     * applies to format only; existence is not disclosed.
     */
    email: string & tags.Format<"email">;
  };

  /**
   * Password reset confirmation payload for a member user (todoUser). Clients
   * submit the opaque reset token and a new password. The server validates
   * against todo_app_password_resets (by token_hash, expiry, single-use) and
   * updates todo_app_users.password_hash upon success. Never accept or expose
   * actor IDs in this request.
   *
   * Security notes: Do not store plaintext tokens; store only token_hash.
   * Enforce password policy (e.g., 8–64 characters) at validation time.
   */
  export type IConfirm = {
    /**
     * Opaque reset token delivered out-of-band (email). The server verifies
     * it by comparing its hash to todo_app_password_resets.token_hash,
     * enforcing expiry and single-use semantics.
     */
    token: string;

    /**
     * New password string to set for the account. Policy per NFR: minimum 8
     * and maximum 64 characters; additional composition rules may apply at
     * service level.
     */
    new_password: string & tags.MinLength<8> & tags.MaxLength<64>;
  };
}
