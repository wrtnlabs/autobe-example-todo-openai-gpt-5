import { tags } from "typia";

export namespace ITodoAppTodoUserLogin {
  /**
   * Login payload for authenticating a member (todoUser).
   *
   * Maps to authentication checks on the Actors/Auth schema: email is
   * verified against todo_app_users.email; password is verified against
   * todo_app_users.password_hash. This request never accepts actor IDs and
   * carries no system-managed fields.
   */
  export type IRequest = {
    /**
     * Login identifier corresponding to todo_app_users.email (Prisma).
     *
     * Must be a syntactically valid email address. The value is used only
     * for authentication lookups and is not modified by this request.
     */
    email: string & tags.Format<"email">;

    /**
     * Plain text credential supplied by the user to be verified against
     * todo_app_users.password_hash (Prisma).
     *
     * Security: never persisted; only a transient input to verify the
     * existing hash. Business policy recommends 8–64 characters.
     */
    password: string & tags.MinLength<8> & tags.MaxLength<64>;

    /**
     * Convenience hint allowing the server to choose a longer refresh token
     * validity (policy dependent).
     *
     * Not persisted directly in the database; affects token issuance
     * behavior only.
     */
    keep_me_signed_in?: boolean | undefined;
  };
}
