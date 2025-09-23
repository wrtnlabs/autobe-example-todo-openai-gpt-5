import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppUser";

/**
 * Admin can fetch a specific user's administrative detail by UUID.
 *
 * Context and purpose:
 *
 * - A systemAdmin needs to look up a member's account record using the
 *   administrative users.at endpoint.
 * - The endpoint must expose business-visible fields (email, status, verification
 *   flags/timestamps, lifecycle timestamps) while excluding secrets.
 *
 * Test flow:
 *
 * 1. Register a systemAdmin and keep its token on the main connection.
 * 2. Register a member (todoUser) using a cloned connection to avoid overwriting
 *    the admin token on the main connection.
 * 3. As systemAdmin, call GET /todoApp/systemAdmin/users/{userId} for the newly
 *    created member's id and validate correctness.
 * 4. Negative: Attempt to fetch a non-existent UUID and expect an error (without
 *    validating status codes).
 */
export async function test_api_user_admin_detail_existing_member(
  connection: api.IConnection,
) {
  // 1) Register a systemAdmin and keep token on main connection
  const adminEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminPassword: string = RandomGenerator.alphaNumeric(12);
  const adminAuth: ITodoAppSystemAdmin.IAuthorized =
    await api.functional.auth.systemAdmin.join(connection, {
      body: {
        email: adminEmail,
        password: adminPassword,
      } satisfies ITodoAppSystemAdminJoin.ICreate,
    });
  typia.assert(adminAuth);

  // 2) Register a member (todoUser) using a separate connection to preserve admin token
  const memberConn: api.IConnection = { ...connection, headers: {} };
  const memberEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const memberPassword: string = RandomGenerator.alphaNumeric(12);
  const memberAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(memberConn, {
      body: {
        email: memberEmail,
        password: memberPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(memberAuth);

  // 3) Admin reads the member detail by UUID
  const user: ITodoAppUser = await api.functional.todoApp.systemAdmin.users.at(
    connection,
    { userId: memberAuth.id },
  );
  typia.assert(user);

  // Business validations
  TestValidator.equals(
    "returned user id matches requested id",
    user.id,
    memberAuth.id,
  );
  TestValidator.equals(
    "returned user email matches created member email",
    user.email,
    memberEmail,
  );

  // 4) Negative: non-existent UUID should cause an error (no status code assertion)
  const randomUuid: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  const unknownId: string & tags.Format<"uuid"> =
    randomUuid === memberAuth.id
      ? typia.random<string & tags.Format<"uuid">>()
      : randomUuid;
  await TestValidator.error(
    "admin retrieving unknown user id should fail",
    async () => {
      await api.functional.todoApp.systemAdmin.users.at(connection, {
        userId: unknownId,
      });
    },
  );
}
