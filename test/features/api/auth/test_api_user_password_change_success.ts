import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import type { ITodoMvpUserPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserPassword";

/**
 * Verify a member can rotate their own password and the user record updates
 * correctly.
 *
 * Business goals:
 *
 * - A newly joined user changes password with correct current_password.
 * - The returned user profile excludes sensitive fields by contract and reflects
 *   an increased updated_at.
 * - Identity invariants hold: id and email remain the same; created_at remains
 *   unchanged; status is unchanged.
 *
 * Steps:
 *
 * 1. Register a new member via POST /auth/user/join
 * 2. Rotate password via PUT /my/auth/user/password
 * 3. Validate invariants and temporal change on updated_at
 *
 * Notes:
 *
 * - Session continuity after password change is implied by the successful
 *   protected call itself.
 * - No non-existent API is called; we avoid additional protected endpoints not
 *   present in the SDK list.
 */
export async function test_api_user_password_change_success(
  connection: api.IConnection,
) {
  // 1) Register a new member
  const email = typia.random<string & tags.Format<"email">>();
  const initialPassword: string = RandomGenerator.alphaNumeric(12); // >= 8 chars

  const joined = await api.functional.auth.user.join(connection, {
    body: {
      email,
      password: initialPassword,
    } satisfies ITodoMvpUser.ICreate,
  });
  typia.assert(joined);

  // Baselines before rotation
  const baseId = joined.id;
  const baseEmail = joined.email;
  const baseStatus = joined.status;
  const baseCreatedAt = joined.created_at;
  const baseUpdatedAt = joined.updated_at;

  // 2) Rotate password
  const newPassword: string = RandomGenerator.alphaNumeric(14); // rotate to a new strong password
  const updatedUser = await api.functional.my.auth.user.password.updatePassword(
    connection,
    {
      body: {
        current_password: initialPassword,
        new_password: newPassword,
      } satisfies ITodoMvpUserPassword.IUpdate,
    },
  );
  typia.assert(updatedUser);

  // 3) Business validations
  TestValidator.equals(
    "user id remains the same after password rotation",
    updatedUser.id,
    baseId,
  );
  TestValidator.equals(
    "user email remains unchanged after password rotation",
    updatedUser.email,
    baseEmail,
  );
  TestValidator.equals(
    "user status remains unchanged after password rotation",
    updatedUser.status,
    baseStatus,
  );
  TestValidator.equals(
    "created_at remains unchanged after password rotation",
    updatedUser.created_at,
    baseCreatedAt,
  );

  const prev = new Date(baseUpdatedAt).getTime();
  const next = new Date(updatedUser.updated_at).getTime();
  TestValidator.predicate(
    "updated_at must increase after password rotation",
    next > prev,
  );
}
