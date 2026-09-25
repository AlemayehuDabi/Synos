import { Injectable } from '@nestjs/common';
import { AsExportContributor } from '../../common/export/export-contributor.decorator.js';
import type { ExportContributor } from '../../common/export/export-contributor.interface.js';
import { PrismaService } from '../../lib/prisma.js';

/** The user's own custom exercises only; the shared library is not theirs to export. */
@Injectable()
@AsExportContributor()
export class ExercisesExportContributor implements ExportContributor {
  readonly name = 'exercises';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.exercise.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class WorkoutsExportContributor implements ExportContributor {
  readonly name = 'workouts';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.workout.findMany({ where: { userId }, orderBy: { startedAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class WorkoutExercisesExportContributor implements ExportContributor {
  readonly name = 'workoutExercises';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.workoutExercise.findMany({ where: { workout: { userId } }, orderBy: [{ workoutId: 'asc' }, { sortOrder: 'asc' }] });
  }
}

@Injectable()
@AsExportContributor()
export class WorkoutSetsExportContributor implements ExportContributor {
  readonly name = 'workoutSets';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.workoutSet.findMany({
      where: { workoutExercise: { workout: { userId } } },
      orderBy: [{ workoutExerciseId: 'asc' }, { setNumber: 'asc' }],
    });
  }
}

@Injectable()
@AsExportContributor()
export class ProgramsExportContributor implements ExportContributor {
  readonly name = 'programs';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.program.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class ProgramWorkoutsExportContributor implements ExportContributor {
  readonly name = 'programWorkouts';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.programWorkout.findMany({ where: { program: { userId } }, orderBy: [{ programId: 'asc' }, { dayOffset: 'asc' }] });
  }
}

@Injectable()
@AsExportContributor()
export class BodyMetricsExportContributor implements ExportContributor {
  readonly name = 'bodyMetrics';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.bodyMetric.findMany({ where: { userId }, orderBy: { date: 'asc' } });
  }
}

@Injectable()
@AsExportContributor()
export class WearableSamplesExportContributor implements ExportContributor {
  readonly name = 'wearableSamples';
  constructor(private readonly prisma: PrismaService) {}
  async collect(userId: string) {
    return this.prisma.wearableSample.findMany({ where: { userId }, orderBy: { startsAt: 'asc' } });
  }
}
