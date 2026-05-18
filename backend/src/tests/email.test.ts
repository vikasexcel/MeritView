import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('resend', () => {
  const send = vi.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null })
  class MockResend {
    emails = { send }
    constructor(_apiKey?: string) {}
  }
  return { Resend: MockResend, __mockSend: send }
})

import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email'

// Access the shared mock send fn through the module mock
const resendMod = await vi.importMock<{ __mockSend: ReturnType<typeof vi.fn> }>('resend')
const mockSend = resendMod.__mockSend

describe('sendVerificationEmail', () => {
  beforeEach(() => mockSend.mockClear())

  it('calls Resend with correct to address and subject', async () => {
    await sendVerificationEmail('user@example.com', 'https://app.meritview.com/verify?token=abc')

    expect(mockSend).toHaveBeenCalledOnce()
    const call = mockSend.mock.calls[0][0]
    expect(call.to).toBe('user@example.com')
    expect(call.subject).toMatch(/verify/i)
  })

  it('includes the verification URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/verify?token=xyz123'
    await sendVerificationEmail('test@example.com', url)

    const call = mockSend.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendVerificationEmail('user@example.com', 'https://example.com/verify')

    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when Resend returns an error', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'API error' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendVerificationEmail('fail@example.com', 'https://example.com/verify')).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resend'), expect.anything())

    consoleSpy.mockRestore()
  })
})

describe('sendPasswordResetEmail', () => {
  beforeEach(() => mockSend.mockClear())

  it('calls Resend with correct to address and subject', async () => {
    await sendPasswordResetEmail('user@example.com', 'https://app.meritview.com/reset?token=abc')

    expect(mockSend).toHaveBeenCalledOnce()
    const call = mockSend.mock.calls[0][0]
    expect(call.to).toBe('user@example.com')
    expect(call.subject).toMatch(/reset/i)
  })

  it('includes the reset URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/reset?token=xyz123'
    await sendPasswordResetEmail('test@example.com', url)

    const call = mockSend.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendPasswordResetEmail('user@example.com', 'https://example.com/reset')

    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when Resend returns an error', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'API error' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendPasswordResetEmail('fail@example.com', 'https://example.com/reset')).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Resend'), expect.anything())

    consoleSpy.mockRestore()
  })
})
