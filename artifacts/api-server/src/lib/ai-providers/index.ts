import { readAiProviderManagerConfig } from "./config";
import { AiProviderManager } from "./manager";
import { PollinationsProvider } from "./pollinations-provider";

export { readAiProviderManagerConfig } from "./config";
export { AiProviderManager } from "./manager";
export { PollinationsProvider } from "./pollinations-provider";
export * from "./types";

export const createAiProviderManager = (): AiProviderManager =>
  new AiProviderManager(
    [new PollinationsProvider()],
    readAiProviderManagerConfig(),
  );
