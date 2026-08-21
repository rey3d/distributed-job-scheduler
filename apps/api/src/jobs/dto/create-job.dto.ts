import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateJobDto {
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

  @ApiPropertyOptional({ example: 'webhook-evt-991823' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
