import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateScheduledJobDto {
  @ApiProperty({ example: 'Nightly Database Backup' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'db.backup' })
  @IsString()
  @IsNotEmpty()
  jobType: string;

  @ApiProperty({ example: { database: 'production_main' } })
  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;

  @ApiPropertyOptional({ example: '2026-08-25T04:00:00.000Z', description: 'ISO Timestamp for a one-time delayed job' })
  @IsOptional()
  @IsDateString()
  runAt?: string;

  @ApiPropertyOptional({ example: '0 0 * * *', description: 'Standard 5-field cron expression for recurring jobs' })
  @IsOptional()
  @IsString()
  cronExpression?: string;
}
