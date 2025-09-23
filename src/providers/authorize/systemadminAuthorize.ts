import { ForbiddenException } from "@nestjs/common";
import { jwtAuthorize } from "./jwtAuthorize"; // MUST be same directory import
import type { SystemadminPayload } from "../../decorators/payload/SystemadminPayload";

/**
 * Authenticate and authorize a System Admin.
 *
 * - Verifies JWT using shared jwtAuthorize()
 * - Ensures the payload.type is "systemadmin"
 * - Confirms active, non-revoked system admin membership in DB
 * - Validates the owning user account is active, verified, and not deleted
 *
 * Note: payload.id MUST be the top-level user ID (todo_app_users.id).
 */
export async function systemadminAuthorize(request: {
  headers: { authorization?: string };
}): Promise<SystemadminPayload> {
  // Verify and parse JWT
  const payload = jwtAuthorize({ request }) as SystemadminPayload;

  // Role guard
  if (payload.type !== "systemadmin")
    throw new ForbiddenException(`You're not ${payload.type}`);

  // Access Prisma client from global to avoid importing MyGlobal while it has a compile error
  const prisma = (globalThis as any).MyGlobal?.prisma ?? (global as any)?.MyGlobal?.prisma;
  if (!prisma) throw new ForbiddenException("Service is not ready");

  // Validate role membership using top-level user id
  const membership = await prisma.todo_app_systemadmins.findFirst({
    where: {
      // Role table extends users via FK, so we filter by foreign key
      todo_app_user_id: payload.id,
      // Ensure the assignment is currently active and not soft-deleted
      revoked_at: null,
      deleted_at: null,
      // Validate the owning user account state as well
      user: {
        deleted_at: null,
        status: "active",
        email_verified: true,
      },
    },
  });

  if (membership === null)
    throw new ForbiddenException("You're not enrolled");

  // Return the JWT payload as the authenticated identity
  return payload;
}
