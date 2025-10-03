// File path: src/decorators/payload/AdminPayload.ts
import { tags } from "typia";

/**
 * JWT payload for Admin role.
 *
 * - Id: Always the top-level actor ID (todo_mvp_admins.id)
 * - Type: Discriminator indicating admin token
 */
export interface AdminPayload {
  /** Top-level actor ID (todo_mvp_admins.id). */
  id: string & tags.Format<"uuid">;

  /** Discriminator for the role type. */
  type: "admin";
}
