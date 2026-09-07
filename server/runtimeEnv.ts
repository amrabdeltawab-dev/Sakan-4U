export type RuntimeEnvironment = Record<string, string | undefined>;

type GlobalRuntime = typeof globalThis & {
  process?: { env?: RuntimeEnvironment };
};

export function getRuntimeEnvironment(): RuntimeEnvironment {
  return (globalThis as GlobalRuntime).process?.["env"] ?? {};
}

export function getRuntimeEnvValue(key: string): string | undefined {
  return getRuntimeEnvironment()[key];
}
