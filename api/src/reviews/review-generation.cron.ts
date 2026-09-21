import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReviewGenerationService } from './review-generation.service.js';

@Injectable()
export class ReviewGenerationCron {
  private readonly logger = new Logger(ReviewGenerationCron.name);

  constructor(private readonly generation: ReviewGenerationService) {}

  /**
   * Hourly, at :05. Each run only handles users whose local clock is in the review
   * hour, so a user is looked at about once a day, wherever they are in the world.
   */
  @Cron('0 5 * * * *')
  async run(): Promise<void> {
    try {
      const { ran, stats } = await this.generation.runScheduled();
      if (ran && stats && (stats.generated > 0 || stats.failed > 0)) {
        this.logger.log(
          `Reviews: ${stats.generated} generated, ${stats.alreadyExisted} existed, ${stats.skippedNoActivity} skipped (no activity), ${stats.failed} failed`,
        );
      }
    } catch (error) {
      this.logger.error(`Review generation run failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
