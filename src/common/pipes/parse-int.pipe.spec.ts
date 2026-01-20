import { BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { GGJParseIntPipe } from './parse-int.pipe';

describe('GGJParseIntPipe', () => {
  const pipe = new GGJParseIntPipe();
  const metadata: ArgumentMetadata = { type: 'param', metatype: String, data: 'id' };

  it('should parse valid integer strings', () => {
    expect(pipe.transform('42', metadata)).toBe(42);
    expect(pipe.transform('0', metadata)).toBe(0);
    expect(pipe.transform('10', metadata)).toBe(10);
  });

  it('should throw BadRequestException for invalid integers', () => {
    expect(() => pipe.transform('abc', metadata)).toThrow(BadRequestException);
    expect(() => pipe.transform('', metadata)).toThrow(BadRequestException);
    expect(() => pipe.transform('not-a-number', metadata)).toThrow(BadRequestException);
  });
});
