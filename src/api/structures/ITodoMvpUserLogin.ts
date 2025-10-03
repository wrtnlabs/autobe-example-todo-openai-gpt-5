import { tags } from "typia";

export namespace ITodoMvpUserLogin {
  /**
   * Login request payload for member authentication against
   * Actors.todo_mvp_users.
   *
   * Includes the minimal fields required by the MVP: email (unique
   * identifier) and a plaintext password for verification. On success,
   * providers create a session in Auth.todo_mvp_sessions and return
   * ITodoMvpUser.IAuthorized.
   */
  export type IRequest = {
    /**
     * User’s unique email for authentication.
     *
     * Maps conceptually to Actors.todo_mvp_users.email, which is
     * business-unique (Prisma @@unique([email])).
     */
    email: string & tags.Format<"email">;

    /**
     * Plain-text password submitted for verification.
     *
     * Compared against Actors.todo_mvp_users.password_hash using a secure
     * one-way function during login. The plaintext value is never
     * persisted.
     */
    password: string & tags.MinLength<8>;
  };
}
