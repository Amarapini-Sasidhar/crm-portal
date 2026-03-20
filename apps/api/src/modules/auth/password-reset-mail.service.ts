import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class PasswordResetMailService {
  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetEmail(input: { email: string; firstName: string; resetUrl: string }) {
    const mailFrom = this.configService.get<string>('MAIL_FROM', '').trim();
    const host = this.configService.get<string>('SMTP_HOST', '').trim();
    const user = this.configService.get<string>('SMTP_USER', '').trim();
    const password = this.configService.get<string>('SMTP_PASSWORD', '');
    const port = Number(this.configService.get<number>('SMTP_PORT', 587));
    const secure = this.configService.get<boolean>('SMTP_SECURE', false);

    if (!mailFrom || !host || !user || !password) {
      throw new InternalServerErrorException(
        'Password reset email is not configured. Set SMTP and MAIL_FROM environment variables.'
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass: password
      }
    });

    await transporter.sendMail({
      from: mailFrom,
      to: input.email,
      subject: 'Reset your CRM Portal password',
      text: [
        `Hello ${input.firstName},`,
        '',
        'Use the link below to reset your CRM Portal password:',
        input.resetUrl,
        '',
        'This reset link does not expire and can be reused for your account.',
        '',
        'If you did not request this, you can ignore this email.'
      ].join('\n'),
      html: `
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
          <p>This reset link does not expire and can be reused for your account.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `
    });
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
