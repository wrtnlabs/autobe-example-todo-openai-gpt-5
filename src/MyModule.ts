import { Module } from "@nestjs/common";

import { AuthGuestController } from "./controllers/auth/guest/AuthGuestController";
import { AuthUserController } from "./controllers/auth/user/AuthUserController";
import { MyAuthUserPasswordController } from "./controllers/my/auth/user/password/MyAuthUserPasswordController";
import { MyAuthUserController } from "./controllers/my/auth/user/logout/MyAuthUserController";
import { AuthAdminController } from "./controllers/auth/admin/AuthAdminController";
import { AuthAdminPasswordController } from "./controllers/auth/admin/password/AuthAdminPasswordController";
import { TodomvpUserTodosController } from "./controllers/todoMvp/user/todos/TodomvpUserTodosController";
import { TodomvpAdminAuditeventsController } from "./controllers/todoMvp/admin/auditEvents/TodomvpAdminAuditeventsController";
import { TodomvpAdminComplianceremovalrecordsController } from "./controllers/todoMvp/admin/complianceRemovalRecords/TodomvpAdminComplianceremovalrecordsController";
import { TodomvpUserSessionsController } from "./controllers/todoMvp/user/sessions/TodomvpUserSessionsController";
import { TodomvpUserUsersController } from "./controllers/todoMvp/user/users/TodomvpUserUsersController";
import { TodomvpAdminAdminsController } from "./controllers/todoMvp/admin/admins/TodomvpAdminAdminsController";

@Module({
  controllers: [
    AuthGuestController,
    AuthUserController,
    MyAuthUserPasswordController,
    MyAuthUserController,
    AuthAdminController,
    AuthAdminPasswordController,
    TodomvpUserTodosController,
    TodomvpAdminAuditeventsController,
    TodomvpAdminComplianceremovalrecordsController,
    TodomvpUserSessionsController,
    TodomvpUserUsersController,
    TodomvpAdminAdminsController,
  ],
})
export class MyModule {}
