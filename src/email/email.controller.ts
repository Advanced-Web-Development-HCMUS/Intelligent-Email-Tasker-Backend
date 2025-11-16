import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GGJParseIntPipe } from '../common/pipes/parse-int.pipe';
import { TBaseDTO } from '../common/dto/base.dto';
import { MailboxDto } from './dto/mailbox-response.dto';
import {
  EmailListResponseDto,
  EmailDetailDto,
} from './dto/email-response.dto';

/**
 * Controller for email endpoints
 */
@ApiTags('Email')
@Controller('email')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Get all mailboxes
   */
  @Get('mailboxes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all mailboxes' })
  @ApiResponse({
    status: 200,
    description: 'Mailboxes retrieved successfully',
    type: TBaseDTO<MailboxDto[]>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMailboxes(): Promise<TBaseDTO<MailboxDto[]>> {
    const mailboxes = this.emailService.getMailboxes();
    return new TBaseDTO<MailboxDto[]>(mailboxes);
  }

  /**
   * Get emails for a specific mailbox
   */
  @Get('mailboxes/:id/emails')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get emails for a mailbox' })
  @ApiParam({ name: 'id', description: 'Mailbox ID', type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Emails retrieved successfully',
    type: TBaseDTO<EmailListResponseDto>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Mailbox not found' })
  async getEmailsByMailbox(
    @Param('id', GGJParseIntPipe) mailboxId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<TBaseDTO<EmailListResponseDto>> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 20;

    if (pageNum < 1 || limitNum < 1) {
      return new TBaseDTO<EmailListResponseDto>(
        undefined,
        undefined,
        'Page and limit must be positive numbers',
      );
    }

    const result = this.emailService.getEmailsByMailbox(
      mailboxId,
      pageNum,
      limitNum,
    );
    return new TBaseDTO<EmailListResponseDto>(result);
  }

  /**
   * Get email by ID
   */
  @Get('emails/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get email details by ID' })
  @ApiParam({ name: 'id', description: 'Email ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Email retrieved successfully',
    type: TBaseDTO<EmailDetailDto>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async getEmailById(
    @Param('id', GGJParseIntPipe) emailId: number,
  ): Promise<TBaseDTO<EmailDetailDto>> {
    const email = this.emailService.getEmailById(emailId);

    if (!email) {
      return new TBaseDTO<EmailDetailDto>(
        undefined,
        undefined,
        'Email not found',
      );
    }

    return new TBaseDTO<EmailDetailDto>(email);
  }
}

