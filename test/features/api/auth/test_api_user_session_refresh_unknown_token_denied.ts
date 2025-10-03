import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IEAccountStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IEAccountStatus";
import type { ITodoMvpUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUser";
import type { ITodoMvpUserRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoMvpUserRefresh";

/**
 * Deny refresh on unknown refresh token.
 *
 * Purpose:
 *
 * - Ensure POST /auth/user/refresh rejects a syntactically valid but unknown
 *   refresh token that is not tied to any active session.
 *
 * Steps:
 *
 * 1. Join a new user (baseline context). We will NOT use its token bundle.
 * 2. Generate a random string as a well-formed (schema-valid) but unknown refresh
 *    token.
 * 3. Call refresh with that token and assert the call fails (business auth
 *    failure).
 *
 * Notes:
 *
 * - We only assert that an error occurs; we do not check specific HTTP status
 *   codes or inspect error messages.
 * - We never manipulate connection.headers; SDK manages authentication headers.
 */
export async function test_api_user_session_refresh_unknown_token_denied(
  connection: api.IConnection,
) {
  // 1) Establish baseline user via join (do not use issued tokens afterward)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ITodoMvpUser.ICreate;
  const authorized = await api.functional.auth.user.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Prepare a syntactically valid but unknown refresh token
  const unknownToken: string = `rf_${RandomGenerator.alphaNumeric(48)}`;

  // 3) Attempt refresh with the unknown token and expect failure
  await TestValidator.error(
    "refresh must be denied for unknown refresh token",
    async () => {
      await api.functional.auth.user.refresh(connection, {
        body: {
          refresh_token: unknownToken,
        } satisfies ITodoMvpUserRefresh.IRequest,
      });
    },
  );
}
