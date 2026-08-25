import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { RetryPolicyConfigDto } from './create-queue.dto';

export class UpdateQueueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  concurrencyLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  retryPolicyId?: string;

  @ApiPropertyOptional({ type: () => RetryPolicyConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RetryPolicyConfigDto)
  retryPolicy?: RetryPolicyConfigDto;
}
