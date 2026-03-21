import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

@Injectable()
export class CertificateStorageService {
  private readonly uploadsRoot = resolve(
    process.env.RENDER_DISK_PATH ??
      process.env.CERTIFICATES_STORAGE_ROOT ??
      join(tmpdir(), 'crm-portal-runtime'),
    'uploads'
  );
  private readonly certificatesRoot = resolve(this.uploadsRoot, 'certificates');
  private readonly legacyUploadsRoot = resolve(process.cwd(), 'uploads');
  private readonly legacyCertificatesRoot = resolve(this.legacyUploadsRoot, 'certificates');

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
    const candidatePaths = this.resolveFileKeyCandidates(fileKey);
    for (const absolutePath of candidatePaths) {
      try {
        await access(absolutePath);
        return absolutePath;
      } catch {
        continue;
      }
    }

    throw new NotFoundException('Certificate file not found in storage.');
  }

  async safeDelete(fileKey: string) {
    const candidatePaths = this.resolveFileKeyCandidates(fileKey);
    for (const absolutePath of candidatePaths) {
      try {
        await unlink(absolutePath);
      } catch {
        continue;
      }
    }
  }

  private resolveFileKeyCandidates(fileKey: string): string[] {
    const normalized = fileKey.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized.startsWith('certificates/')) {
      throw new BadRequestException('Invalid certificate file key.');
    }

    const candidates = [
      resolve(this.uploadsRoot, normalized),
      resolve(this.legacyUploadsRoot, normalized)
    ];

    return candidates.filter((resolvedPath, index, allPaths) => {
      const allowedRoot =
        index === 0 ? this.certificatesRoot : this.legacyCertificatesRoot;
      if (!resolvedPath.startsWith(allowedRoot)) {
        throw new BadRequestException('Certificate file key resolves outside storage root.');
      }

      return allPaths.indexOf(resolvedPath) === index;
    });
  }
}
