import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  type CursorPage,
  decodeStringCompoundCursor,
  encodeStringCompoundCursor,
  resolvePageSize,
  stringCompoundCursorWhere,
} from '../common/pagination/cursor-pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ExerciseCategory } from '../generated/prisma/enums.js';
import { PrismaService } from '../lib/prisma.js';
import type { CreateExerciseDto } from './dto/exercise.dto.js';
import { type ExerciseView, toExerciseView } from './fitness.mapper.js';

@Injectable()
export class ExerciseService {
  constructor(private readonly prisma: PrismaService) {}

  /** The read-only library plus the caller's own custom exercises, by name. */
  async list(
    userId: string,
    filters: { category?: ExerciseCategory; muscleGroup?: string; q?: string; isCustom?: boolean },
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<ExerciseView>> {
    const take = resolvePageSize(pagination.limit);
    const and: Prisma.ExerciseWhereInput[] = [{ OR: [{ userId: null }, { userId }] }];
    if (filters.category) and.push({ category: filters.category });
    if (filters.muscleGroup) and.push({ muscleGroups: { has: filters.muscleGroup } });
    if (filters.q) and.push({ name: { contains: filters.q, mode: 'insensitive' } });
    if (filters.isCustom !== undefined) and.push({ isCustom: filters.isCustom });
    if (pagination.cursor) and.push(stringCompoundCursorWhere('name', decodeStringCompoundCursor(pagination.cursor)));

    const rows = await this.prisma.exercise.findMany({ where: { AND: and }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: take + 1 });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);
    return { items: items.map(toExerciseView), nextCursor: hasMore && last ? encodeStringCompoundCursor(last.name, last.id) : null };
  }

  async create(userId: string, dto: CreateExerciseDto): Promise<ExerciseView> {
    try {
      const exercise = await this.prisma.exercise.create({
        data: { userId, name: dto.name.trim(), category: dto.category, muscleGroups: [...new Set(dto.muscleGroups ?? [])], isCustom: true },
      });
      return toExerciseView(exercise);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('You already have a custom exercise with this name');
      throw error;
    }
  }

  /** Throws 400 unless every id is a library exercise or one of the caller's own. */
  async assertUsable(userId: string, exerciseIds: string[]): Promise<void> {
    const unique = [...new Set(exerciseIds)];
    if (unique.length === 0) return;
    const found = await this.prisma.exercise.count({ where: { id: { in: unique }, OR: [{ userId: null }, { userId }] } });
    if (found !== unique.length) throw new BadRequestException('Every exerciseId must be a library exercise or one of your own');
  }
}
