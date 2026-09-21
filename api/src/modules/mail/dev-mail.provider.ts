import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailProvider } from './mail.interface.js';

/**
 * Logs emails to the console instead of sending them. This is the only
 * provider implemented today; swap the binding in MailModule for a
 * Resend/SES-backed MailProvider when one exists.
 */
@Injectable()
export class DevMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}
