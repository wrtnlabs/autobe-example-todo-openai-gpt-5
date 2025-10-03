// File path: src/decorators/payload/UserPayload.ts
import { tags } from "typia";

/**
 * Authenticated User JWT payload shape injected by UserAuth.
 *
 * - `id` is ALWAYS the top-level todo_mvp_users.id (UUID)
 * - `type` discriminates the role and must be "user"
 */
export interface UserPayload {
  /** Top-level user table ID (todo_mvp_users.id). */
  id: string & tags.Format<"uuid">;

  /** Discriminator for the role type. */
  type: "user";

  /** Optional user email claim when embedded in JWT. */
  email?: string & tags.Format<"email">;

  /** Optional status mirror (e.g., "active" | "deactivated"). */
  status?: "active" | "deactivated";

  /** Optional ISO timestamps if provided by the token issuer. */
  created_at?: string & tags.Format<"date-time">;
  updated_at?: string & tags.Format<"date-time">;
}
