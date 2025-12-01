import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsArray, IsString } from 'class-validator';

/**
 * DTO for modifying email (mark read/unread, star, delete, etc.)
 */
export class ModifyEmailDto {
  @ApiProperty({
    description: 'Mark email as read (true) or unread (false)',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  markRead?: boolean;

  @ApiProperty({
    description: 'Label IDs to add',
    example: ['STARRED', 'IMPORTANT'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  addLabelIds?: string[];

  @ApiProperty({
    description: 'Label IDs to remove',
    example: ['UNREAD'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  removeLabelIds?: string[];
}

