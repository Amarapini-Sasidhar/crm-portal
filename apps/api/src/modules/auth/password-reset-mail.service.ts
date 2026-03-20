import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class PasswordResetMailService {
  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetEmail(input: { email: string; firstName: string; resetUrl: string }) {
    const mailFrom = this.configService.get<string>('MAIL_FROM', '').trim();
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID', '').trim();
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET', '').trim();
    const refreshToken = this.configService.get<string>('GOOGLE_REFRESH_TOKEN', '').trim();

    if (!mailFrom || !clientId || !clientSecret || !refreshToken) {
      throw new InternalServerErrorException(
        'Password reset email is not configured. Set Google OAuth mail environment variables and MAIL_FROM.'
      );
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    const gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client
    });

    const rawMessage = this.toBase64Url(
      [
        `From: ${mailFrom}`,
        `To: ${input.email}`,
        'Subject: Reset your CRM Portal password',
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="UTF-8"',
        '',
        `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
            <p>Hello ${this.escapeHtml(input.firstName)},</p>
            <p>Use the button below to reset your CRM Portal password.</p>
            <p>
              <a
                href="${this.escapeHtml(input.resetUrl)}"
                style="display:inline-block;padding:12px 18px;background:#0a6c7f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;"
              >
                Reset Password
              </a>
            </p>
            <p>If the button does not work, open this link:</p>
            <p><a href="${this.escapeHtml(input.resetUrl)}">${this.escapeHtml(input.resetUrl)}</a></p>
            <p>This reset link can be reused for your account.</p>
            <p>If you did not request this, you can ignore this email.</p>
          </div>
        `.trim()
      ].join('\n')
    );

    try {
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawMessage
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send email via Gmail API.';
      throw new InternalServerErrorException(message);
    }
  }

  private toBase64Url(value: string): string {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
