import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEmailVerification";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

/**
 * Cross-user denial on email verification detail.
 *
 * Scenario
 *
 * 1. Join user A (authorization switches to A)
 * 2. Join user B (authorization switches to B)
 * 3. Under B, list own email verifications and pick one id if exists
 *
 *    - If exists, verify owner-read succeeds
 *    - If none, fallback to a random UUID to proceed with denial test
 * 4. Join user C (authorization switches to C)
 * 5. As C, attempt to GET B's verification by userId=C and
 *    emailVerificationId=B-owned-id
 *
 *    - Expect error (denied/not-found). Do not assert status code.
 */
export async function test_api_email_verification_detail_cross_user_denied(
  connection: api.IConnection,
) {
  // 1) Join user A
  const a = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(a);

  // 2) Join user B (auth switches to B)
  const b = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(b);

  // 3) B lists own email verifications to capture an id
  const pageB =
    await api.functional.todoApp.todoUser.users.emailVerifications.index(
      connection,
      {
        userId: b.id,
        body: {} satisfies ITodoAppEmailVerification.IRequest,
      },
    );
  typia.assert(pageB);

  let bVerificationId: string & tags.Format<"uuid">;
  if (pageB.data.length > 0) {
    bVerificationId = pageB.data[0].id;

    // Owner read should succeed for a valid B-owned id
    const own =
      await api.functional.todoApp.todoUser.users.emailVerifications.at(
        connection,
        { userId: b.id, emailVerificationId: bVerificationId },
      );
    typia.assert(own);
    TestValidator.equals(
      "owner id in record should match B",
      own.todo_app_user_id,
      b.id,
    );
    TestValidator.equals(
      "returned verification id should equal requested id",
      own.id,
      bVerificationId,
    );
  } else {
    // Fallback: still validate cross-user denial semantics using a UUID
    bVerificationId = typia.random<string & tags.Format<"uuid">>();
  }

  // 4) Join user C (auth switches to C)
  const c = await api.functional.auth.todoUser.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ITodoAppTodoUser.ICreate,
  });
  typia.assert(c);

  // 5) As C, attempt to read B's verification by setting userId=C and using B's verification id
  await TestValidator.error(
    "cross-user cannot read another user's email verification detail",
    async () => {
      await api.functional.todoApp.todoUser.users.emailVerifications.at(
        connection,
        { userId: c.id, emailVerificationId: bVerificationId },
      );
    },
  );
}
