import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ITodoAppUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUserProfile";
import { TodouserPayload } from "../decorators/payload/TodouserPayload";

/**
 * Create a user profile (todo_app_user_profiles) for the specified userId.
 *
 * Inserts a new profile row bound 1:1 to the given user when none exists.
 * Enforces ownership: only the authenticated todoUser may create their own
 * profile. If a profile already exists (including soft-deleted records), a
 * conflict error is returned. Timestamps are recorded and soft-delete is null.
 *
 * @param props - Request properties
 * @param props.todoUser - The authenticated todo user payload (owner context)
 * @param props.userId - UUID of the user to whom the profile will be attached
 * @param props.body - Profile attributes (full_name, nickname, avatar_uri)
 * @returns The newly created user profile
 * @throws {HttpException} 403 when attempting to create another user's profile
 * @throws {HttpException} 404 when the user does not exist or is deleted
 * @throws {HttpException} 409 when a profile already exists for the user
 */
export async function posttodoAppTodoUserUsersUserIdProfile(props: {
  todoUser: TodouserPayload;
  userId: string & tags.Format<"uuid">;
  body: ITodoAppUserProfile.ICreate;
}): Promise<ITodoAppUserProfile> {
  const { todoUser, userId, body } = props;

  // Authorization: only owner can create their profile
  if (todoUser.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only create your own profile",
      403,
    );
  }

  // Ensure the user exists and is not soft-deleted
  await MyGlobal.prisma.todo_app_users.findFirstOrThrow({
    where: {
      id: userId,
      deleted_at: null,
    },
    select: { id: true },
  });

  // Enforce uniqueness: profile must not already exist (including soft-deleted)
  const existing = await MyGlobal.prisma.todo_app_user_profiles.findFirst({
    where: { todo_app_user_id: userId },
    select: { id: true },
  });
  if (existing) {
    throw new HttpException(
      "Conflict: Profile already exists. Use update endpoint instead.",
      409,
    );
  }

  // Normalize optional fields (trim strings; map empty to null)
  const normalize = (
    v: string | null | undefined,
  ): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = v.trim();
    return t.length === 0 ? null : t;
  };

  const now = toISOStringSafe(new Date());
  const newId = v4() as string & tags.Format<"uuid">;

  try {
    const created = await MyGlobal.prisma.todo_app_user_profiles.create({
      data: {
        id: newId,
        todo_app_user_id: userId,
        full_name: normalize(body.full_name) ?? undefined,
        nickname: normalize(body.nickname) ?? undefined,
        avatar_uri:
          normalize(body.avatar_uri as string | null | undefined) ?? undefined,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });

    return {
      id: created.id as string & tags.Format<"uuid">,
      todo_app_user_id: created.todo_app_user_id as string &
        tags.Format<"uuid">,
      full_name: created.full_name ?? null,
      nickname: created.nickname ?? null,
      avatar_uri: created.avatar_uri
        ? (created.avatar_uri as string &
            tags.MaxLength<80000> &
            tags.Format<"uri">)
        : null,
      created_at: toISOStringSafe(created.created_at),
      updated_at: toISOStringSafe(created.updated_at),
      deleted_at: created.deleted_at
        ? toISOStringSafe(created.deleted_at)
        : null,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint (race condition) → profile already exists
      if (err.code === "P2002") {
        throw new HttpException(
          "Conflict: Profile already exists. Use update endpoint instead.",
          409,
        );
      }
    }
    throw err;
  }
}
