import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEmailVerification";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_email_verifications_list_unconsumed_default_sort(
  connection: api.IConnection,
) {
  /**
   * Validate email verifications listing with default pagination/sorting for
   * the owner.
   *
   * Steps:
   *
   * 1. Register user A (todoUser join) → expect email verification scheduled.
   * 2. Owner lists verifications with default request body → expect at least one
   *    record that matches registered email, pending (unconsumed), and coherent
   *    sent/expires timestamps. If multiple results, verify default sort is
   *    non-increasing by sent_at.
   * 3. Unauthenticated call must fail.
   * 4. Cross-user access (user B tries to read user A) must fail.
   */

  // 1) Register user A
  const emailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordA: string = RandomGenerator.alphaNumeric(12);
  const joinBodyA = {
    email: emailA,
    password: passwordA,
  } satisfies ITodoAppTodoUser.ICreate;
  const authA: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBodyA });
  typia.assert(authA);

  // 2) Owner lists verifications with default body
  const requestBody = {} satisfies ITodoAppEmailVerification.IRequest;
  const pageA =
    await api.functional.todoApp.todoUser.users.emailVerifications.index(
      connection,
      {
        userId: authA.id,
        body: requestBody,
      },
    );
  typia.assert(pageA);

  // Basic existence
  await TestValidator.predicate(
    "owner listing returns at least one verification record",
    async () => pageA.data.length >= 1,
  );

  // Records for the registered email
  const matches = pageA.data.filter((r) => r.target_email === emailA);
  await TestValidator.predicate(
    "there exists at least one verification for the registered email",
    async () => matches.length >= 1,
  );

  // Pending state: consumed_at must be null or undefined for at least one match
  const pending = matches.find(
    (r) => r.consumed_at === null || r.consumed_at === undefined,
  );
  await TestValidator.predicate(
    "at least one verification for registered email is pending (unconsumed)",
    async () => pending !== undefined,
  );

  // Temporal coherence: expires_at must be >= sent_at for all matches
  await TestValidator.predicate(
    "expires_at is greater than or equal to sent_at for all matched records",
    async () =>
      matches.every(
        (r) =>
          new Date(r.expires_at).getTime() >= new Date(r.sent_at).getTime(),
      ),
  );

  // Default sorting check: non-increasing sent_at order across the page (if multiple)
  if (pageA.data.length > 1) {
    const nonIncreasing = pageA.data.every(
      (r, idx, arr) =>
        idx === 0 ||
        new Date(arr[idx - 1].sent_at).getTime() >=
          new Date(r.sent_at).getTime(),
    );
    await TestValidator.predicate(
      "default listing is sorted by sent_at descending (non-increasing order)",
      async () => nonIncreasing,
    );
  }

  // 3) Unauthenticated request must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot list verifications",
    async () => {
      await api.functional.todoApp.todoUser.users.emailVerifications.index(
        unauthConn,
        {
          userId: authA.id,
          body: requestBody,
        },
      );
    },
  );

  // 4) Cross-user access must fail
  const emailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const passwordB: string = RandomGenerator.alphaNumeric(12);
  const joinBodyB = {
    email: emailB,
    password: passwordB,
  } satisfies ITodoAppTodoUser.ICreate;
  const authB: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, { body: joinBodyB });
  typia.assert(authB);

  // Now authenticated as B, trying to access A's records should error
  await TestValidator.error(
    "cross-user access is forbidden (user B cannot list user A's verifications)",
    async () => {
      await api.functional.todoApp.todoUser.users.emailVerifications.index(
        connection,
        {
          userId: authA.id,
          body: requestBody,
        },
      );
    },
  );
}
