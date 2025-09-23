export namespace ITodoAppTodoUserEmailVerification {
  /**
   * Email verification token consumption payload.
   *
   * Consumes a record from todo_app_email_verifications (sent_at, expires_at,
   * consumed_at, failure_count) and updates verification flags in
   * todo_app_users without exposing raw tokens.
   */
  export type IConsume = {
    /**
     * Opaque email verification token presented by the client. The service
     * validates it by hashing and comparing to
     * todo_app_email_verifications.token_hash within the expiry window.
     *
     * On success, todo_app_users.email_verified is set to true and
     * verified_at is stamped according to policy.
     */
    token: string;
  };
}
