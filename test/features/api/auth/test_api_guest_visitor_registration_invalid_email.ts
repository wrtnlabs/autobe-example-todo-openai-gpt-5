import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppGuestVisitor";

export async function test_api_guest_visitor_registration_invalid_email(
  connection: api.IConnection,
) {
  // Note: The DTO enforces `email` to be string & tags.Format<"email">.
  // Intentionally malformed emails cannot be constructed without breaking
  // type safety (which is prohibited). Therefore, we validate the join
  // operation with: (A) no email (null), and (B) a valid email, and
  // verify privacy-preserving minimal response and token issuance.

  // A) Join without email (explicit null) — should succeed
  const joinWithoutEmailBody = {
    email: null,
  } satisfies ITodoAppGuestVisitor.IJoin;
  const authorized1 = await api.functional.auth.guestVisitor.join(connection, {
    body: joinWithoutEmailBody,
  });
  // Type and strict structure assertions (no superfluous properties)
  typia.assert(authorized1);
  typia.assertEquals<ITodoAppGuestVisitor.IAuthorized>(authorized1);

  // Business assertions — tokens should be non-empty strings
  TestValidator.predicate(
    "first join: access token must be non-empty",
    authorized1.token.access.length > 0,
  );
  TestValidator.predicate(
    "first join: refresh token must be non-empty",
    authorized1.token.refresh.length > 0,
  );

  // B) Join with a valid email — should succeed
  const validEmail = typia.random<string & tags.Format<"email">>();
  const joinWithEmailBody = {
    email: validEmail,
  } satisfies ITodoAppGuestVisitor.IJoin;
  const authorized2 = await api.functional.auth.guestVisitor.join(connection, {
    body: joinWithEmailBody,
  });
  typia.assert(authorized2);
  typia.assertEquals<ITodoAppGuestVisitor.IAuthorized>(authorized2);

  TestValidator.predicate(
    "second join: access token must be non-empty",
    authorized2.token.access.length > 0,
  );
  TestValidator.predicate(
    "second join: refresh token must be non-empty",
    authorized2.token.refresh.length > 0,
  );
}
