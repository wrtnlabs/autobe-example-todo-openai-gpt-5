import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ITodoAppEventType } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppEventType";
import type { ITodoAppSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdmin";
import type { ITodoAppSystemAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSystemAdminJoin";

export async function test_api_event_type_detail_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Admin Registration (setup)
  const adminAuth = await api.functional.auth.systemAdmin.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
      // Optional client context (kept explicit for clarity)
      ip: undefined,
      user_agent: undefined,
    } satisfies ITodoAppSystemAdminJoin.ICreate,
  });
  typia.assert(adminAuth);

  // 2) Create Event Type (setup)
  const created = await api.functional.todoApp.systemAdmin.eventTypes.create(
    connection,
    {
      body: {
        code: `todo.${RandomGenerator.alphaNumeric(8)}`,
        name: RandomGenerator.paragraph({ sentences: 3 }),
        description: RandomGenerator.paragraph({ sentences: 8 }),
        active: true,
      } satisfies ITodoAppEventType.ICreate,
    },
  );
  typia.assert(created);

  // 3) Control Read with Authentication (sanity check)
  const fetched = await api.functional.todoApp.systemAdmin.eventTypes.at(
    connection,
    { eventTypeId: created.id },
  );
  typia.assert(fetched);
  TestValidator.equals(
    "authorized GET should return the created record",
    fetched.id,
    created.id,
  );

  // 4) Unauthorized Access Attempt: create an unauthenticated connection
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  await TestValidator.error(
    "unauthenticated access must be rejected",
    async () => {
      await api.functional.todoApp.systemAdmin.eventTypes.at(unauthConn, {
        eventTypeId: created.id,
      });
    },
  );
}
