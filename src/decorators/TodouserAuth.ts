// File path: src/decorators/TodouserAuth.ts
import { SwaggerCustomizer } from "@nestia/core";
import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { Singleton } from "tstl";

import { todouserAuthorize } from "../providers/authorize/todouserAuthorize";

/**
 * TodouserAuth decorator
 *
 * - Adds Bearer auth requirement to Swagger via SwaggerCustomizer
 * - Injects authenticated TodouserPayload into controller handler parameter
 * - Uses Singleton pattern for efficient decorator instance reuse
 */
export const TodouserAuth =
  (): ParameterDecorator =>
  (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void => {
    // Register Bearer security requirement in Swagger
    SwaggerCustomizer((props) => {
      props.route.security ??= [];
      props.route.security.push({
        bearer: [],
      });
    })(target, propertyKey as string, undefined!);

    // Bind the singleton decorator instance
    singleton.get()(target, propertyKey, parameterIndex);
  };

const singleton = new Singleton(() =>
  createParamDecorator(async (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return todouserAuthorize(request);
  })(),
);
