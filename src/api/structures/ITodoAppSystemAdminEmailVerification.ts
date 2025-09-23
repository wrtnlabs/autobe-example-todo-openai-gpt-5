export namespace ITodoAppSystemAdminEmailVerification {
  /**
   * Email verification token consumption payload (System Admin flow).
   *
   * This request corresponds to consuming a record in the Prisma model
   * todo_app_email_verifications. The server validates the provided token
   * against token_hash, ensures it has not expired (expires_at) and has not
   * already been consumed (consumed_at is null). Upon success, it updates
   * todo_app_users by setting email_verified=true and verified_at to the
   * current time.
   *
   * Security: Do not accept actor IDs (user_id) in this request. Do not echo
   * or persist raw token values. Client metadata (IP, user agent) may be
   * captured by the server for auditing per schema fields like
   * consumed_by_ip, but are not part of this request body.
   */
  export type ICreate = {
    /**
     * Opaque email verification token provided by the client for
     * consumption.
     *
     * Validation and persistence are performed against
     * todo_app_email_verifications.token_hash (one-way hash) with expiry
     * enforced by todo_app_email_verifications.expires_at. The raw token
     * MUST NOT be stored server-side per schema guidance.
     */
    token: string;
  };
}
