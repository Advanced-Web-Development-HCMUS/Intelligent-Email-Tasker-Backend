import { IsOptional, IsString, IsInt, IsBoolean, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for updating a Kanban column
 */
export class UpdateKanbanColumnDto {
  @ApiProperty({
    description: 'Column name',
    example: 'To Do',
    required: false,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'Column name must be a string' })
  @MaxLength(100, { message: 'Column name must not exceed 100 characters' })
  name?: string;

  @ApiProperty({
    description: 'Display order (lower number = appears first)',
    example: 0,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'Order must be an integer' })
  @Min(0, { message: 'Order must be non-negative' })
  order?: number;

  @ApiProperty({
    description: 'Gmail label to map this column to',
    example: 'STARRED',
    required: false,
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'Gmail label must be a string' })
  @MaxLength(50, { message: 'Gmail label must not exceed 50 characters' })
  gmailLabel?: string;

  @ApiProperty({
    description: 'Whether column is active/visible',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

