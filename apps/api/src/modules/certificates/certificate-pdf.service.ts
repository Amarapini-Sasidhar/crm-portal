import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');

export type CertificatePdfInput = {
  certificateNo: string;
  studentName: string;
  courseName: string;
  scorePercentage: number;
  passedAt: Date;
  issuedAt: Date;
  trainerName: string;
  qrImage: Buffer;
  verificationUrl: string;
};

@Injectable()
export class CertificatePdfService {
  async generatePdf(input: CertificatePdfInput): Promise<Buffer> {
    const document = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    const chunks: Buffer[] = [];
    const completed = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    document
      .rect(20, 20, 555, 802)
      .lineWidth(3)
      .strokeColor('#1F3B4D')
      .stroke();

    document
      .fontSize(16)
      .fillColor('#4A4A4A')
      .text('CRM EXAM & CERTIFICATION PORTAL', 50, 70, {
        align: 'center'
      });

    document
      .moveDown()
      .fontSize(38)
      .fillColor('#1F3B4D')
      .text('Certificate of Achievement', {
        align: 'center'
      });

    document
      .moveDown(1.2)
      .fontSize(16)
      .fillColor('#333333')
      .text('This certifies that', {
        align: 'center'
      });

    document
      .moveDown(0.5)
      .fontSize(30)
      .fillColor('#111111')
      .text(input.studentName, {
        align: 'center'
      });

    document
      .moveDown(0.8)
      .fontSize(15)
      .fillColor('#333333')
      .text('has successfully completed the certification course', {
        align: 'center'
      });

    document
      .moveDown(0.3)
      .fontSize(20)
      .fillColor('#1F3B4D')
      .text(input.courseName, {
        align: 'center'
      });

    document
      .moveDown(1)
      .fontSize(14)
      .fillColor('#333333')
      .text(`Score: ${input.scorePercentage.toFixed(2)}%`, {
        align: 'center'
      });

    document
      .moveDown(2.2)
      .fontSize(12)
      .fillColor('#111111')
      .text(`Certificate No: ${input.certificateNo}`, 70, 500)
      .text(`Date of Passing: ${this.formatDate(input.passedAt)}`, 70, 525)
      .text(`Issued On: ${this.formatDate(input.issuedAt)}`, 70, 550);

    document
      .fontSize(12)
      .fillColor('#111111')
      .text('Trainer Signature', 380, 560, {
        width: 150,
        align: 'center'
      });

    document
      .moveTo(390, 600)
      .lineTo(530, 600)
      .lineWidth(1)
      .strokeColor('#4A4A4A')
      .stroke();

    document
      .fontSize(11)
      .fillColor('#111111')
      .text(input.trainerName, 390, 605, {
        width: 140,
        align: 'center'
      });

    document.image(input.qrImage, 420, 660, {
      fit: [120, 120]
    });

    document
      .fontSize(9)
      .fillColor('#333333')
      .text('Scan QR to verify certificate', 390, 785, {
        width: 170,
        align: 'center'
      });

    document
      .fontSize(8)
      .fillColor('#666666')
      .text(input.verificationUrl, 60, 790, {
        width: 320
      });

    document.end();
    return completed;
  }

  private formatDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
