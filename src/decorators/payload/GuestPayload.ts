// File path: src/decorators/payload/GuestPayload.ts
import { tags } from "typia";

/**
 * Guest JWT payload injected by GuestAuth decorator.
 *
 * Note: `id` refers to the top-level actor identifier for this role. For
 * Guests, this is `todo_mvp_guests.id`.
 */
export interface GuestPayload {
  /** Top-level guest identity ID (UUID), i.e., todo_mvp_guests.id */
  id: string & tags.Format<"uuid">;

  /** Discriminator for role identification. */
  type: "guest";
}
