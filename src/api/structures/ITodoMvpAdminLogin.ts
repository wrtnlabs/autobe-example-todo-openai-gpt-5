import { tags } from "typia";

export namespace ITodoMvpAdminLogin {
  /**
   * Login request for administrative accounts.
   *
   * This DTO matches the MVP authentication flow for admins, validating
   * credentials against Actors.todo_mvp_admins. It accepts an email and a
   * plaintext password which is verified against password_hash. The DTO
   * purpose aligns with schema guidance: only hashed credentials are stored;
   * plaintext is transient for verification.
   */
  export type ICreate = {
    /**
     * Administrator's unique email used for authentication.
     *
     * References Prisma table Actors.todo_mvp_admins.email (unique per
     * admin). This field identifies exactly one administrator account
     * during login according to the @@unique([email]) constraint in the
     * schema comments.
     */
    email: string & tags.Format<"email">;

    /**
     * Plaintext password submitted for verification during login.
     *
     * Back-end compares this value with the stored credential hash
     * (todo_mvp_admins.password_hash). Per Prisma schema comments,
     * plaintext passwords are never stored; only secure hashes are
     * persisted. This value must never appear in logs or responses.
     */
    password: string;
  };
}
