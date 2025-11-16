/**
 * Base DTO response wrapper
 */
export class TBaseDTO<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;

  constructor(data?: T, message?: string, error?: string) {
    this.success = !error;
    this.data = data;
    this.message = message;
    this.error = error;
  }
}

