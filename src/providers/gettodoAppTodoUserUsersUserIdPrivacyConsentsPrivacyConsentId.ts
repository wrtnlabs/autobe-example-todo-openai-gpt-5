import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Get a specific privacy consent by ID (todo_app_privacy_consents)
 *
 * Retrieves a single privacy consent record belonging to the authenticated todo
 * user, ensuring strict ownership and privacy. The path userId must match the
 * authenticated subject, and the consent must belong to that same user.
 * Soft-deleted records are excluded. Returns the exact stored consent event
 * with timestamps converted to ISO strings.
 *
 * Security: Only the owner (role: todoUser) may access. Mismatches or
 * non-existent records respond with a not-found style outcome to avoid
 * existence leakage.
 *
 * @param props - Request properties
 * @param props.todoUser - Authenticated todo user payload (must represent the
 *   same user as path userId)
 * @param props.userId - Owner user’s UUID (must match the authenticated
 *   subject)
 * @param props.privacyConsentId - Target privacy consent record’s UUID
 * @returns Detailed privacy consent record
 * @throws {HttpException} 403 when payload role is invalid
 * @throws {HttpException} 404 when userId mismatch, record not found, or not
 *   owned by caller
 */
export async function gettodoAppTodoUserUsersUserIdPrivacyConsentsPrivacyConsentId(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  privacyConsentId: string & tags.Format<"uuid">;
}): Promise<ITodoAppPrivacyConsent> {
  const { todoUser, userId, privacyConsentId } = props;

  // Authorization: ensure correct role and subject-path match
  if (!todoUser || todoUser.type !== "todouser") {
    throw new HttpException("Forbidden", 403);
  }
  if (todoUser.id !== userId) {
    // Not-found style to avoid existence leakage
    throw new HttpException("Not Found", 404);
  }

  // Fetch record with ownership and soft-delete constraints
  const consent = await MyGlobal.prisma.todo_app_privacy_consents.findFirst({
    where: {
      id: privacyConsentId,
      todo_app_user_id: userId,
      deleted_at: null,
    },
  });

  if (!consent) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API DTO with proper date conversions and optional nullable handling
  return typia.assert<ITodoAppPrivacyConsent>({
    id: consent.id,
    purpose_code: consent.purpose_code,
    purpose_name: consent.purpose_name,
    granted: consent.granted,
    granted_at: toISOStringSafe(consent.granted_at),
    revoked_at: consent.revoked_at
      ? toISOStringSafe(consent.revoked_at)
      : undefined,
    expires_at: consent.expires_at
      ? toISOStringSafe(consent.expires_at)
      : undefined,
    policy_version: consent.policy_version,
    source: consent.source ?? undefined,
    ip: consent.ip ?? undefined,
    user_agent: consent.user_agent ?? undefined,
    created_at: toISOStringSafe(consent.created_at),
    updated_at: toISOStringSafe(consent.updated_at),
  });
}
