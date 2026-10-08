import type { CreateCvResponse, Cv, CvSummary, SaveCvResponse } from '@cv-builder/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session';
import { ApiException } from '../common/api.exception';
import { pdfFileName, renderCvPdf } from '../pdf/cv-pdf';
import { cvDocumentSchema, describeIssues } from './cv-document.schema';
import { type CvSourceInput, CvsService } from './cvs.service';
import { CreateCvDto } from './dto/create-cv.dto';
import { SaveCvDto } from './dto/save-cv.dto';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { SourceUploadInterceptor } from './source-upload.interceptor';

/** A malformed identifier names no CV, so it gets the same answer as an unknown one. */
const CvId = () =>
  Param('id', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('CV not found') }));

const invalidSource = (message: string) =>
  new ApiException(HttpStatus.BAD_REQUEST, 'invalid_source', message);

const PDF_SIGNATURE = Buffer.from('%PDF-');

function looksLikePdf(content: Buffer): boolean {
  return content.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
}

@Controller('cvs')
export class CvsController {
  constructor(private readonly cvsService: CvsService) {}

  @Post()
  @UseInterceptors(SourceUploadInterceptor)
  async create(
    @CurrentUser() user: SessionUser,
    @Body() body: CreateCvDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<CreateCvResponse> {
    const id = await this.cvsService.create(user.id, body.targetRole, readSource(body, file));
    return { id };
  }

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<CvSummary[]> {
    return this.cvsService.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: SessionUser, @CvId() id: string): Promise<Cv> {
    return this.cvsService.get(user.id, id);
  }

  @Put(':id')
  save(
    @CurrentUser() user: SessionUser,
    @CvId() id: string,
    @Body() body: SaveCvDto,
  ): Promise<SaveCvResponse> {
    // The same schema that the generator's output must pass. What the user
    // writes is stored as written; it is not compared with the facts.
    const document = cvDocumentSchema.safeParse(body.document);
    if (!document.success) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        describeIssues(document.error),
      );
    }
    return this.cvsService.save(user.id, id, body.version, document.data);
  }

  @Get(':id/pdf')
  // A private document, rendered from what is stored now: never from a cache.
  @Header('Cache-Control', 'private, no-store')
  async pdf(@CurrentUser() user: SessionUser, @CvId() id: string): Promise<StreamableFile> {
    const document = await this.cvsService.getDocument(user.id, id);
    const name = pdfFileName(document.contact.fullName);
    return new StreamableFile(await renderCvPdf(document), {
      type: 'application/pdf',
      // "attachment" is what makes a plain link download the file, on a phone too.
      disposition: `attachment; filename="${name.ascii}"; filename*=UTF-8''${name.encoded}`,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@CurrentUser() user: SessionUser, @CvId() id: string): Promise<void> {
    return this.cvsService.delete(user.id, id);
  }

  @Post(':id/answers')
  @HttpCode(HttpStatus.NO_CONTENT)
  answer(
    @CurrentUser() user: SessionUser,
    @CvId() id: string,
    @Body() body: SubmitAnswersDto,
  ): Promise<void> {
    return this.cvsService.answer(user.id, id, body.answers);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.NO_CONTENT)
  retry(@CurrentUser() user: SessionUser, @CvId() id: string): Promise<void> {
    return this.cvsService.retry(user.id, id);
  }
}

/** Exactly one source: a PDF or text. The file is judged by its content, not its name or type. */
function readSource(body: CreateCvDto, file: Express.Multer.File | undefined): CvSourceInput {
  if (file && body.text !== undefined) {
    throw invalidSource('Send either a PDF or text, not both.');
  }
  if (file) {
    if (!looksLikePdf(file.buffer)) {
      throw invalidSource('The file is not a PDF. Upload a PDF or paste the text instead.');
    }
    return { kind: 'pdf', pdf: file.buffer };
  }
  if (body.text !== undefined) {
    return { kind: 'text', text: body.text };
  }
  throw invalidSource('Upload a PDF or paste the text of your CV.');
}
