// File path: src/decorators/payload/TodouserPayload.ts
import { tags } from "typia";

/**
 * JWT payload for authenticated Todo User (todouser).
 *
 * Note:
 *
 * - `id` is ALWAYS the top-level user table ID (todo_app_users.id)
 * - `type` is the discriminator identifying this role
 */
export interface TodouserPayload {
  /** Top-level user table ID (todo_app_users.id). */
  id: string & tags.Format<"uuid">;

  /** Discriminator for role identification. */
  type: "todouser";
}
