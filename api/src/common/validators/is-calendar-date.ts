import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidCalendarDate } from '../time/timezone.js';

/** A real calendar date formatted "YYYY-MM-DD" (rejects 2026-02-30, 2026-9-1, "today", etc). */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidCalendarDate(value),
        defaultMessage: () => 'date must be a real calendar date formatted YYYY-MM-DD',
      },
    });
  };
}
