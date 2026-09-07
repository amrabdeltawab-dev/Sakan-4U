import { getRuntimeEnvironment, type RuntimeEnvironment } from "../runtimeEnv";

export const PRODUCTION_SERVER_HOST = "0.0.0.0";
export const PRODUCTION_SERVER_PORT_FALLBACK = 8080;
export const DEVELOPMENT_SERVER_PORT_FALLBACK = 3000;

export function resolveServerPort(value: string | undefined): number {
  if (!value) return PRODUCTION_SERVER_PORT_FALLBACK;

  const parsedPort = Number(value);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
    return PRODUCTION_SERVER_PORT_FALLBACK;
  }

  return parsedPort;
}

export function getServerListenConfig(environment: RuntimeEnvironment = getRuntimeEnvironment()) {
  return {
    host: PRODUCTION_SERVER_HOST,
    port: environment.PORT
      ? resolveServerPort(environment.PORT)
      : environment.NODE_ENV === "development"
        ? DEVELOPMENT_SERVER_PORT_FALLBACK
        : PRODUCTION_SERVER_PORT_FALLBACK,
  };
}
