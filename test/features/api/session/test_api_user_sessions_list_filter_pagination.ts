import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/ESortDirection";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageITodoAppSession";
import type { ITodoAppSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppSession";
import type { ITodoAppTodoUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUser";
import type { ITodoAppTodoUserLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ITodoAppTodoUserLogin";

export async function test_api_user_sessions_list_filter_pagination(
  connection: api.IConnection,
) {
  // Helper to check descending order by date-time selector
  const isDescBy = (
    rows: ITodoAppSession.ISummary[],
    selector: (r: ITodoAppSession.ISummary) => string,
  ): boolean => {
    return rows.every(
      (r, i) =>
        i === 0 ||
        new Date(selector(r)).getTime() <=
          new Date(selector(rows[i - 1])).getTime(),
    );
  };

  // 1) Join: create user and Session #1
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string & tags.MinLength<8> & tags.MaxLength<64> =
    typia.random<string & tags.MinLength<8> & tags.MaxLength<64>>();

  const joinOutput: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.join(connection, {
      body: { email, password } satisfies ITodoAppTodoUser.ICreate,
    });
  typia.assert(joinOutput);

  // 2) Additional logins: create Session #2 and #3 (latest becomes current)
  const loginReq = { email, password } satisfies ITodoAppTodoUserLogin.IRequest;
  const login2: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.login(connection, { body: loginReq });
  typia.assert(login2);
  const login3: ITodoAppTodoUser.IAuthorized =
    await api.functional.auth.todoUser.login(connection, { body: loginReq });
  typia.assert(login3);

  const userId: string & tags.Format<"uuid"> = login3.id;

  // 3) Revoke other sessions to produce revoked set, keeping current session active
  await api.functional.auth.todoUser.sessions.revokeOthers.revokeOtherSessions(
    connection,
    {
      body: {
        include_current: false,
        reason: RandomGenerator.paragraph({ sentences: 3 }),
      } satisfies ITodoAppSession.IRevokeOthers,
    },
  );

  // Current timestamp for active/expired checks
  const now = Date.now();

  // 4) List ACTIVE sessions with pagination; validate active semantics and default sorting
  const activePage1: IPageITodoAppSession.ISummary =
    await api.functional.todoApp.todoUser.users.sessions.index(connection, {
      userId,
      body: {
        page: 1 satisfies number as number,
        limit: 10 satisfies number as number,
        status: "active",
      } satisfies ITodoAppSession.IRequest,
    });
  typia.assert(activePage1);

  // Validate all returned are active
  activePage1.data.forEach((s, idx) => {
    TestValidator.predicate(
      `active[${idx}] revoked_at must be null/undefined`,
      s.revoked_at === null || s.revoked_at === undefined,
    );
    TestValidator.predicate(
      `active[${idx}] expires_at must be in the future`,
      new Date(s.expires_at).getTime() > now,
    );
  });

  // Validate pagination and default sorting (issued_at desc)
  TestValidator.equals(
    "active: limit should be applied",
    activePage1.pagination.limit,
    10,
  );
  TestValidator.predicate(
    "active: current page should be non-negative",
    activePage1.pagination.current >= 0,
  );
  TestValidator.predicate(
    "active: pages * limit >= records and records >= data.length",
    activePage1.pagination.pages * activePage1.pagination.limit >=
      activePage1.pagination.records &&
      activePage1.pagination.records >= activePage1.data.length,
  );
  TestValidator.predicate(
    "active: default sort by issued_at desc",
    isDescBy(activePage1.data, (r) => r.issued_at),
  );

  // 5) List REVOKED sessions; ensure at least one exists and all are revoked
  const revokedPage: IPageITodoAppSession.ISummary =
    await api.functional.todoApp.todoUser.users.sessions.index(connection, {
      userId,
      body: {
        status: "revoked",
        page: 1 satisfies number as number,
        limit: 50 satisfies number as number,
      } satisfies ITodoAppSession.IRequest,
    });
  typia.assert(revokedPage);

  TestValidator.predicate(
    "revoked: should have at least one revoked session after revocation",
    revokedPage.data.length >= 1,
  );
  revokedPage.data.forEach((s, idx) => {
    TestValidator.predicate(
      `revoked[${idx}] revoked_at must be non-null`,
      s.revoked_at !== null && s.revoked_at !== undefined,
    );
  });
  TestValidator.predicate(
    "revoked: default sort by issued_at desc",
    isDescBy(revokedPage.data, (r) => r.issued_at),
  );

  // 6) Optional client metadata filter validations
  const allPage: IPageITodoAppSession.ISummary =
    await api.functional.todoApp.todoUser.users.sessions.index(connection, {
      userId,
      body: {
        status: "all",
        page: 1 satisfies number as number,
        limit: 50 satisfies number as number,
      } satisfies ITodoAppSession.IRequest,
    });
  typia.assert(allPage);

  // If any session has ip, filter by that exact ip
  const ipSample = allPage.data.find(
    (d) => d.ip !== null && d.ip !== undefined,
  )?.ip;
  if (ipSample !== null && ipSample !== undefined) {
    const ipFilter = ipSample.length > 100 ? ipSample.slice(0, 100) : ipSample;
    const byIp: IPageITodoAppSession.ISummary =
      await api.functional.todoApp.todoUser.users.sessions.index(connection, {
        userId,
        body: {
          status: "all",
          ip: ipFilter,
          page: 1 satisfies number as number,
          limit: 50 satisfies number as number,
        } satisfies ITodoAppSession.IRequest,
      });
    typia.assert(byIp);
    byIp.data.forEach((s, idx) => {
      TestValidator.predicate(
        `ip filter [${idx}] must match`,
        (s.ip ?? "") === ipFilter,
      );
    });
    TestValidator.predicate(
      "ip filter: default sort by issued_at desc",
      isDescBy(byIp.data, (r) => r.issued_at),
    );
  }

  // If any session has user_agent, filter by that exact user_agent
  const uaSample = allPage.data.find(
    (d) => d.user_agent !== null && d.user_agent !== undefined,
  )?.user_agent;
  if (uaSample !== null && uaSample !== undefined) {
    const uaFilter = uaSample.length > 500 ? uaSample.slice(0, 500) : uaSample;
    const byUa: IPageITodoAppSession.ISummary =
      await api.functional.todoApp.todoUser.users.sessions.index(connection, {
        userId,
        body: {
          status: "all",
          user_agent: uaFilter,
          page: 1 satisfies number as number,
          limit: 50 satisfies number as number,
        } satisfies ITodoAppSession.IRequest,
      });
    typia.assert(byUa);
    byUa.data.forEach((s, idx) => {
      TestValidator.predicate(
        `user_agent filter [${idx}] must match`,
        (s.user_agent ?? "") === uaFilter,
      );
    });
    TestValidator.predicate(
      "user_agent filter: default sort by issued_at desc",
      isDescBy(byUa.data, (r) => r.issued_at),
    );
  }

  // 7) Authorization boundary tests
  // 7-1) Other user's sessions must be forbidden
  const otherUserId = typia.random<string & tags.Format<"uuid">>();
  if (otherUserId !== userId) {
    await TestValidator.error(
      "must not list sessions of other users",
      async () => {
        await api.functional.todoApp.todoUser.users.sessions.index(connection, {
          userId: otherUserId,
          body: {
            status: "all",
            page: 1 satisfies number as number,
            limit: 1 satisfies number as number,
          } satisfies ITodoAppSession.IRequest,
        });
      },
    );
  }

  // 7-2) Unauthenticated access must be rejected
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated request must be rejected",
    async () => {
      await api.functional.todoApp.todoUser.users.sessions.index(unauthConn, {
        userId,
        body: {
          status: "all",
          page: 1 satisfies number as number,
          limit: 1 satisfies number as number,
        } satisfies ITodoAppSession.IRequest,
      });
    },
  );
}
