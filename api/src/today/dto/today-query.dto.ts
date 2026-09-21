import { registerDecorator, type ValidationOptions } from 'class-validator';
import { IsOptional } from 'class-validator';
import { isValidCalendarDate } from '../../common/time/timezone.js';

function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
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

export class TodayQueryDto {
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}
