import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MAX_SIZE_BYTES = 50 * 1024; // 50KB
const ALLOWED_MIMETYPES = ['text/plain', 'text/markdown'];
const ALLOWED_EXTENSIONS = ['.txt', '.md'];

@Injectable()
export class FileValidationPipe implements PipeTransform {
  transform(file: Express.Multer.File): Express.Multer.File {
    if (!file) throw new BadRequestException('No file uploaded');

    const ext = this.getExtension(file.originalname);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(`Only .txt and .md files are allowed`);
    }

    if (!ALLOWED_MIMETYPES.includes(file.mimetype) && file.mimetype !== 'application/octet-stream') {
      throw new BadRequestException(`Invalid file type: ${file.mimetype}`);
    }

    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(`File too large. Max size is 50KB`);
    }

    return file;
  }

  private getExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    return idx === -1 ? '' : filename.slice(idx).toLowerCase();
  }
}
