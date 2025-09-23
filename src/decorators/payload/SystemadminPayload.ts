import { tags } from "typia";

/**
 * JWT payload shape for System Admin authentication.
 *
 * - Id is ALWAYS the top-level user table ID (todo_app_users.id)
 * - Type is the discriminator identifying the role
 */
export interface SystemadminPayload {
  /** Top-level user table ID (todo_app_users.id). */
  id: string & tags.Format<"uuid">;
  /** Discriminator for the role union. */
  type: "systemadmin";
}
