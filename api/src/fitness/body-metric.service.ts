import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CursorPage,
  compoundCursorWhere,
  decodeCompoundCursor,
  encodeCompoundCursor,
  resolvePageSize,
} from '../common/pagination/cursor-pagination.js';
import { localDateInTimezone, startOfLocalDay } from '../common/time/timezone.js';
import type { BodyMetric, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../lib/prisma.js';
import type { CreateBodyMetricDto, UpdateBodyMetricDto } from './dto/body-metric.dto.js';
import { type BodyMetricView, toBodyMetricView } from './fitness.mapper.js';

@Injectable()
export class BodyMetricService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, range: { from?: string; to?: string }, pagination: { cursor?: string; limit?: number }): Promise<CursorPage<BodyMetricView>> {
    const take = resolvePageSize(pagination.limit);
    const and: Prisma.BodyMetricWhereInput[] = [{ userId }];
    if (range.from) and.push({ date: { gte: startOfLocalDay(range.from, 'UTC') } });
    if (range.to) and.push({ date: { lte: startOfLocalDay(range.to, 'UTC') } });
    if (pagination.cursor) and.push(compoundCursorWhere('date', decodeCompoundCursor(pagination.cursor), 'desc'));

    const rows = await this.prisma.bodyMetric.findMany({ where: { AND: and }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: take + 1 });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);
    return { items: items.map(toBodyMetricView), nextCursor: hasMore && last ? encodeCompoundCursor(last.date, last.id) : null };
  }

  async create(userId: string, dto: CreateBodyMetricDto): Promise<BodyMetricView> {
    this.assertHasContent(dto.weightKg, dto.bodyFatPct, dto.notes);
    const date = dto.date ?? (await this.today(userId));
    const metric = await this.prisma.bodyMetric.create({
      data: {
        userId,
        date: startOfLocalDay(date, 'UTC'),
        weightKg: dto.weightKg,
        bodyFatPct: dto.bodyFatPct,
        notes: dto.notes,
        source: dto.source ?? 'manual',
      },
    });
    return toBodyMetricView(metric);
  }

  async update(userId: string, id: string, dto: UpdateBodyMetricDto): Promise<BodyMetricView> {
    const metric = await this.findOwned(userId, id);
    const weightKg = dto.weightKg !== undefined ? dto.weightKg : metric.weightKg;
    const bodyFatPct = dto.bodyFatPct !== undefined ? dto.bodyFatPct : metric.bodyFatPct;
    const notes = dto.notes !== undefined ? dto.notes : metric.notes;
    this.assertHasContent(weightKg, bodyFatPct, notes);

    const updated = await this.prisma.bodyMetric.update({
      where: { id: metric.id },
      data: { weightKg, bodyFatPct, notes, ...(dto.date !== undefined ? { date: startOfLocalDay(dto.date, 'UTC') } : {}) },
    });
    return toBodyMetricView(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const metric = await this.findOwned(userId, id);
    await this.prisma.bodyMetric.delete({ where: { id: metric.id } });
  }

  private async findOwned(userId: string, id: string): Promise<BodyMetric> {
    const metric = await this.prisma.bodyMetric.findFirst({ where: { id, userId } });
    if (!metric) throw new NotFoundException('Body metric not found');
    return metric;
  }

  private assertHasContent(weightKg: number | null | undefined, bodyFatPct: number | null | undefined, notes: string | null | undefined): void {
    if (weightKg == null && bodyFatPct == null && !notes) {
      throw new BadRequestException('Provide at least one of weightKg, bodyFatPct or notes');
    }
  }

  private async today(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } });
    return localDateInTimezone(new Date(), settings?.timezone ?? 'UTC');
  }
}
