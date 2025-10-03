// File path: src/providers/authorize/guestAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // ← MUST be same directory import
import { GuestPayload } from "../../decorators/payload/GuestPayload";

/**
 * Authenticate and authorize a Guest role using JWT.
 *
 * - Verifies JWT via shared jwtAuthorize()
 * - Ensures payload.type === "guest"
 * - Confirms existence of the guest record and that it is not soft-deleted
 *
 * Note on JWT structure:
 * payload.id ALWAYS contains the top-level actor ID for this role. For
 * Guests, the top-level table is `todo_mvp_guests`, so we validate by
 * matching `id` directly and ensuring `deleted_at` is null.
 */
export async function guestAuthorize(request: {
  headers: {
    authorization?: string;
  };
}): Promise<GuestPayload> {
  const payload: GuestPayload = jwtAuthorize({ request }) as GuestPayload;

  if (payload.type !== "guest") {
    throw new ForbiddenException("You're not guest");
  }

  const guest = await MyGlobal.prisma.todo_mvp_guests.findFirst({
    where: {
      id: payload.id, // Standalone role table → match by primary key
      deleted_at: null, // Validation column check to ensure active/valid
    },
  });

  if (guest === null) {
    throw new ForbiddenException("You're not enrolled");
  }

  return payload;
}
