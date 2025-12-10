import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { GmailService } from './gmail.service';

/**
 * Scheduled service to restore snoozed emails
 * Runs every 5 minutes to check and restore emails that have passed their snooze date
 */
@Injectable()
export class GmailSchedulerService implements OnModuleInit, OnModuleDestroy {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly RESTORE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly gmailService: GmailService) {}

  /**
   * Start the scheduler when module initializes
   */
  async onModuleInit(): Promise<void> {
    console.log('Gmail Scheduler Service: Starting snoozed email restoration scheduler...');
    this.startScheduler();
  }

  /**
   * Stop the scheduler when module destroys
   */
  async onModuleDestroy(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      console.log('Gmail Scheduler Service: Stopped scheduler');
    }
  }

  /**
   * Start the interval scheduler
   */
  private startScheduler(): void {
    // Run immediately on start
    this.restoreSnoozedEmails();

    // Then run every 5 minutes
    this.intervalId = setInterval(() => {
      this.restoreSnoozedEmails();
    }, this.RESTORE_INTERVAL_MS);

    console.log(`Gmail Scheduler Service: Scheduler started (interval: ${this.RESTORE_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Restore snoozed emails that have passed their snooze date
   */
  private async restoreSnoozedEmails(): Promise<void> {
    try {
      const result = await this.gmailService.restoreSnoozedEmails();
      if (result.restored > 0) {
        console.log(`Gmail Scheduler Service: Restored ${result.restored} snoozed email(s)`);
      }
    } catch (error: any) {
      console.error('Gmail Scheduler Service: Error restoring snoozed emails:', error);
    }
  }

  /**
   * Manually trigger restoration (for testing)
   */
  async triggerRestore(): Promise<{ restored: number }> {
    return await this.gmailService.restoreSnoozedEmails();
  }
}

