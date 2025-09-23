import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ITodoAppSystemAdminPasswordResetConfirm } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetConfirm";
import type { ITodoAppSystemAdminPasswordResetConfirmResult } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminPasswordResetConfirmResult";

export async function test_api_system_admin_password_reset_confirm_malformed_payload_validation_error(
  connection: api.IConnection,
) {
  /**
   * Validate that malformed confirmation payloads are rejected while
   * maintaining strict type safety and avoiding type-error scenarios.
   *
   * Steps
   *
   * 1. Generate a valid new_password satisfying MinLength<8> & MaxLength<64>.
   * 2. Attempt confirmation with an empty token string (should fail in real
   *    server).
   * 3. Attempt confirmation with a whitespace-only token string (should fail in
   *    real server).
   * 4. If simulate mode is enabled, assert only the response type because
   *    simulator validates structure but not business rules.
   */
  const validPassword: string = RandomGenerator.alphaNumeric(12);

  const bodyEmptyToken = {
    token: "",
    new_password: validPassword,
  } satisfies ITodoAppSystemAdminPasswordResetConfirm.ICreate;

  const bodyWhitespaceToken = {
    token: " ",
    new_password: validPassword,
  } satisfies ITodoAppSystemAdminPasswordResetConfirm.ICreate;

  if (connection.simulate === true) {
    const res1 =
      await api.functional.auth.systemAdmin.password.reset.confirm.confirmPasswordReset(
        connection,
        { body: bodyEmptyToken },
      );
    typia.assert<ITodoAppSystemAdminPasswordResetConfirmResult>(res1);

    const res2 =
      await api.functional.auth.systemAdmin.password.reset.confirm.confirmPasswordReset(
        connection,
        { body: bodyWhitespaceToken },
      );
    typia.assert<ITodoAppSystemAdminPasswordResetConfirmResult>(res2);

    return;
  }

  await TestValidator.error("empty token must be rejected", async () => {
    await api.functional.auth.systemAdmin.password.reset.confirm.confirmPasswordReset(
      connection,
      { body: bodyEmptyToken },
    );
  });

  await TestValidator.error(
    "whitespace-only token must be rejected",
    async () => {
      await api.functional.auth.systemAdmin.password.reset.confirm.confirmPasswordReset(
        connection,
        { body: bodyWhitespaceToken },
      );
    },
  );
}
