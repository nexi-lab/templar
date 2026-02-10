export const PACKAGE_NAME = "@templar/test-utils" as const;

export {
  createMockNexusClient,
  type MockAgentsResource,
  type MockChannelsResource,
  type MockMemoryResource,
  type MockNexusClient,
  type MockPayResource,
  type MockToolsResource,
} from "./mocks/nexus-client.js";

export { MockChannelAdapter } from "./channel.js";
