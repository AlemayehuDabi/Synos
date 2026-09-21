import { registerDecorator, type ValidationOptions } from 'class-validator';

export function IsIanaTimezone(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          // supportedValuesOf lists region zones only and leaves out "UTC", which is the default
          // timezone: without this a user who moved away from it could never go back.
          return typeof value === 'string' && (value === 'UTC' || Intl.supportedValuesOf('timeZone').includes(value));
        },
        defaultMessage() {
          return 'timezone must be a valid IANA time zone name';
        },
      },
    });
  };
}

export function IsIso4217Currency(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isIso4217Currency',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && Intl.supportedValuesOf('currency').includes(value);
        },
        defaultMessage() {
          return 'currency must be a valid ISO 4217 currency code';
        },
      },
    });
  };
}
