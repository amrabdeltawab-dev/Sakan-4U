import { describe, expect, it } from "vitest";
import { DEVELOPMENT_SERVER_PORT_FALLBACK, getServerListenConfig, PRODUCTION_SERVER_HOST, PRODUCTION_SERVER_PORT_FALLBACK, resolveServerPort } from "./serverConfig";

describe("production server listen configuration", () => {
  it("uses the deployment-safe host and 8080 fallback when PORT is absent", () => {
    expect(getServerListenConfig({})).toEqual({
      host: PRODUCTION_SERVER_HOST,
      port: PRODUCTION_SERVER_PORT_FALLBACK,
    });
  });

  it("uses a valid deployment-provided PORT without scanning for another port", () => {
    expect(getServerListenConfig({ PORT: "4578" })).toEqual({
      host: "0.0.0.0",
      port: 4578,
    });
  });

  it("keeps the managed local development listener on port 3000 when PORT is absent", () => {
    expect(getServerListenConfig({ NODE_ENV: "development" })).toEqual({
      host: PRODUCTION_SERVER_HOST,
      port: DEVELOPMENT_SERVER_PORT_FALLBACK,
    });
  });

  it("falls back safely when PORT is not a valid TCP port", () => {
    expect(resolveServerPort("not-a-port")).toBe(PRODUCTION_SERVER_PORT_FALLBACK);
    expect(resolveServerPort("0")).toBe(PRODUCTION_SERVER_PORT_FALLBACK);
    expect(resolveServerPort("65536")).toBe(PRODUCTION_SERVER_PORT_FALLBACK);
  });
});
