import { describe, it, expect, vi, beforeEach } from 'vitest'
import nodemailer from 'nodemailer'

vi.mock('nodemailer', () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'mock-id' })
  return {
    default: { createTransport: () => ({ sendMail }) },
    __sendMail: sendMail,
  }
})

import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email'

const mockSendMail = (nodemailer as unknown as { createTransport: () => { sendMail: ReturnType<typeof vi.fn> } })
  .createTransport().sendMail

describe('sendVerificationEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendVerificationEmail('user@example.com', 'https://app.meritview.com/verify?token=abc')

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('user@example.com')
    expect(call.subject).toMatch(/verify/i)
  })

  it('includes the verification URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/verify?token=xyz123'
    await sendVerificationEmail('test@example.com', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendVerificationEmail('user@example.com', 'https://example.com/verify')

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendVerificationEmail('fail@example.com', 'https://example.com/verify')).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})

describe('sendPasswordResetEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendPasswordResetEmail('user@example.com', 'https://app.meritview.com/reset?token=abc')

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('user@example.com')
    expect(call.subject).toMatch(/reset/i)
  })

  it('includes the reset URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/reset?token=xyz123'
    await sendPasswordResetEmail('test@example.com', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendPasswordResetEmail('user@example.com', 'https://example.com/reset')

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendPasswordResetEmail('fail@example.com', 'https://example.com/reset')).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})
