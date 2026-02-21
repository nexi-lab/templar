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
  type MockAceResource,
  type MockAgentsResource,
  type MockArtifactsResource,
  type MockChannelsResource,
  type MockConsolidationResource,
  type MockCurationResource,
  type MockEventLogResource,
  type MockFeedbackResource,
  type MockMemoryResource,
  type MockNexusClient,
  type MockPairingResource,
  type MockPayResource,
  type MockPermissionsResource,
  type MockPlaybooksResource,
  type MockReflectionResource,
  type MockToolsResource,
  type MockTrajectoriesResource,
} from "./mocks/nexus-client.js";
export { TestObservationExtractor, TestObservationReflector } from "./observational.js";
