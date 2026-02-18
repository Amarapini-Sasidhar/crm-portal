import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

@Injectable()
export class CertificateStorageService {
  private readonly uploadsRoot = resolve(process.cwd(), 'uploads');
  private readonly certificatesRoot = resolve(this.uploadsRoot, 'certificates');

  async saveCertificatePdf(certificateNo: string, pdfBuffer: Buffer) {
    await mkdir(this.certificatesRoot, { recursive: true });

    const safeCertificateNo = certificateNo.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
    const fileName = `${safeCertificateNo}-${randomUUID()}.pdf`;
    const absolutePath = join(this.certificatesRoot, fileName);

    await writeFile(absolutePath, pdfBuffer);

    return {
      fileKey: `certificates/${fileName}`,
      absolutePath
    };
  }

  async getReadablePath(fileKey: string): Promise<string> {
    const absolutePath = this.resolveFileKey(fileKey);
    try {
      await access(absolutePath);
      return absolutePath;
    } catch {
      throw new NotFoundException('Certificate file not found in storage.');
    }
  }

  async safeDelete(fileKey: string) {
    const absolutePath = this.resolveFileKey(fileKey);
    try {
      await unlink(absolutePath);
    } catch {
      return;
    }
  }

  private resolveFileKey(fileKey: string): string {
    const normalized = fileKey.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized.startsWith('certificates/')) {
      throw new BadRequestException('Invalid certificate file key.');
    }

    const resolved = resolve(this.uploadsRoot, normalized);
    if (!resolved.startsWith(this.certificatesRoot)) {
      throw new BadRequestException('Certificate file key resolves outside storage root.');
    }

    return resolved;
  }
}
