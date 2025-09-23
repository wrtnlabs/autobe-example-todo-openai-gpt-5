import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";

/**
 * Verify that reusing a rotated refresh token is rejected while the next token
 * in the chain works.
 *
 * Business context:
 *
 * - A guestVisitor joins to obtain initial credentials (R1).
 * - Using R1 to refresh must rotate the refresh token to R2 and invalidate R1 for
 *   further use.
 * - Any subsequent attempt to use R1 again must fail.
 * - Using R2 should succeed (issuing R3), proving the rotation chain works.
 *
 * Steps:
 *
 * 1. POST /auth/guestVisitor/join -> obtain authorized payload with token.refresh
 *    (R1)
 * 2. POST /auth/guestVisitor/refresh with R1 -> obtain new authorized payload with
 *    token.refresh (R2)
 * 3. POST /auth/guestVisitor/refresh with R1 again -> expect failure (single-use
 *    enforcement)
 * 4. POST /auth/guestVisitor/refresh with R2 -> obtain R3 and validate subject id
 *    stability and token rotation
 */
export async function test_api_guest_visitor_refresh_rotated_token_reuse_rejected(
  connection: api.IConnection,
) {
  // 1) Join as guestVisitor to provision initial refresh token (R1)
  const email = typia.random<string & tags.Format<"email">>();
  const joinBody = { email } satisfies ITodoAppGuestVisitor.IJoin;
  const joined: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, { body: joinBody });
  typia.assert(joined);

  const r1: string = joined.token.refresh;
  const subjectId: string = joined.id;

  // 2) First refresh using R1 -> should rotate to R2
  const refreshBodyR1 = {
    refresh_token: r1,
  } satisfies ITodoAppGuestVisitor.IRefreshRequest;
  const refreshed1: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.refresh(connection, {
      body: refreshBodyR1,
    });
  typia.assert(refreshed1);

  const r2: string = refreshed1.token.refresh;
  TestValidator.notEquals(
    "refresh token is rotated: R2 must differ from R1",
    r2,
    r1,
  );
  TestValidator.equals(
    "subject id remains stable after first refresh",
    refreshed1.id,
    subjectId,
  );

  // 3) Reusing rotated token R1 must be rejected
  await TestValidator.error(
    "reusing a rotated refresh token (R1) is rejected",
    async () => {
      const refreshBodyR1Again = {
        refresh_token: r1,
      } satisfies ITodoAppGuestVisitor.IRefreshRequest;
      await api.functional.auth.guestVisitor.refresh(connection, {
        body: refreshBodyR1Again,
      });
    },
  );

  // 4) Using the current token R2 should succeed and yield R3
  const refreshBodyR2 = {
    refresh_token: r2,
  } satisfies ITodoAppGuestVisitor.IRefreshRequest;
  const refreshed2: ITodoAppGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.refresh(connection, {
      body: refreshBodyR2,
    });
  typia.assert(refreshed2);

  const r3: string = refreshed2.token.refresh;
  TestValidator.notEquals(
    "second rotation produces a new refresh token (R3 != R2)",
    r3,
    r2,
  );
  TestValidator.equals(
    "subject id remains stable after second refresh",
    refreshed2.id,
    subjectId,
  );
}
