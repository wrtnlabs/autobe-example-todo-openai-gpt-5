import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppEmailVerification";
import type { ITodoAppEmailVerification } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEmailVerification";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";

export async function test_api_email_verification_detail_owned_record(
  connection: api.IConnection,
) {
  // 1) Register owner (todoUser) and obtain authentication
  const ownerEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const ownerPassword: string = RandomGenerator.alphaNumeric(12);

  const ownerAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: ownerEmail,
        password: ownerPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(ownerAuth);

  // 2) List verifications to discover a valid emailVerificationId
  const page: IPageITodoAppEmailVerification.ISummary =
    await api.functional.todoApp.todoUser.users.emailVerifications.index(
      connection,
      {
        userId: ownerAuth.id,
        body: {} satisfies ITodoAppEmailVerification.IRequest,
      },
    );
  typia.assert(page);

  TestValidator.predicate(
    "verifications list must contain at least one record",
    page.data.length > 0,
  );

  // Prefer the record matching the owner email; fallback to first item
  const preferred = page.data.find((s) => s.target_email === ownerEmail);
  const chosen = preferred ?? page.data[0]!;

  // 3) Fetch the detail as the owner
  const detail: ITodoAppEmailVerification =
    await api.functional.todoApp.todoUser.users.emailVerifications.at(
      connection,
      {
        userId: ownerAuth.id,
        emailVerificationId: chosen.id,
      },
    );
  typia.assert(detail);

  // Ownership validation
  TestValidator.equals(
    "detail.todo_app_user_id must match owner id",
    detail.todo_app_user_id,
    ownerAuth.id,
  );

  // Metadata consistency between index summary and detail
  TestValidator.equals("detail.id equals index.id", detail.id, chosen.id);
  TestValidator.equals(
    "detail.target_email equals index.target_email",
    detail.target_email,
    chosen.target_email,
  );
  TestValidator.equals(
    "detail.sent_at equals index.sent_at",
    detail.sent_at,
    chosen.sent_at,
  );
  TestValidator.equals(
    "detail.expires_at equals index.expires_at",
    detail.expires_at,
    chosen.expires_at,
  );
  TestValidator.equals(
    "detail.consumed_at equals index.consumed_at",
    detail.consumed_at,
    chosen.consumed_at,
  );
  TestValidator.equals(
    "detail.failure_count equals index.failure_count",
    detail.failure_count,
    chosen.failure_count,
  );

  // Temporal validations
  TestValidator.predicate(
    "expires_at must be not earlier than sent_at",
    new Date(detail.expires_at).getTime() >= new Date(detail.sent_at).getTime(),
  );
  if (detail.consumed_at !== null && detail.consumed_at !== undefined) {
    TestValidator.predicate(
      "when present, consumed_at must be not earlier than sent_at",
      new Date(detail.consumed_at).getTime() >=
        new Date(detail.sent_at).getTime(),
    );
  }

  // 4) Negative case: another user must NOT access owner's verification record
  const attackerEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const attackerPassword: string = RandomGenerator.alphaNumeric(12);

  const attackerAuth: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: {
        email: attackerEmail,
        password: attackerPassword,
      } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(attackerAuth);

  await TestValidator.error(
    "non-owner cannot fetch another user's email verification detail",
    async () => {
      await api.functional.todoApp.todoUser.users.emailVerifications.at(
        connection,
        {
          userId: attackerAuth.id,
          emailVerificationId: detail.id,
        },
      );
    },
  );
}
