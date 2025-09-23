import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";

export async function postauthGuestVisitorPasswordResetRequest(props: {
  body: ITodoAppPasswordReset.IRequest;
}): Promise<ITodoAppPasswordReset.ISummary> {
  /**
   * Create a todo_app_password_resets record to begin reset without revealing
   * account existence.
   *
   * Public endpoint: records a password reset intent for the submitted email,
   * generating an opaque token (stored only as a hash) and expiry. It must not
   * disclose whether an account exists. Only response-safe metadata is
   * returned, and no token is exposed.
   *
   * Behavior:
   *
   * - Looks up user by email to optionally set todo_app_user_id (null otherwise)
   * - Persists reset request with token_hash, requested_at, expires_at, and
   *   metadata
   * - Returns uniform acknowledgment regardless of account existence
   *
   * @param props - Request properties
   * @param props.body - ITodoAppPasswordReset.IRequest containing email and
   *   optional filters
   * @returns ITodoAppPasswordReset.ISummary with id, email, requested_at,
   *   expires_at, consumed_at
   * @throws {HttpException} 400 Bad Request when email is missing or null
   */
  const { body } = props;

  // Basic validation: email is required for this operation
  if (body.email === undefined || body.email === null) {
    throw new HttpException("Bad Request: 'email' is required", 400);
  }
  const email = body.email; // string & tags.Format<"email">

  // Prepare identifiers and timestamps (no native Date typing)
  const id = v4() as string & tags.Format<"uuid">;
  const requestedAt = toISOStringSafe(new Date());
  const expiresAt = toISOStringSafe(new Date(Date.now() + 60 * 60 * 1000)); // +1 hour

  // Generate opaque token and secure hash (do not persist plaintext in response)
  const token = `${v4()}.${v4()}`;
  const tokenHash = await MyGlobal.password.hash(token);

  // Attempt to resolve user by email (privacy-preserving: does not affect response)
  const user = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { email },
    select: { id: true },
  });

  // Persist reset request (never expose token/token_hash in response)
  await MyGlobal.prisma.todo_app_password_resets.create({
    data: {
      id,
      todo_app_user_id: user ? user.id : null,
      email,
      token,
      token_hash: tokenHash,
      requested_at: requestedAt,
      expires_at: expiresAt,
      consumed_at: null,
      failure_count: 0,
      requested_by_ip: null,
      consumed_by_ip: null,
      created_at: requestedAt,
      updated_at: requestedAt,
      deleted_at: null,
    },
    // Minimal selection; dates returned by Prisma are Date, but we reuse prepared values
    select: { id: true },
  });

  // Return uniform, non-sensitive acknowledgment
  const summary: ITodoAppPasswordReset.ISummary = {
    id,
    email,
    requested_at: requestedAt,
    expires_at: expiresAt,
    consumed_at: null,
  };
  return summary;
}
