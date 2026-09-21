import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SIGNAL_EMITTED_EVENT } from '../signal-engine.facade.js';
import { SignalProcessorService } from './signal-processor.service.js';

@Injectable()
export class FastPathListener {
  private readonly logger = new Logger(FastPathListener.name);

  constructor(private readonly processor: SignalProcessorService) {}

  @OnEvent(SIGNAL_EMITTED_EVENT)
  async handle(payload: { signalId: string }): Promise<void> {
    try {
      await this.processor.processSignal(payload.signalId);
    } catch {
      // Never log payloads. The sweeper cron will retry with backoff regardless.
      this.logger.warn(`Fast-path processing failed for signal ${payload.signalId}; the sweeper will retry it`);
    }
  }
}
