import type { SaveCvRequest } from '@cv-builder/contracts';
import { IsInt, IsObject, Max, Min } from 'class-validator';

/**
 * Body of `PUT /api/cvs/:id`. The document's own shape and limits are checked
 * by `cvDocumentSchema`, the one definition shared with the generator.
 */
export class SaveCvDto implements Omit<SaveCvRequest, 'document'> {
  /** The version the edit was based on. */
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  version!: number;

  @IsObject()
  document!: Record<string, unknown>;
}
