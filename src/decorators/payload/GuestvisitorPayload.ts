// File path: src/decorators/payload/GuestvisitorPayload.ts
import { tags } from "typia";

/**
 * Guestvisitor JWT payload id is ALWAYS the top-level user table ID
 * (todo_app_users.id)
 */
export interface GuestvisitorPayload {
  /** Top-level user table ID (the fundamental user identifier). */
  id: string & tags.Format<"uuid">;
  /** Discriminator for the discriminated union type. */
  type: "guestvisitor";
}
