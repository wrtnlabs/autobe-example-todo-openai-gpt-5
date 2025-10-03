import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import { UserPayload } from "../decorators/payload/UserPayload";

/**
 * Get a user (todo_mvp_users) by ID
 *
 * Retrieves a single user account by its identifier from Actors.todo_mvp_users.
 * Returns non-sensitive fields only (id, email, status, created_at,
 * updated_at).
 *
 * Authorization:
 *
 * - Caller must be an authenticated user and may only access their own record
 *   (owner-only). Administrative access is out of scope for this endpoint.
 *
 * @param props - Request properties
 * @param props.user - Authenticated user payload (JWT-derived)
 * @param props.userId - UUID of the user to retrieve
 * @returns The user profile (sans sensitive fields)
 * @throws {HttpException} 404 when not found or soft-deleted
 * @throws {HttpException} 403 when accessing another user's profile
 */
export async function getTodoMvpUserUsersUserId(props: {
  user: UserPayload;
  userId: string & tags.Format<"uuid">;
}): Promise<ITodoMvpUser> {
  const { user, userId } = props;

  // Step 1: Fetch the user by ID (excluding soft-deleted)
  const record = await MyGlobal.prisma.todo_mvp_users.findFirst({
    where: { id: userId, deleted_at: null },
    select: {
      id: true,
      email: true,
      status: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (record === null)
    throw new HttpException("Not Found: User does not exist", 404);

  // Step 2: Enforce owner-only access
  if (record.id !== user.id)
    throw new HttpException(
      "Forbidden: You can only access your own profile",
      403,
    );

  // Narrow status to allowed union values without exposing arbitrary strings
  const status: IEAccountStatus =
    record.status === "active" ? "active" : "deactivated";

  // Step 3: Map to DTO with proper date-time string conversions
  return {
    id: record.id as string & tags.Format<"uuid">,
    email: record.email as string & tags.Format<"email">,
    status,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
  };
}
