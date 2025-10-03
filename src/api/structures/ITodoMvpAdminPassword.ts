export namespace ITodoMvpAdminPassword {
  /**
   * Credential rotation request for administrators.
   *
   * This DTO updates Actors.todo_mvp_admins.password_hash after verifying
   * current_password. On success, implementations may revoke or rotate
   * related sessions in Auth.todo_mvp_sessions (setting revoked_at or
   * rotating session_token_hash) per security policy. No sensitive hashes are
   * ever exposed.
   */
  export type IUpdate = {
    /**
     * Administrator’s current plaintext password for verification prior to
     * changing credentials.
     *
     * Verified against Actors.todo_mvp_admins.password_hash using a secure
     * comparison method. Never stored in plaintext and must not be logged.
     */
    current_password: string;

    /**
     * New plaintext password to be hashed and stored into
     * Actors.todo_mvp_admins.password_hash upon successful verification.
     *
     * Back-end computes a strong hash (e.g., Argon2/bcrypt) and persists
     * it. Plaintext must never be returned or logged.
     */
    new_password: string;
  };
}
