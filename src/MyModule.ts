import { Module } from "@nestjs/common";

import { AuthGuestvisitorController } from "./controllers/auth/guestVisitor/AuthGuestvisitorController";
import { AuthGuestvisitorPasswordResetRequestController } from "./controllers/auth/guestVisitor/password/reset/request/AuthGuestvisitorPasswordResetRequestController";
import { AuthGuestvisitorPasswordResetConfirmController } from "./controllers/auth/guestVisitor/password/reset/confirm/AuthGuestvisitorPasswordResetConfirmController";
import { AuthGuestvisitorEmailVerifyController } from "./controllers/auth/guestVisitor/email/verify/AuthGuestvisitorEmailVerifyController";
import { AuthGuestvisitorEmailVerifyResendController } from "./controllers/auth/guestVisitor/email/verify/resend/AuthGuestvisitorEmailVerifyResendController";
import { AuthTodouserController } from "./controllers/auth/todoUser/AuthTodouserController";
import { AuthTodouserEmailVerifyController } from "./controllers/auth/todoUser/email/verify/AuthTodouserEmailVerifyController";
import { AuthTodouserPasswordResetRequestController } from "./controllers/auth/todoUser/password/reset/request/AuthTodouserPasswordResetRequestController";
import { AuthTodouserPasswordResetConfirmController } from "./controllers/auth/todoUser/password/reset/confirm/AuthTodouserPasswordResetConfirmController";
import { AuthTodouserPasswordChangeController } from "./controllers/auth/todoUser/password/change/AuthTodouserPasswordChangeController";
import { AuthTodouserSessionsRevokeothersController } from "./controllers/auth/todoUser/sessions/revokeOthers/AuthTodouserSessionsRevokeothersController";
import { AuthSystemadminController } from "./controllers/auth/systemAdmin/AuthSystemadminController";
import { AuthSystemadminEmailVerifyController } from "./controllers/auth/systemAdmin/email/verify/AuthSystemadminEmailVerifyController";
import { AuthSystemadminEmailVerifyResendController } from "./controllers/auth/systemAdmin/email/verify/resend/AuthSystemadminEmailVerifyResendController";
import { AuthSystemadminPasswordResetRequestController } from "./controllers/auth/systemAdmin/password/reset/request/AuthSystemadminPasswordResetRequestController";
import { AuthSystemadminPasswordResetConfirmController } from "./controllers/auth/systemAdmin/password/reset/confirm/AuthSystemadminPasswordResetConfirmController";
import { MyAuthSystemadminPasswordController } from "./controllers/my/auth/systemAdmin/password/MyAuthSystemadminPasswordController";
import { MyAuthSystemadminSessionsRevokeController } from "./controllers/my/auth/systemAdmin/sessions/revoke/MyAuthSystemadminSessionsRevokeController";
import { MyAuthSystemadminController } from "./controllers/my/auth/systemAdmin/logout/MyAuthSystemadminController";
import { TodoappTodouserTodosController } from "./controllers/todoApp/todoUser/todos/TodoappTodouserTodosController";
import { TodoappTodouserTodosActivitiesController } from "./controllers/todoApp/todoUser/todos/activities/TodoappTodouserTodosActivitiesController";
import { TodoappTodouserTodosDeletioneventsController } from "./controllers/todoApp/todoUser/todos/deletionEvents/TodoappTodouserTodosDeletioneventsController";
import { TodoappSystemadminServicepoliciesController } from "./controllers/todoApp/systemAdmin/servicePolicies/TodoappSystemadminServicepoliciesController";
import { TodoappSystemadminServicepoliciesServiceconfigurationsController } from "./controllers/todoApp/systemAdmin/servicePolicies/serviceConfigurations/TodoappSystemadminServicepoliciesServiceconfigurationsController";
import { TodoappSystemadminServicepoliciesFeatureflagsController } from "./controllers/todoApp/systemAdmin/servicePolicies/featureFlags/TodoappSystemadminServicepoliciesFeatureflagsController";
import { TodoappSystemadminServiceconfigurationsController } from "./controllers/todoApp/systemAdmin/serviceConfigurations/TodoappSystemadminServiceconfigurationsController";
import { TodoappSystemadminFeatureflagsController } from "./controllers/todoApp/systemAdmin/featureFlags/TodoappSystemadminFeatureflagsController";
import { TodoappSystemadminUsersController } from "./controllers/todoApp/systemAdmin/users/TodoappSystemadminUsersController";
import { TodoappTodouserUsersProfileController } from "./controllers/todoApp/todoUser/users/profile/TodoappTodouserUsersProfileController";
import { TodoappTodouserUsersPreferencesController } from "./controllers/todoApp/todoUser/users/preferences/TodoappTodouserUsersPreferencesController";
import { TodoappSystemadminUsersGuestvisitorsController } from "./controllers/todoApp/systemAdmin/users/guestVisitors/TodoappSystemadminUsersGuestvisitorsController";
import { TodoappSystemadminUsersTodousersController } from "./controllers/todoApp/systemAdmin/users/todoUsers/TodoappSystemadminUsersTodousersController";
import { TodoappSystemadminUsersSystemadminsController } from "./controllers/todoApp/systemAdmin/users/systemAdmins/TodoappSystemadminUsersSystemadminsController";
import { TodoappTodouserDataexportsController } from "./controllers/todoApp/todoUser/dataExports/TodoappTodouserDataexportsController";
import { TodoappTodouserAccountdeletionrequestsController } from "./controllers/todoApp/todoUser/accountDeletionRequests/TodoappTodouserAccountdeletionrequestsController";
import { TodoappTodouserPrivacyconsentsController } from "./controllers/todoApp/todoUser/privacyConsents/TodoappTodouserPrivacyconsentsController";
import { TodoappTodouserUsersSessionsController } from "./controllers/todoApp/todoUser/users/sessions/TodoappTodouserUsersSessionsController";
import { TodoappTodouserSessionsRevocationController } from "./controllers/todoApp/todoUser/sessions/revocation/TodoappTodouserSessionsRevocationController";
import { TodoappTodouserSessionsRefreshtokensController } from "./controllers/todoApp/todoUser/sessions/refreshTokens/TodoappTodouserSessionsRefreshtokensController";
import { TodoappTodouserUsersLoginattemptsController } from "./controllers/todoApp/todoUser/users/loginAttempts/TodoappTodouserUsersLoginattemptsController";
import { TodoappTodouserUsersEmailverificationsController } from "./controllers/todoApp/todoUser/users/emailVerifications/TodoappTodouserUsersEmailverificationsController";
import { TodoappTodouserUsersPasswordresetsController } from "./controllers/todoApp/todoUser/users/passwordResets/TodoappTodouserUsersPasswordresetsController";
import { TodoappTodouserUsersDataexportsController } from "./controllers/todoApp/todoUser/users/dataExports/TodoappTodouserUsersDataexportsController";
import { TodoappTodouserUsersAccountdeletionrequestsController } from "./controllers/todoApp/todoUser/users/accountDeletionRequests/TodoappTodouserUsersAccountdeletionrequestsController";
import { TodoappTodouserUsersPrivacyconsentsController } from "./controllers/todoApp/todoUser/users/privacyConsents/TodoappTodouserUsersPrivacyconsentsController";
import { TodoappSystemadminRatelimitsController } from "./controllers/todoApp/systemAdmin/rateLimits/TodoappSystemadminRatelimitsController";
import { TodoappSystemadminEventtypesController } from "./controllers/todoApp/systemAdmin/eventTypes/TodoappSystemadminEventtypesController";
import { TodoappSystemadminBusinesseventsController } from "./controllers/todoApp/systemAdmin/businessEvents/TodoappSystemadminBusinesseventsController";
import { TodoappSystemadminEventcountersdailyController } from "./controllers/todoApp/systemAdmin/eventCountersDaily/TodoappSystemadminEventcountersdailyController";
import { TodoappSystemadminAuditlogsController } from "./controllers/todoApp/systemAdmin/auditLogs/TodoappSystemadminAuditlogsController";
import { TodoappSystemadminAdminactionsController } from "./controllers/todoApp/systemAdmin/adminActions/TodoappSystemadminAdminactionsController";
import { TodoappSystemadminAccountstatuschangesController } from "./controllers/todoApp/systemAdmin/accountStatusChanges/TodoappSystemadminAccountstatuschangesController";
import { TodoappSystemadminAggregatedmetricsController } from "./controllers/todoApp/systemAdmin/aggregatedMetrics/TodoappSystemadminAggregatedmetricsController";
import { TodoappSystemadminDailystatsController } from "./controllers/todoApp/systemAdmin/dailyStats/TodoappSystemadminDailystatsController";
import { TodoappSystemadminKpicountersController } from "./controllers/todoApp/systemAdmin/kpiCounters/TodoappSystemadminKpicountersController";
import { TodoappSystemadminUsersAuditlogsController } from "./controllers/todoApp/systemAdmin/users/auditLogs/TodoappSystemadminUsersAuditlogsController";
import { TodoappSystemadminUsersAdminactionsController } from "./controllers/todoApp/systemAdmin/users/adminActions/TodoappSystemadminUsersAdminactionsController";
import { TodoappSystemadminUsersAccountstatuschangesController } from "./controllers/todoApp/systemAdmin/users/accountStatusChanges/TodoappSystemadminUsersAccountstatuschangesController";
import { TodoappSystemadminUserratecountersController } from "./controllers/todoApp/systemAdmin/userRateCounters/TodoappSystemadminUserratecountersController";
import { TodoappSystemadminRatelimitsUserratecountersController } from "./controllers/todoApp/systemAdmin/rateLimits/userRateCounters/TodoappSystemadminRatelimitsUserratecountersController";
import { TodoappSystemadminIpratecountersController } from "./controllers/todoApp/systemAdmin/ipRateCounters/TodoappSystemadminIpratecountersController";
import { TodoappSystemadminRatelimitsIpratecountersController } from "./controllers/todoApp/systemAdmin/rateLimits/ipRateCounters/TodoappSystemadminRatelimitsIpratecountersController";

@Module({
  controllers: [
    AuthGuestvisitorController,
    AuthGuestvisitorPasswordResetRequestController,
    AuthGuestvisitorPasswordResetConfirmController,
    AuthGuestvisitorEmailVerifyController,
    AuthGuestvisitorEmailVerifyResendController,
    AuthTodouserController,
    AuthTodouserEmailVerifyController,
    AuthTodouserPasswordResetRequestController,
    AuthTodouserPasswordResetConfirmController,
    AuthTodouserPasswordChangeController,
    AuthTodouserSessionsRevokeothersController,
    AuthSystemadminController,
    AuthSystemadminEmailVerifyController,
    AuthSystemadminEmailVerifyResendController,
    AuthSystemadminPasswordResetRequestController,
    AuthSystemadminPasswordResetConfirmController,
    MyAuthSystemadminPasswordController,
    MyAuthSystemadminSessionsRevokeController,
    MyAuthSystemadminController,
    TodoappTodouserTodosController,
    TodoappTodouserTodosActivitiesController,
    TodoappTodouserTodosDeletioneventsController,
    TodoappSystemadminServicepoliciesController,
    TodoappSystemadminServicepoliciesServiceconfigurationsController,
    TodoappSystemadminServicepoliciesFeatureflagsController,
    TodoappSystemadminServiceconfigurationsController,
    TodoappSystemadminFeatureflagsController,
    TodoappSystemadminUsersController,
    TodoappTodouserUsersProfileController,
    TodoappTodouserUsersPreferencesController,
    TodoappSystemadminUsersGuestvisitorsController,
    TodoappSystemadminUsersTodousersController,
    TodoappSystemadminUsersSystemadminsController,
    TodoappTodouserDataexportsController,
    TodoappTodouserAccountdeletionrequestsController,
    TodoappTodouserPrivacyconsentsController,
    TodoappTodouserUsersSessionsController,
    TodoappTodouserSessionsRevocationController,
    TodoappTodouserSessionsRefreshtokensController,
    TodoappTodouserUsersLoginattemptsController,
    TodoappTodouserUsersEmailverificationsController,
    TodoappTodouserUsersPasswordresetsController,
    TodoappTodouserUsersDataexportsController,
    TodoappTodouserUsersAccountdeletionrequestsController,
    TodoappTodouserUsersPrivacyconsentsController,
    TodoappSystemadminRatelimitsController,
    TodoappSystemadminEventtypesController,
    TodoappSystemadminBusinesseventsController,
    TodoappSystemadminEventcountersdailyController,
    TodoappSystemadminAuditlogsController,
    TodoappSystemadminAdminactionsController,
    TodoappSystemadminAccountstatuschangesController,
    TodoappSystemadminAggregatedmetricsController,
    TodoappSystemadminDailystatsController,
    TodoappSystemadminKpicountersController,
    TodoappSystemadminUsersAuditlogsController,
    TodoappSystemadminUsersAdminactionsController,
    TodoappSystemadminUsersAccountstatuschangesController,
    TodoappSystemadminUserratecountersController,
    TodoappSystemadminRatelimitsUserratecountersController,
    TodoappSystemadminIpratecountersController,
    TodoappSystemadminRatelimitsIpratecountersController,
  ],
})
export class MyModule {}
