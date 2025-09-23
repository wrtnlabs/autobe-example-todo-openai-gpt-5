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
 * Create a new privacy consent event (todo_app_privacy_consents)
 *
 * Appends a new consent event for the specified user using an append-only
 * model. The record includes purpose_code, purpose_name, granted flag,
 * policy_version, timing fields (granted_at, optional revoked_at/expires_at),
 * and optional context (source, ip, user_agent). Ownership is enforced by
 * ensuring the authenticated todoUser matches the path userId.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user payload (owner)
 * @param props.userId - UUID of the user for whom the consent is recorded
 * @param props.body - Consent creation payload (purpose, grant/withdrawal,
 *   policy context)
 * @returns Newly created privacy consent record
 * @throws {HttpException} 403 when attempting to write for another user's
 *   account
 */
export async function posttodoAppTodoUserUsersUserIdPrivacyConsents(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppPrivacyConsent.ICreate;
}): Promise<ITodoAppPrivacyConsent> {
  const { todoUser, userId, body } = props;

  // Authorization: only the owner can append their consent history
  if (!todoUser || todoUser.id !== userId) {
    throw new HttpException(
      "Unauthorized: You can only create consent for your own account",
      403,
    );
  }

  // Timestamps
  const now = toISOStringSafe(new Date());
  const grantedAt = body.granted_at ? toISOStringSafe(body.granted_at) : now;
  const revokedAt =
    body.revoked_at !== undefined && body.revoked_at !== null
      ? toISOStringSafe(body.revoked_at)
      : null;
  const expiresAt =
    body.expires_at !== undefined && body.expires_at !== null
      ? toISOStringSafe(body.expires_at)
      : null;

  // Create record (append-only)
  const created = await MyGlobal.prisma.todo_app_privacy_consents.create({
    data: {
      id: v4() as string & tags.Format<"uuid">,
      todo_app_user_id: userId,
      purpose_code: body.purpose_code,
      purpose_name: body.purpose_name,
      granted: body.granted,
      granted_at: grantedAt,
      revoked_at: revokedAt,
      expires_at: expiresAt,
      policy_version: body.policy_version,
      source: body.source ?? null,
      ip: null,
      user_agent: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  // Map to API DTO with proper date-time conversions
  return {
    id: created.id as string & tags.Format<"uuid">,
    purpose_code: created.purpose_code,
    purpose_name: created.purpose_name,
    granted: created.granted,
    granted_at: toISOStringSafe(created.granted_at),
    revoked_at: created.revoked_at ? toISOStringSafe(created.revoked_at) : null,
    expires_at: created.expires_at ? toISOStringSafe(created.expires_at) : null,
    policy_version: created.policy_version,
    source: created.source ?? null,
    ip: created.ip ?? null,
    user_agent: created.user_agent ?? null,
    created_at: toISOStringSafe(created.created_at),
    updated_at: toISOStringSafe(created.updated_at),
  };
}
