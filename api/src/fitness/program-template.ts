import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const templateSet = z
  .object({
    reps: z.number().int().min(0).max(10_000).optional(),
    weightKg: z.number().min(0).max(2000).optional(),
    durationSeconds: z.number().int().min(0).max(86_400).optional(),
    distanceMeters: z.number().min(0).max(1_000_000).optional(),
    rpe: z.number().min(1).max(10).optional(),
  })
  .strict();

/** The shape of a ProgramWorkout's `workoutTemplate`. Unknown keys are rejected so typos surface as 400s. */
export const workoutTemplateSchema = z
  .object({
    workoutType: z.string().trim().min(1).max(50),
    title: z.string().trim().min(1).max(200).optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    exercises: z
      .array(z.object({ exerciseId: z.uuid(), sets: z.array(templateSet).max(100).optional() }).strict())
      .max(50)
      .optional(),
  })
  .strict();

export type WorkoutTemplate = z.infer<typeof workoutTemplateSchema>;

export function parseWorkoutTemplate(raw: unknown, index: number): WorkoutTemplate {
  const parsed = workoutTemplateSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'workoutTemplate'}: ${issue.message}`).join('; ');
  throw new BadRequestException(`workouts[${index}].workoutTemplate is invalid - ${details}`);
}
