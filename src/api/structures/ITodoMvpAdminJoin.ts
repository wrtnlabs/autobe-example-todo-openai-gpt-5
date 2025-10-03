import { tags } from "typia";

export namespace ITodoMvpAdminJoin {
  /**
   * Create DTO for administrator registration (POST /auth/admin/join).
   *
   * This request body maps to creating a record in Prisma table
   * Actors.todo_mvp_admins by supplying minimal credentials. Do not include
   * system-managed fields like id, created_at, updated_at, or deleted_at, and
   * do not allow status override in MVP.
   */
  export type ICreate = {
    /**
     * Administrator email address.
     *
     * Mapped to Actors.todo_mvp_admins.email with @@unique constraint. Must
     * be unique within admin accounts.
     */
    email: string & tags.Format<"email">;

    /**
     * Plain text password submitted by the client for registration.
     *
     * The server MUST hash this value (e.g., Argon2/bcrypt) and persist the
     * derived hash into Actors.todo_mvp_admins.password_hash. Plaintext is
     * never stored. Minimum length guidance is applied at DTO level for
     * basic validation.
     */
    password: string & tags.MinLength<8>;
  };
}
