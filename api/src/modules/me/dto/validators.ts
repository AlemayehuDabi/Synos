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
          return typeof value === 'string' && Intl.supportedValuesOf('timeZone').includes(value);
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
