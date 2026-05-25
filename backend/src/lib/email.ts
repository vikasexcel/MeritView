import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const FROM = process.env.SMTP_FROM ?? `MeritView <${process.env.SMTP_USER}>`
const APP_NAME = 'MeritView'

export async function sendVerificationEmail(to: string, url: string) {
  try {
    await transporter.sendMail({
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
  } catch (error) {
    console.error('[Nodemailer] Failed to send verification email:', error)
  }
}

export async function sendPasswordResetEmail(to: string, url: string) {
  try {
    await transporter.sendMail({
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
  } catch (error) {
    console.error('[Nodemailer] Failed to send password reset email:', error)
  }
}

export async function sendInvitationEmail(
  to: string,
  toName: string,
  disputeTitle: string,
  inviteUrl: string
) {
  try {
    await transporter.sendMail({
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
  } catch (error) {
    console.error('[Nodemailer] Failed to send invitation email:', error)
  }
}

export async function sendDisputeConfirmationEmail(
  to: string,
  name: string,
  disputeTitle: string,
  disputeUrl: string
) {
  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `Your dispute has been filed on ${APP_NAME}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1a1a1a">Dispute filed</h2>
          <p style="color:#444">Hi ${name},</p>
          <p style="color:#444">Your dispute <strong>${disputeTitle}</strong> has been filed on ${APP_NAME}. We've sent an invitation to the other party — you'll be notified when they respond.</p>
          <a href="${disputeUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0">
            View Dispute
          </a>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Nodemailer] Failed to send dispute confirmation email:', error)
  }
}
