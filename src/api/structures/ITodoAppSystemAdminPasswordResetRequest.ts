import { tags } from "typia";

export namespace ITodoAppSystemAdminPasswordResetRequest {
  /**
   * Create payload to initiate an administrator password reset request.
   *
   * Business context: Inserts a row in todo_app_password_resets with fields
   * such as email, token_hash (derived from an opaque token), requested_at,
   * and expires_at. No user identifiers are accepted from clients; identity
   * linkage is resolved by the server using
   * todo_app_password_resets.todo_app_user_id when applicable.
   *
   * Security: Never expose raw tokens or any credential in responses. Avoid
   * user enumeration by returning generic acknowledgments regardless of
   * account existence.
   */
  export type ICreate = {
    /**
     * Administrator's email address to receive password reset instructions.
     *
     * This is the login identifier stored in todo_app_users.email. The
     * confirmation workflow is modeled by todo_app_password_resets with
     * columns email and optional todo_app_user_id for privacy-preserving
     * initiation. The server MUST NOT disclose whether the submitted email
     * maps to an existing account.
     *
     * Validation: syntactically valid email string; business policies may
     * enforce additional constraints (e.g., corporate domains) without
     * changing the schema.
     */
    email: string & tags.Format<"email">;
  };
}
