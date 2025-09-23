import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppTodoUserPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPasswordReset";
import { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";

/**
 * Request password reset by inserting into todo_app_password_resets with
 * privacy-preserving behavior.
 *
 * Initiates a password reset workflow by creating a request row with
 * requested_at, expires_at, and token_hash. If the email maps to an existing
 * user, the row is correlated via todo_app_user_id; otherwise it remains null.
 * The raw token is never returned. Any notification dispatch occurs outside of
 * this function's scope.
 *
 * Security: The response does not disclose whether the email exists.
 *
 * @param props - Request properties
 * @param props.body - Payload containing the target email address
 * @returns Acknowledgment with request and expiry timestamps and echoed email
 * @throws {HttpException} 500 on unexpected persistence or hashing failures
 */
export async function postauthTodoUserPasswordResetRequest(props: {
  body: ITodoAppTodoUserPasswordReset.IRequest;
}): Promise<ITodoAppPasswordReset.IRequested> {
  const { body } = props;

  // Prepare timestamps (ISO strings)
  const nowMs: number = Date.now();
  const requested_at = toISOStringSafe(new Date(nowMs));
  const expires_at = toISOStringSafe(new Date(nowMs + 30 * 60 * 1000)); // 30 minutes policy

  // Optional correlation to user by email (privacy-preserving; not revealed)
  const user = await MyGlobal.prisma.todo_app_users.findUnique({
    where: { email: body.email },
    select: { id: true },
  });

  // Insert reset record with secure token hashing; retry on rare uniqueness collisions
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const token: string = v4();
    const token_hash: string = await MyGlobal.password.hash(token);

    try {
      await MyGlobal.prisma.todo_app_password_resets.create({
        data: {
          id: v4(),
          todo_app_user_id: user ? user.id : null,
          email: body.email,
          token,
          token_hash,
          requested_at,
          expires_at,
          consumed_at: null,
          requested_by_ip: null,
          created_at: requested_at,
          updated_at: requested_at,
          deleted_at: null,
        },
      });

      // Acknowledgment (privacy-preserving)
      return {
        requested_at,
        expires_at,
        email: body.email,
        note: "If an account exists for this email, you will receive a password reset link shortly.",
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        attempt < maxAttempts
      ) {
        // Likely a rare collision on token/token_hash; retry with a new token
        continue;
      }
      throw new HttpException("Internal Server Error", 500);
    }
  }

  // Exhausted retries (extremely unlikely)
  throw new HttpException("Internal Server Error", 500);
}
