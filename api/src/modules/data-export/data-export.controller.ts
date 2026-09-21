import { Controller, Get, Param, Post, Res, StreamableFile, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type CurrentUserType } from '../../common/decorators/current-user.decorator.js';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor.js';
import { DataExportService } from './data-export.service.js';

@Controller('me/export')
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  createJob(@CurrentUser() user: CurrentUserType) {
    return this.dataExportService.createJob(user.id);
  }

  @Get(':id')
  async getJob(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const job = await this.dataExportService.getJobForOwner(user.id, id);
    if (job.status !== 'ready') {
      return job;
    }

    const { buffer, filename } = await this.dataExportService.downloadFile(user.id, id);
    res.set({
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }
}
