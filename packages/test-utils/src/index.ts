export const PACKAGE_NAME = "@templar/test-utils" as const;

export { MockChannelAdapter } from "./channel.js";
export {
  createMockResponse,
  type MockCompletionRequest,
  type MockCompletionResponse,
  MockProvider,
  type MockResponseEntry,
  type MockStreamChunk,
} from "./mock-provider.js";
export {
  createMockNexusClient,
  type MockAgentsResource,
  type MockChannelsResource,
  type MockEventLogResource,
  type MockMemoryResource,
  type MockNexusClient,
  type MockPayResource,
  type MockPermissionsResource,
  type MockToolsResource,
} from "./mocks/nexus-client.js";
