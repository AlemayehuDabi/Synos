import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CursorPage,
  compoundCursorWhere,
  decodeCompoundCursor,
  encodeCompoundCursor,
  resolvePageSize,
} from '../common/pagination/cursor-pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../lib/prisma.js';
import type { CreateProgramDto, ProgramWorkoutDto, UpdateProgramDto } from './dto/program.dto.js';
import { ExerciseService } from './exercise.service.js';
import { type ProgramView, toProgramView } from './fitness.mapper.js';
import { parseWorkoutTemplate } from './program-template.js';

const INCLUDE = { workouts: true } satisfies Prisma.ProgramInclude;

@Injectable()
export class ProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExerciseService,
  ) {}

  async list(userId: string, filters: { isActive?: boolean }, pagination: { cursor?: string; limit?: number }): Promise<CursorPage<ProgramView>> {
    const take = resolvePageSize(pagination.limit);
    const and: Prisma.ProgramWhereInput[] = [{ userId }];
    if (filters.isActive !== undefined) and.push({ isActive: filters.isActive });
    if (pagination.cursor) and.push(compoundCursorWhere('createdAt', decodeCompoundCursor(pagination.cursor), 'desc'));

    const rows = await this.prisma.program.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: INCLUDE,
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);
    return { items: items.map(toProgramView), nextCursor: hasMore && last ? encodeCompoundCursor(last.createdAt, last.id) : null };
  }

  async create(userId: string, dto: CreateProgramDto): Promise<ProgramView> {
    const workouts = await this.validateWorkouts(userId, dto.workouts);
    const program = await this.prisma.program.create({
      data: { userId, name: dto.name.trim(), description: dto.description, workouts: { create: workouts } },
      include: INCLUDE,
    });
    return toProgramView(program);
  }

  async get(userId: string, id: string): Promise<ProgramView> {
    return toProgramView(await this.findOwned(userId, id));
  }

  async update(userId: string, id: string, dto: UpdateProgramDto): Promise<ProgramView> {
    const program = await this.findOwned(userId, id);
    const workouts = dto.workouts !== undefined ? await this.validateWorkouts(userId, dto.workouts) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (workouts) await tx.programWorkout.deleteMany({ where: { programId: program.id } });
      return tx.program.update({
        where: { id: program.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(workouts ? { workouts: { create: workouts } } : {}),
        },
        include: INCLUDE,
      });
    });
    return toProgramView(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const program = await this.findOwned(userId, id);
    await this.prisma.program.delete({ where: { id: program.id } });
  }

  /** Makes this the one active program (deactivating any other) and starts its day zero now. Activating an active program is a no-op. */
  async activate(userId: string, id: string): Promise<ProgramView> {
    const program = await this.findOwned(userId, id);
    if (program.isActive) return toProgramView(program);

    const activated = await this.prisma.$transaction(async (tx) => {
      await tx.program.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });
      return tx.program.update({ where: { id: program.id }, data: { isActive: true, activatedAt: new Date() }, include: INCLUDE });
    });
    return toProgramView(activated);
  }

  private async findOwned(userId: string, id: string) {
    const program = await this.prisma.program.findFirst({ where: { id, userId }, include: INCLUDE });
    if (!program) throw new NotFoundException('Program not found');
    return program;
  }

  private async validateWorkouts(userId: string, workouts: ProgramWorkoutDto[] | undefined): Promise<Prisma.ProgramWorkoutCreateWithoutProgramInput[]> {
    if (!workouts || workouts.length === 0) return [];
    const parsed = workouts.map((entry, index) => ({ dayOffset: entry.dayOffset, template: parseWorkoutTemplate(entry.workoutTemplate, index) }));
    const exerciseIds = parsed.flatMap((entry) => entry.template.exercises?.map((exercise) => exercise.exerciseId) ?? []);
    try {
      await this.exercises.assertUsable(userId, exerciseIds);
    } catch {
      throw new BadRequestException('Every exerciseId in a workoutTemplate must be a library exercise or one of your own');
    }
    return parsed.map((entry) => ({ dayOffset: entry.dayOffset, workoutTemplate: entry.template as Prisma.InputJsonValue }));
  }
}
