// File path: src/providers/authorize/adminAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // CORRECT: same directory
import { AdminPayload } from "../../decorators/payload/AdminPayload";

/**
 * Authorize an Admin using JWT and database validation.
 * - Verifies JWT via shared jwtAuthorize
 * - Ensures the payload is for the "admin" role
 * - Confirms the admin exists and is active and not soft-deleted
 * - Returns the original payload on success
 */
export async function adminAuthorize(request: {
  headers: { authorization?: string };
}): Promise<AdminPayload> {
  const payload: AdminPayload = jwtAuthorize({ request }) as AdminPayload;

  if (payload.type !== "admin")
    throw new ForbiddenException(`You're not ${payload.type}`);

  // todo_mvp_admins is a standalone authorization model (top-level actor)
  // Therefore, payload.id === todo_mvp_admins.id
  const admin = await MyGlobal.prisma.todo_mvp_admins.findFirst({
    where: {
      id: payload.id,
      deleted_at: null,
      status: "active",
    },
  });

  if (admin === null) throw new ForbiddenException("You're not enrolled");

  return payload;
}
