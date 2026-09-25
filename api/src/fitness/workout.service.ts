import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CursorPage,
  compoundCursorWhere,
  decodeCompoundCursor,
  encodeCompoundCursor,
  resolvePageSize,
} from '../common/pagination/cursor-pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../lib/prisma.js';
import { SignalEngineFacade } from '../signal-engine/signal-engine.facade.js';
import type { CompleteWorkoutDto, CreateWorkoutDto, UpdateWorkoutDto, WorkoutExerciseDto } from './dto/workout.dto.js';
import { ExerciseService } from './exercise.service.js';
import { toWorkoutView, WORKOUT_INCLUDE, type WorkoutView, type WorkoutWithExercises } from './fitness.mapper.js';

function parseInstant(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} must be a valid ISO-8601 instant`);
  return parsed;
}

const minutesBetween = (from: Date, to: Date) => Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));

@Injectable()
export class WorkoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExerciseService,
    private readonly signalEngine: SignalEngineFacade,
  ) {}

  async create(userId: string, dto: CreateWorkoutDto): Promise<WorkoutView> {
    const startedAt = parseInstant(dto.startedAt, 'startedAt');
    const completedAt = dto.completedAt !== undefined ? parseInstant(dto.completedAt, 'completedAt') : null;
    if (completedAt && completedAt < startedAt) throw new BadRequestException('completedAt must not be before startedAt');
    if (dto.programId) await this.assertOwnProgram(userId, dto.programId);
    const exerciseCreates = await this.buildExercises(userId, dto.exercises);

    try {
      const workout = await this.prisma.workout.create({
        data: {
          ...(dto.id ? { id: dto.id } : {}),
          userId,
          title: dto.title,
          workoutType: dto.workoutType.trim(),
          startedAt,
          completedAt,
          durationMinutes: dto.durationMinutes ?? (completedAt ? minutesBetween(startedAt, completedAt) : null),
          notes: dto.notes,
          programId: dto.programId,
          source: dto.source ?? 'manual',
          exercises: { create: exerciseCreates },
        },
        include: WORKOUT_INCLUDE,
      });
      return toWorkoutView(workout);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('A workout with this id already exists');
      throw error;
    }
  }

  async get(userId: string, id: string): Promise<WorkoutView> {
    return toWorkoutView(await this.findOwned(userId, id));
  }

  async list(
    userId: string,
    filters: { from?: string; to?: string; workoutType?: string; completed?: boolean },
    pagination: { cursor?: string; limit?: number },
  ): Promise<CursorPage<WorkoutView>> {
    const take = resolvePageSize(pagination.limit);
    const and: Prisma.WorkoutWhereInput[] = [{ userId, deletedAt: null }];
    if (filters.from) and.push({ startedAt: { gte: parseInstant(filters.from, 'from') } });
    if (filters.to) and.push({ startedAt: { lt: parseInstant(filters.to, 'to') } });
    if (filters.workoutType) and.push({ workoutType: { equals: filters.workoutType, mode: 'insensitive' } });
    if (filters.completed !== undefined) and.push({ completedAt: filters.completed ? { not: null } : null });
    if (pagination.cursor) and.push(compoundCursorWhere('startedAt', decodeCompoundCursor(pagination.cursor), 'desc'));

    const rows = await this.prisma.workout.findMany({
      where: { AND: and },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: WORKOUT_INCLUDE,
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);
    return { items: items.map(toWorkoutView), nextCursor: hasMore && last ? encodeCompoundCursor(last.startedAt, last.id) : null };
  }

  async update(userId: string, id: string, dto: UpdateWorkoutDto): Promise<WorkoutView> {
    const workout = await this.findOwned(userId, id);
    const startedAt = dto.startedAt !== undefined ? parseInstant(dto.startedAt, 'startedAt') : workout.startedAt;
    if (workout.completedAt && workout.completedAt < startedAt) throw new BadRequestException('startedAt must not be after completedAt');
    if (dto.programId) await this.assertOwnProgram(userId, dto.programId);
    const exerciseCreates = dto.exercises !== undefined ? await this.buildExercises(userId, dto.exercises) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (exerciseCreates) await tx.workoutExercise.deleteMany({ where: { workoutId: workout.id } });
      return tx.workout.update({
        where: { id: workout.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.workoutType !== undefined ? { workoutType: dto.workoutType.trim() } : {}),
          startedAt,
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.programId !== undefined ? { programId: dto.programId } : {}),
          ...(exerciseCreates ? { exercises: { create: exerciseCreates } } : {}),
        },
        include: WORKOUT_INCLUDE,
      });
    });
    return toWorkoutView(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const workout = await this.findOwned(userId, id);
    await this.prisma.workout.update({ where: { id: workout.id }, data: { deletedAt: new Date() } });
  }

  /** Marks the workout completed and emits `workout.completed` in the same transaction (outbox). */
  async complete(userId: string, id: string, dto: CompleteWorkoutDto): Promise<WorkoutView> {
    const workout = await this.findOwned(userId, id);
    if (workout.completedAt) throw new ConflictException('Workout is already completed');

    const completedAt = dto.completedAt !== undefined ? parseInstant(dto.completedAt, 'completedAt') : new Date();
    if (completedAt < workout.startedAt) throw new BadRequestException('completedAt must not be before startedAt');
    const durationMinutes = dto.durationMinutes ?? workout.durationMinutes ?? minutesBetween(workout.startedAt, completedAt);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.workout.update({ where: { id: workout.id }, data: { completedAt, durationMinutes }, include: WORKOUT_INCLUDE });
      await this.signalEngine.emit(
        {
          userId,
          type: 'workout.completed',
          payload: { workoutId: row.id, completedAt: completedAt.toISOString(), durationMinutes, workoutType: row.workoutType },
          occurredAt: completedAt,
          subject: { type: 'workout', id: row.id },
          dedupeKey: `workout-completed:${row.id}`,
        },
        tx,
      );
      return row;
    });
    return toWorkoutView(updated);
  }

  async findOwned(userId: string, id: string): Promise<WorkoutWithExercises> {
    const workout = await this.prisma.workout.findFirst({ where: { id, userId, deletedAt: null }, include: WORKOUT_INCLUDE });
    if (!workout) throw new NotFoundException('Workout not found');
    return workout;
  }

  private async assertOwnProgram(userId: string, programId: string): Promise<void> {
    const found = await this.prisma.program.count({ where: { id: programId, userId } });
    if (found === 0) throw new BadRequestException('programId must be one of your own programs');
  }

  /** Validates the exercises/sets and shapes them for a nested create; positions fill in sortOrder/setNumber. */
  private async buildExercises(userId: string, exercises: WorkoutExerciseDto[] | undefined): Promise<Prisma.WorkoutExerciseCreateWithoutWorkoutInput[]> {
    if (!exercises || exercises.length === 0) return [];
    await this.exercises.assertUsable(userId, exercises.map((entry) => entry.exerciseId));

    return exercises.map((entry, index) => {
      const setNumbers = (entry.sets ?? []).map((set, position) => set.setNumber ?? position + 1);
      if (new Set(setNumbers).size !== setNumbers.length) {
        throw new BadRequestException(`exercises[${index}] has two sets with the same setNumber`);
      }
      return {
        exercise: { connect: { id: entry.exerciseId } },
        sortOrder: entry.sortOrder ?? index,
        sets: {
          create: (entry.sets ?? []).map((set, position) => ({
            setNumber: setNumbers[position],
            reps: set.reps,
            weightKg: set.weightKg,
            durationSeconds: set.durationSeconds,
            distanceMeters: set.distanceMeters,
            rpe: set.rpe,
          })),
        },
      };
    });
  }
}
