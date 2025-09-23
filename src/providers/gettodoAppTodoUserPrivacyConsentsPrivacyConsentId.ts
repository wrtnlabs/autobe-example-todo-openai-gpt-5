import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppPrivacyConsent } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPrivacyConsent";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

export async function gettodoAppTodoUserPrivacyConsentsPrivacyConsentId(props: {
  todoUser: TodouserPayload;
  privacyConsentId: string & tags.Format<"uuid">;
}): Promise<ITodoAppPrivacyConsent> {
  /**
   * Get a single privacy consent (todo_app_privacy_consents) by ID
   *
   * Retrieves a privacy consent record by primary key, enforcing ownership so
   * only the authenticated todoUser can access their own consent. Soft-deleted
   * records (deleted_at != null) are excluded.
   *
   * Authorization: todoUser only. Ownership is verified by matching
   * todo_app_user_id with the authenticated user's id. If not owned or not
   * found, responds with an authorization-safe 404.
   *
   * @param props - Request properties
   * @param props.todoUser - Authenticated todoUser payload (owner id)
   * @param props.privacyConsentId - UUID of the privacy consent to fetch
   * @returns Complete ITodoAppPrivacyConsent entity
   * @throws {HttpException} 404 when not found or not owned by caller
   */
  const { todoUser, privacyConsentId } = props;

  const record = await MyGlobal.prisma.todo_app_privacy_consents.findFirst({
    where: {
      id: privacyConsentId,
      deleted_at: null,
    },
    select: {
      id: true,
      todo_app_user_id: true,
      purpose_code: true,
      purpose_name: true,
      granted: true,
      granted_at: true,
      revoked_at: true,
      expires_at: true,
      policy_version: true,
      source: true,
      ip: true,
      user_agent: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!record) {
    throw new HttpException("Not Found", 404);
  }
  if (record.todo_app_user_id !== todoUser.id) {
    // Authorization-safe denial without leaking existence
    throw new HttpException("Not Found", 404);
  }

  return {
    id: record.id as string & tags.Format<"uuid">,
    purpose_code: record.purpose_code,
    purpose_name: record.purpose_name,
    granted: record.granted,
    granted_at: toISOStringSafe(record.granted_at),
    revoked_at: record.revoked_at ? toISOStringSafe(record.revoked_at) : null,
    expires_at: record.expires_at ? toISOStringSafe(record.expires_at) : null,
    policy_version: record.policy_version,
    source: record.source ?? null,
    ip: record.ip ?? null,
    user_agent: record.user_agent ?? null,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
  };
}
