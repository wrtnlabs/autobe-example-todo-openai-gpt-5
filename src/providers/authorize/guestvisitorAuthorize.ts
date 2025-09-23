// File path: src/providers/authorize/guestvisitorAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // MUST be same directory import
import { GuestvisitorPayload } from "../../decorators/payload/GuestvisitorPayload";

/**
 * Authorize a guestvisitor role.
 * - Verifies JWT via shared jwtAuthorize
 * - Ensures discriminator type is "guestvisitor"
 * - Confirms active, non-revoked role assignment tied to top-level user id
 */
export async function guestvisitorAuthorize(request: {
  headers: { authorization?: string };
}): Promise<GuestvisitorPayload> {
  const payload: GuestvisitorPayload = jwtAuthorize({ request }) as GuestvisitorPayload;

  if (payload.type !== "guestvisitor")
    throw new ForbiddenException("You're not guestvisitor");

  // payload.id is the TOP-LEVEL user id (todo_app_users.id)
  const record = await MyGlobal.prisma.todo_app_guestvisitors.findFirst({
    where: {
      todo_app_user_id: payload.id, // role extends user through FK
      revoked_at: null, // currently active assignment
      deleted_at: null, // not soft-deleted
      user: {
        is: {
          deleted_at: null,
          status: "active",
        },
      },
    },
  });

  if (record === null)
    throw new ForbiddenException("You're not enrolled");

  return payload;
}
