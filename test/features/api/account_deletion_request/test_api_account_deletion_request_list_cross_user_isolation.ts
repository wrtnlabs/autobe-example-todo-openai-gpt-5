import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppAccountDeletionRequest";
import type { ITodoAppAccountDeletionRequest } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppAccountDeletionRequest";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_account_deletion_request_list_cross_user_isolation(
  connection: api.IConnection,
) {
  // Maintain two isolated auth contexts via cloned connections (no manual header ops)
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Register two independent todoUsers (userA and userB)
  const joinABody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userA = await api.functional.auth.todoUser.join(connA, {
    body: joinABody,
  });
  typia.assert(userA);

  const joinBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>(),
  } satisfies ITodoAppTodoUser.ICreate;
  const userB = await api.functional.auth.todoUser.join(connB, {
    body: joinBBody,
  });
  typia.assert(userB);

  // Time anchor to constrain listings to test-created records
  const t0: string = new Date().toISOString();

  // 2) Create one account deletion request per user
  const createABody = {
    reason: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;
  const reqA =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connA,
      { userId: userA.id, body: createABody },
    );
  typia.assert(reqA);

  const createBBody = {
    reason: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ITodoAppAccountDeletionRequest.ICreate;
  const reqB =
    await api.functional.todoApp.todoUser.users.accountDeletionRequests.create(
      connB,
      { userId: userB.id, body: createBBody },
    );
  typia.assert(reqB);

  // 3) Under userA context: list and validate isolation
  const listABody = {
    page: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    limit: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1> & tags.Maximum<100>
    >(),
    created_at_from: typia.assert<string & tags.Format<"date-time">>(t0),
  } satisfies ITodoAppAccountDeletionRequest.IRequest;
  const pageA =
    await api.functional.todoApp.todoUser.accountDeletionRequests.index(connA, {
      body: listABody,
    });
  typia.assert(pageA);

  const idsA = pageA.data.map((s) => s.id);
  TestValidator.equals(
    "userA listing contains its own deletion request",
    idsA.includes(reqA.id),
    true,
  );
  TestValidator.equals(
    "userA listing excludes userB's deletion request",
    idsA.includes(reqB.id),
    false,
  );
  TestValidator.predicate(
    "userA pagination indicates at least one record",
    pageA.pagination.records >= 1,
  );
  TestValidator.predicate(
    "userA page size does not exceed the limit",
    pageA.data.length <= pageA.pagination.limit,
  );

  // 4) Under userB context: list and validate isolation
  const listBBody = {
    page: typia.random<number & tags.Type<"int32"> & tags.Minimum<1>>(),
    limit: typia.random<
      number & tags.Type<"int32"> & tags.Minimum<1> & tags.Maximum<100>
    >(),
    created_at_from: typia.assert<string & tags.Format<"date-time">>(t0),
  } satisfies ITodoAppAccountDeletionRequest.IRequest;
  const pageB =
    await api.functional.todoApp.todoUser.accountDeletionRequests.index(connB, {
      body: listBBody,
    });
  typia.assert(pageB);

  const idsB = pageB.data.map((s) => s.id);
  TestValidator.equals(
    "userB listing contains its own deletion request",
    idsB.includes(reqB.id),
    true,
  );
  TestValidator.equals(
    "userB listing excludes userA's deletion request",
    idsB.includes(reqA.id),
    false,
  );
  TestValidator.predicate(
    "userB pagination indicates at least one record",
    pageB.pagination.records >= 1,
  );
  TestValidator.predicate(
    "userB page size does not exceed the limit",
    pageB.data.length <= pageB.pagination.limit,
  );
}
