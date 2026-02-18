import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { Public } from '../../common/decorators/public.decorator';
import { CertificatesService } from './certificates.service';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Public()
  @Get('verify/:certificateNo')
  verifyCertificate(
    @Param('certificateNo') certificateNo: string,
    @Query('token') verificationToken?: string
  ) {
    return this.certificatesService.verifyCertificate(certificateNo, verificationToken);
  }

  @Public()
  @Get('verify/:certificateNo/page')
  async verificationPage(
    @Param('certificateNo') certificateNo: string,
    @Query('token') verificationToken: string | undefined,
    @Res() response: FastifyReply
  ) {
    const result = await this.certificatesService.verifyCertificate(certificateNo, verificationToken);
    const html = this.renderVerificationHtml(result);
    response.type('text/html; charset=utf-8').send(html);
  }

  private renderVerificationHtml(result: {
    valid: boolean;
    status: string;
    certificateNumber: string;
    studentName?: string | null;
    course?: string | null;
    issueDate?: string | null;
    message?: string;
  }) {
    const statusColor = result.valid ? '#0f766e' : '#b91c1c';
    const statusText = result.valid ? 'Valid Certificate' : result.message ?? 'Invalid Certificate';
    const studentValue = result.studentName ?? '-';
    const courseValue = result.course ?? '-';
    const issueDateValue = result.issueDate ?? '-';

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Certificate Verification</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f4f7fb; margin: 0; padding: 24px; }
      .card { max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #d6dee8; border-radius: 12px; padding: 24px; }
      .title { font-size: 22px; margin: 0 0 18px; color: #1f2937; }
      .status { display: inline-block; padding: 8px 12px; border-radius: 8px; color: #ffffff; font-weight: 700; background: ${statusColor}; margin-bottom: 16px; }
      .row { margin: 10px 0; color: #111827; }
      .label { font-weight: 700; color: #374151; }
    </style>
  </head>
  <body>
    <section class="card">
      <h1 class="title">Certificate Verification</h1>
      <div class="status">${this.escapeHtml(statusText)}</div>
      <p class="row"><span class="label">Student Name:</span> ${this.escapeHtml(studentValue)}</p>
      <p class="row"><span class="label">Course:</span> ${this.escapeHtml(courseValue)}</p>
      <p class="row"><span class="label">Certificate Number:</span> ${this.escapeHtml(result.certificateNumber)}</p>
      <p class="row"><span class="label">Issue Date:</span> ${this.escapeHtml(issueDateValue)}</p>
    </section>
  </body>
</html>`;
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
