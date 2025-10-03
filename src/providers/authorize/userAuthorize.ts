// File path: src/providers/authorize/userAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // CRITICAL: same directory import
import { UserPayload } from "../../decorators/payload/UserPayload";

/**
 * Authenticate and authorize a regular user.
 *
 * - Verifies JWT using the shared jwtAuthorize function
 * - Ensures the payload.type is "user"
 * - Confirms the user exists, is active, and not soft-deleted
 * - Returns the decoded JWT payload for controller injection
 */
export async function userAuthorize(request: {
  headers: { authorization?: string };
}): Promise<UserPayload> {
  const payload: UserPayload = jwtAuthorize({ request }) as UserPayload;

  if (payload.type !== "user")
    throw new ForbiddenException(`You're not ${payload.type}`);

  // payload.id is the top-level user table ID (todo_mvp_users.id)
  const user = await MyGlobal.prisma.todo_mvp_users.findFirst({
    where: {
      id: payload.id, // Standalone top-level entity → primary key check
      deleted_at: null,
      status: "active",
    },
  });

  if (user === null)
    throw new ForbiddenException("You're not enrolled");

  return payload;
}
