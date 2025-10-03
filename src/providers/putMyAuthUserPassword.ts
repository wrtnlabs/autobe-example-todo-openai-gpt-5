import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ITodoMvpUserPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserPassword";
import { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import { UserPayload } from "../decorators/payload/UserPayload";

export async function putMyAuthUserPassword(props: {
  user: UserPayload;
  body: ITodoMvpUserPassword.IUpdate;
}): Promise<ITodoMvpUser> {
  /**
   * Change the authenticated member’s password by updating
   * Actors.todo_mvp_users.password_hash.
   *
   * Verifies the current password, hashes the new password, updates the user
   * record's password_hash and updated_at, and returns a non-sensitive user
   * object. Requires the caller to be an authenticated user and only updates
   * their own credential.
   *
   * @param props - Request properties
   * @param props.user - Authenticated user payload (owner of the account)
   * @param props.body - Current and new password values
   * @returns Updated user profile without sensitive fields
   * @throws {HttpException} 404 when user not found
   * @throws {HttpException} 403 when account is not active
   * @throws {HttpException} 400 when current password verification fails
   */
  const { user, body } = props;

  // Authorization + load current credentials
  const current = await MyGlobal.prisma.todo_mvp_users.findFirst({
    where: {
      id: user.id,
      deleted_at: null,
    },
    select: {
      id: true,
      email: true,
      password_hash: true,
      status: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (current === null) {
    throw new HttpException("Not Found: User does not exist", 404);
  }
  if (current.status !== "active") {
    throw new HttpException("Forbidden: Account is not active", 403);
  }

  // Verify current password
  const valid = await PasswordUtil.verify(
    body.current_password,
    current.password_hash,
  );
  if (!valid) {
    throw new HttpException("Bad Request: Current password is incorrect", 400);
  }

  // Rotate to new password and bump updated_at
  const updated = await MyGlobal.prisma.todo_mvp_users.update({
    where: { id: current.id },
    data: {
      password_hash: await PasswordUtil.hash(body.new_password),
      updated_at: toISOStringSafe(new Date()),
    },
    select: {
      id: true,
      email: true,
      status: true,
      created_at: true,
      updated_at: true,
    },
  });

  return {
    id: updated.id as string & tags.Format<"uuid">,
    email: updated.email as string & tags.Format<"email">,
    status: updated.status as IEAccountStatus,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: toISOStringSafe(updated.updated_at),
  };
}
