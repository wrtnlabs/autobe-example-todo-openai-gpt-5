import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppPasswordReset";
import type { ITodoAppPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppPasswordReset";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserPasswordReset } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserPasswordReset";

/**
 * List password reset requests after creation (owner-only visibility).
 *
 * Business flow and validations:
 *
 * 1. Register a todoUser (join) to obtain owner id and email; SDK auto-applies
 *    auth headers.
 * 2. Submit multiple password reset requests using the owner email via the public
 *    endpoint.
 * 3. As the authenticated owner, list password resets for userId with filters:
 *
 *    - Consumed=false (only unconsumed)
 *    - Email=owner email (narrow scope)
 *    - Order_by=requested_at desc, page=1, limit<=100
 * 4. Validate business rules:
 *
 *    - Returned items are at least as many as created in step 2
 *    - All items belong to the owner’s email
 *    - All items are unconsumed (consumed_at is null or undefined)
 * 5. Negative paths:
 *
 *    - Unauthenticated listing is rejected
 *    - Listing for another userId is rejected
 *    - Malformed filters (invalid limit) are rejected
 */
export async function test_api_password_resets_list_after_creation(
  connection: api.IConnection,
) {
  // 1) Register owner and authenticate
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ITodoAppTodoUser.ICreate;
  const owner: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBody });
  typia.assert(owner);

  const userEmail = joinBody.email;
  const userId = owner.id;

  // 2) Submit multiple password reset requests (public endpoint)
  const createCount = 3;
  const acks = await ArrayUtil.asyncRepeat(createCount, async () => {
    const ack =
      await api.functional.auth.todoUser.password.reset.request.requestPasswordReset(
        connection,
        {
          body: {
            email: userEmail,
          } satisfies ITodoAppTodoUserPasswordReset.IRequest,
        },
      );
    typia.assert(ack);
    return ack;
  });
  TestValidator.predicate(
    "received acknowledgments for each reset request",
    acks.length === createCount,
  );

  // 3) List resets (owner auth)
  const page1: IPageITodoAppPasswordReset.ISummary =
    await api.functional.todoApp.todoUser.users.passwordResets.index(
      connection,
      {
        userId,
        body: {
          page: 1,
          limit: 100,
          email: userEmail,
          consumed: false,
          order_by: "requested_at",
          order_dir: "desc",
        } satisfies ITodoAppPasswordReset.IRequest,
      },
    );
  typia.assert(page1);

  // 4) Validations
  TestValidator.predicate(
    "list contains at least the number of newly requested resets",
    page1.data.length >= createCount,
  );
  TestValidator.predicate(
    "all listed records are for the owner's email",
    page1.data.every((r) => r.email === userEmail),
  );
  TestValidator.predicate(
    "all listed records are unconsumed (consumed_at is null or undefined)",
    page1.data.every(
      (r) => r.consumed_at === null || r.consumed_at === undefined,
    ),
  );

  // 5) Negative: unauthenticated access should fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot list password resets",
    async () => {
      await api.functional.todoApp.todoUser.users.passwordResets.index(
        unauthConn,
        {
          userId,
          body: {
            email: userEmail,
            page: 1,
            limit: 10,
          } satisfies ITodoAppPasswordReset.IRequest,
        },
      );
    },
  );

  // 6) Negative: listing with a mismatched userId should fail
  await TestValidator.error(
    "cannot list another user's password resets",
    async () => {
      await api.functional.todoApp.todoUser.users.passwordResets.index(
        connection,
        {
          userId: typia.random<string & tags.Format<"uuid">>(),
          body: {
            email: userEmail,
            page: 1,
            limit: 10,
          } satisfies ITodoAppPasswordReset.IRequest,
        },
      );
    },
  );

  // 7) Negative: invalid filters (e.g., limit out of range) should be rejected
  await TestValidator.error(
    "invalid pagination limit is rejected by validation",
    async () => {
      await api.functional.todoApp.todoUser.users.passwordResets.index(
        connection,
        {
          userId,
          body: {
            email: userEmail,
            page: 1,
            limit: 0,
          } satisfies ITodoAppPasswordReset.IRequest,
        },
      );
    },
  );
}
