import { tags } from "typia";

export namespace ITodoAppSystemAdminEmailVerificationResend {
  /**
   * Resend verification request payload (System Admin flow).
   *
   * Creates a new verification entry in todo_app_email_verifications
   * (target_email, token_hash, sent_at, expires_at). The server must not
   * disclose user existence in its response. No actor IDs are accepted in
   * this request.
   */
  export type ICreate = {
    /**
     * Target email address to receive a new verification message.
     *
     * The server will create a new row in todo_app_email_verifications
     * setting target_email, token_hash, sent_at, and expires_at per policy.
     * Responses MUST be privacy-preserving and SHOULD NOT reveal whether
     * the email exists.
     */
    email: string & tags.Format<"email">;
  };
}
