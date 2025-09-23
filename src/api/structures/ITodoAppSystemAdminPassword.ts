import { tags } from "typia";

export namespace ITodoAppSystemAdminPassword {
  /**
   * Change-password request body for an authenticated system administrator.
   *
   * Maps to authentication data stored in Prisma Actors.todo_app_users
   * (fields: password_hash, updated_at). The server validates
   * current_password against the existing hash and replaces the hash with a
   * hash of new_password upon success. Ownership/actor identity comes from
   * authentication context; request must not accept user/account IDs.
   */
  export type IUpdate = {
    /**
     * Current password of the authenticated administrator, submitted for
     * verification.
     *
     * Security note: compared against todo_app_users.password_hash (Prisma
     * model: Actors.todo_app_users). Policy requires 8–64 characters. Never
     * stored or logged in plaintext.
     */
    current_password: string &
      tags.MinLength<8> &
      tags.MaxLength<64> &
      tags.Format<"password">;

    /**
     * New password to be applied to the administrator account.
     *
     * Security note: becomes the new todo_app_users.password_hash after
     * hashing (Prisma model: Actors.todo_app_users). Must comply with MVP
     * policy (min 8, max 64). Do not echo this value back in any response.
     */
    new_password: string &
      tags.MinLength<8> &
      tags.MaxLength<64> &
      tags.Format<"password">;
  };
}
