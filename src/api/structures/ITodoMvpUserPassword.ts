import { tags } from "typia";

export namespace ITodoMvpUserPassword {
  /**
   * Password change request for authenticated members targeting
   * Actors.todo_mvp_users.password_hash.
   *
   * Security notes: The API never exposes password_hash. Providers should
   * consider rotating or revoking existing sessions in Auth.todo_mvp_sessions
   * upon success and must update user.updated_at to reflect credential
   * change.
   */
  export type IUpdate = {
    /**
     * Current plaintext credential used to verify identity before rotation.
     *
     * Verified against Actors.todo_mvp_users.password_hash using
     * constant-time comparison. Not persisted.
     */
    current_password: string & tags.MinLength<8>;

    /**
     * New plaintext credential to be hashed and stored.
     *
     * Replaces Actors.todo_mvp_users.password_hash after hashing with a
     * strong algorithm (e.g., Argon2/bcrypt). Providers may revoke or
     * rotate sessions in Auth.todo_mvp_sessions by policy after a
     * successful change.
     */
    new_password: string & tags.MinLength<8>;
  };
}
