import { vi } from "vitest";

/**
 * Mock nodemailer transporter for testing.
 */
export interface MockTransporter {
  sendMail: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  isIdle: ReturnType<typeof vi.fn>;
}

export function createMockTransporter(): MockTransporter {
  return {
    sendMail: vi.fn().mockResolvedValue({
      messageId: "<sent-1@test.com>",
      accepted: ["recipient@test.com"],
      rejected: [],
    }),
    close: vi.fn(),
    verify: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    isIdle: vi.fn().mockReturnValue(true),
  };
}
