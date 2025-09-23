// File path: src/providers/authorize/todouserAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // ← CRITICAL: Same directory import
import { TodouserPayload } from "../../decorators/payload/TodouserPayload";

/**
 * Authenticate and authorize a todouser by verifying JWT and DB membership.
 *
 * - Verifies JWT via shared jwtAuthorize
 * - Ensures payload.type === "todouser"
 * - Confirms active role assignment in todo_app_todousers
 * - Validates the owning user account is active and not deleted
 *
 * Returns the JWT payload upon success.
 */
export async function todouserAuthorize(request: {
  headers: {
    authorization?: string;
  };
}): Promise<TodouserPayload> {
  // Verify token and parse payload
  const payload: TodouserPayload = jwtAuthorize({ request }) as TodouserPayload;

  // Role discriminator check
  if (payload.type !== "todouser") {
    throw new ForbiddenException("You're not todouser");
  }

  // Validate role membership using top-level user ID in payload
  const membership = await MyGlobal.prisma.todo_app_todousers.findFirst({
    where: {
      // Foreign key to top-level users table
      todo_app_user_id: payload.id,
      // Active (not revoked), and not soft-deleted
      revoked_at: null,
      deleted_at: null,
      // Ensure the owning user account is valid/active
      user: {
        is: {
          deleted_at: null,
          status: "active",
          email_verified: true,
        },
      },
    },
  });

  if (membership === null) {
    throw new ForbiddenException("You're not enrolled");
  }

  return payload;
}
