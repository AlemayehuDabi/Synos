import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateSettingsDto } from '../../src/modules/me/dto/update-settings.dto.js';

async function validateSettings(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateSettingsDto, payload);
  return validate(dto);
}

describe('UpdateSettingsDto validation', () => {
  it('accepts a valid IANA timezone', async () => {
    const errors = await validateSettings({ timezone: 'Europe/Paris' });
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid timezone', async () => {
    const errors = await validateSettings({ timezone: 'Not/AZone' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('timezone');
  });

  it('accepts a valid ISO 4217 currency and normalizes it to uppercase', async () => {
    const dto = plainToInstance(UpdateSettingsDto, { currency: 'eur' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.currency).toBe('EUR');
  });

  it('rejects a currency code that does not exist', async () => {
    const errors = await validateSettings({ currency: 'ZZZ' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('currency');
  });

  it('rejects weekStartsOn outside 0-6', async () => {
    const errors = await validateSettings({ weekStartsOn: 7 });
    expect(errors).toHaveLength(1);
  });

  it('rejects an invalid units value', async () => {
    const errors = await validateSettings({ units: 'furlongs' });
    expect(errors).toHaveLength(1);
  });

  it('allows an empty partial update', async () => {
    const errors = await validateSettings({});
    expect(errors).toHaveLength(0);
  });
});
