import { IsNotEmpty, IsString, IsOptional, IsInt, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for creating a Kanban column
 */
export class CreateKanbanColumnDto {
  @ApiProperty({
    description: 'Column name',
    example: 'To Do',
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'Column name is required' })
  @IsString({ message: 'Column name must be a string' })
  @MaxLength(100, { message: 'Column name must not exceed 100 characters' })
  name: string;

  @ApiProperty({
    description: 'Unique status ID for the column',
    example: 'todo',
    maxLength: 50,
  })
  @IsNotEmpty({ message: 'Status ID is required' })
  @IsString({ message: 'Status ID must be a string' })
  @MaxLength(50, { message: 'Status ID must not exceed 50 characters' })
  statusId: string;

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
    description: 'Gmail label to map this column to (e.g., "STARRED", "IMPORTANT", or custom label)',
    example: 'STARRED',
    required: false,
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'Gmail label must be a string' })
  @MaxLength(50, { message: 'Gmail label must not exceed 50 characters' })
  gmailLabel?: string;
}

