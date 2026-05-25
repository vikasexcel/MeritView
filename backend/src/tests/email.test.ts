import { describe, it, expect, vi, beforeEach } from 'vitest'
import nodemailer from 'nodemailer'

vi.mock('nodemailer', () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'mock-id' })
  return {
    default: { createTransport: () => ({ sendMail }) },
    __sendMail: sendMail,
  }
})

import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendDisputeConfirmationEmail,
  sendCounterpartyAcceptedEmail,
  sendAnalysisStartedEmail,
  sendOpinionReadyEmail,
} from '../lib/email'

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

describe('sendInvitationEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendInvitationEmail(
      'counterparty@example.com',
      'Bob Smith',
      'Contract Dispute',
      'https://app.meritview.com/invite/abc123'
    )

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('counterparty@example.com')
    expect(call.subject).toMatch(/invited/i)
  })

  it('includes the invite URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/invite/xyz789'
    await sendInvitationEmail('counterparty@example.com', 'Bob Smith', 'Contract Dispute', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendInvitationEmail(
      'counterparty@example.com',
      'Bob Smith',
      'Contract Dispute',
      'https://app.meritview.com/invite/abc'
    )

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendInvitationEmail(
        'fail@example.com',
        'Bob',
        'Dispute',
        'https://example.com/invite/fail'
      )
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})

describe('sendDisputeConfirmationEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendDisputeConfirmationEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1'
    )

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
    expect(call.subject).toMatch(/dispute/i)
  })

  it('includes the dispute URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/disputes/d1'
    await sendDisputeConfirmationEmail('alice@example.com', 'Alice', 'Contract Dispute', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendDisputeConfirmationEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1'
    )

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendDisputeConfirmationEmail(
        'fail@example.com',
        'Alice',
        'Dispute',
        'https://example.com/disputes/fail'
      )
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})

describe('sendCounterpartyAcceptedEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendCounterpartyAcceptedEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1'
    )

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
    expect(call.subject).toMatch(/accepted/i)
  })

  it('includes the dispute URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/disputes/d1'
    await sendCounterpartyAcceptedEmail('alice@example.com', 'Alice', 'Contract Dispute', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendCounterpartyAcceptedEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1'
    )

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendCounterpartyAcceptedEmail(
        'fail@example.com',
        'Alice',
        'Dispute',
        'https://example.com/disputes/fail'
      )
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})

describe('sendAnalysisStartedEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendAnalysisStartedEmail('alice@example.com', 'Alice', 'Contract Dispute')

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
    expect(call.subject).toMatch(/analysis/i)
  })

  it('includes the dispute title in the HTML body', async () => {
    await sendAnalysisStartedEmail('alice@example.com', 'Alice', 'Contract Dispute')

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain('Contract Dispute')
  })

  it('sends a from address', async () => {
    await sendAnalysisStartedEmail('alice@example.com', 'Alice', 'Contract Dispute')

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendAnalysisStartedEmail('fail@example.com', 'Alice', 'Dispute')
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})

describe('sendOpinionReadyEmail', () => {
  beforeEach(() => mockSendMail.mockClear())

  it('calls sendMail with correct to address and subject', async () => {
    await sendOpinionReadyEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1/opinion'
    )

    expect(mockSendMail).toHaveBeenCalledOnce()
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('alice@example.com')
    expect(call.subject).toMatch(/opinion/i)
  })

  it('includes the opinion URL in the HTML body', async () => {
    const url = 'https://app.meritview.com/disputes/d1/opinion'
    await sendOpinionReadyEmail('alice@example.com', 'Alice', 'Contract Dispute', url)

    const call = mockSendMail.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  it('sends a from address', async () => {
    await sendOpinionReadyEmail(
      'alice@example.com',
      'Alice',
      'Contract Dispute',
      'https://app.meritview.com/disputes/d1/opinion'
    )

    const call = mockSendMail.mock.calls[0][0]
    expect(call.from).toBeTruthy()
  })

  it('logs error and does not throw when sendMail throws', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      sendOpinionReadyEmail(
        'fail@example.com',
        'Alice',
        'Dispute',
        'https://example.com/disputes/fail/opinion'
      )
    ).resolves.not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Nodemailer'), expect.anything())

    consoleSpy.mockRestore()
  })
})
