import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { buildOpenApiDocument } from "../docs/openapi.js";

export interface ApiDocsPluginOptions {
  config: Config;
}

/**
 * Swagger UI at /v1/docs, and the spec at /v1/docs/json and /v1/docs/yaml.
 * Under /v1 so the dashboards' Vite proxy serves it too. Static mode: the spec
 * is written in docs/openapi.ts rather than generated from route schemas,
 * because a Fastify response schema drops any field it doesn't list and a body
 * schema changes validation errors, neither of which docs should be able to do.
 */
export async function apiDocsPlugin(app: FastifyInstance, options: ApiDocsPluginOptions): Promise<void> {
  const { config } = options;
  if (!config.apiDocsEnabled) return;

  await app.register(swagger, {
    mode: "static",
    specification: {
      document: buildOpenApiDocument({ includeInternal: config.apiDocsIncludeInternal }) as never,
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/v1/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      persistAuthorization: false,
      tryItOutEnabled: false,
    },
  });
}
