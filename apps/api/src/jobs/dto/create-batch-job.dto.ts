import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBatchJobItemDto {
  @ApiProperty({ example: 'email.send' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: { to: 'user@example.com', template: 'welcome' } })
  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number = 0;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number = 3;

  @ApiPropertyOptional({ example: 'batch-item-key-101' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CreateBatchJobDto {
  @ApiProperty({ type: [CreateBatchJobItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Batch cannot be empty. Must include at least 1 job definition.' })
  @ValidateNested({ each: true })
  @Type(() => CreateBatchJobItemDto)
  jobs: CreateBatchJobItemDto[];
}
