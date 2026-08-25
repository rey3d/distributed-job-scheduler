import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RetryStrategy } from '@job-scheduler/shared';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class RetryPolicyConfigDto {
  @ApiPropertyOptional({ example: 'Standard Exponential Backoff' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ enum: RetryStrategy, default: RetryStrategy.EXPONENTIAL })
  @IsEnum(RetryStrategy)
  strategy: RetryStrategy = RetryStrategy.EXPONENTIAL;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  baseDelaySec?: number = 5;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAttempts?: number = 3;

  @ApiPropertyOptional({ default: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDelayCapSec?: number = 3600;
}

export class CreateQueueDto {
  @ApiProperty({ example: 'email-notifications' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Transactional email dispatch queue' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number = 0;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  concurrencyLimit?: number = 5;

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
