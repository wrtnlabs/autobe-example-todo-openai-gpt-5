import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppSystemAdminPasswordResetRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetRequest";
import { ITodoAppSystemAdminPasswordResetRequestResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetRequestResult";

/**
 * Record password reset request for admin in todo_app_password_resets.
 *
 * Accepts an email and creates a password reset request row with a hashed
 * token, requested/expires timestamps, and optional linkage to a user when the
 * email exists. This endpoint MUST NOT disclose whether the email maps to an
 * account. No plaintext tokens are returned or exposed in responses.
 *
 * Security notes:
 *
 * - Generates a random token, stores only its hash for verification purposes.
 * - To avoid plaintext storage while satisfying NOT NULL + unique constraints on
 *   `token`, stores the hashed token in both `token` and `token_hash` columns.
 * - Does not reveal user existence in the response.
 *
 * @param props - Request properties
 * @param props.body - Payload containing the administrator email address
 * @returns Privacy-preserving acknowledgment of request acceptance
 * @throws {HttpException} 409 when unique constraints repeatedly conflict
 * @throws {HttpException} 500 on unexpected database or hashing errors
 */
export async function postauthSystemAdminPasswordResetRequest(props: {
  body: ITodoAppSystemAdminPasswordResetRequest.ICreate;
}): Promise<ITodoAppSystemAdminPasswordResetRequestResult> {
  const email = props.body.email;

  // Resolve optional user linkage by email (privacy preserved; no branching on result)
  const user = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { email },
    select: { id: true },
  });

  // Timestamps
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const ttlSecondsRaw = Number(MyGlobal.env.PASSWORD_RESET_TTL_SECONDS ?? 3600);
  const ttlSeconds =
    Number.isFinite(ttlSecondsRaw) && ttlSecondsRaw > 0 ? ttlSecondsRaw : 3600;
  const expires_at: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + ttlSeconds * 1000),
  );

  // Attempt creation with hashed token; retry on rare unique conflicts
  let attempts = 0;
  const maxAttempts = 3;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempts += 1;

    // Generate a random opaque token and hash it (hash stored; raw never returned)
    const rawToken = `${v4()}.${v4()}`;
    const token_hash = await MyGlobal.password.hash(rawToken);

    try {
      await MyGlobal.prisma.todo_app_password_resets.create({
        data: {
          id: v4(),
          todo_app_user_id: user ? user.id : null,
          email,
          token: token_hash, // store hashed value to avoid plaintext exposure
          token_hash,
          requested_at: now,
          expires_at,
          failure_count: 0,
          created_at: now,
          updated_at: now,
          // requested_by_ip is optional; not available in props
          // consumed_at left null/undefined by design on creation
        },
      });
      break; // success
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        attempts < maxAttempts
      ) {
        // Unique constraint violation (e.g., token_hash collision). Retry.
        continue;
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new HttpException(
          "Conflict: Could not create password reset request",
          409,
        );
      }
      throw new HttpException("Internal Server Error", 500);
    }
  }

  return {
    accepted: true,
    message:
      "If an account exists, you'll receive an email with instructions shortly.",
  };
}
