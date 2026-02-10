export const PACKAGE_NAME = "@templar/test-utils" as const;

export { MockChannelAdapter } from "./channel.js";
export {
  createMockNexusClient,
  type MockAgentsResource,
  type MockChannelsResource,
  type MockEventLogResource,
  type MockMemoryResource,
  type MockNexusClient,
  type MockPayResource,
  type MockToolsResource,
} from "./mocks/nexus-client.js";
