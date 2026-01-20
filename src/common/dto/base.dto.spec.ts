import { TBaseDTO } from './base.dto';

describe('TBaseDTO', () => {
  it('should set success to true when no error', () => {
    const payload = { a: 1 };
    const dto = new TBaseDTO(payload, 'ok');
    expect(dto.success).toBe(true);
    expect(dto.data).toEqual(payload);
    expect(dto.message).toBe('ok');
    expect(dto.error).toBeUndefined();
  });

  it('should set success to false when error provided', () => {
    const dto = new TBaseDTO(undefined, undefined, 'fail');
    expect(dto.success).toBe(false);
    expect(dto.data).toBeUndefined();
    expect(dto.message).toBeUndefined();
    expect(dto.error).toBe('fail');
  });
});
