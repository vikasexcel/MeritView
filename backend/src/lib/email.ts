import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.RESEND_FROM_EMAIL ?? 'MeritView <onboarding@resend.dev>'
const APP_NAME = 'MeritView'

export async function sendVerificationEmail(to: string, url: string) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Verify your ${APP_NAME} email address`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">Verify your email</h2>
        <p style="color:#444">Click the button below to verify your email address and activate your ${APP_NAME} account.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0">
          Verify email
        </a>
        <p style="color:#888;font-size:13px">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
      </div>
    `,
  })

  if (error) {
    console.error('[Resend] Failed to send verification email:', error)
  }
}

export async function sendPasswordResetEmail(to: string, url: string) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Reset your ${APP_NAME} password`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">Reset your password</h2>
        <p style="color:#444">We received a request to reset the password for your ${APP_NAME} account.</p>
        <a href="${url}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0">
          Reset password
        </a>
        <p style="color:#888;font-size:13px">This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
      </div>
    `,
  })

  if (error) {
    console.error('[Resend] Failed to send password reset email:', error)
  }
}

export async function sendInvitationEmail(
  to: string,
  toName: string,
  disputeTitle: string,
  inviteUrl: string
) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `You've been invited to resolve a dispute on ${APP_NAME}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">You've been invited to a dispute</h2>
        <p style="color:#444">Hi ${toName},</p>
        <p style="color:#444">You've been invited to participate in a dispute resolution for: <strong>${disputeTitle}</strong></p>
        <p style="color:#444">Click below to view the dispute and decide whether to accept or decline.</p>
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0">
          View Invitation
        </a>
        <p style="color:#888;font-size:13px">This invitation link is unique to you. Do not share it with others.</p>
      </div>
    `,
  })

  if (error) {
    console.error('[Resend] Failed to send invitation email:', error)
  }
}
