export class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class SquareError extends AppError {
  constructor(status, errors = []) {
    const first = errors[0] || {};
    super(
      status >= 500 ? 502 : status,
      first.code || 'SQUARE_REQUEST_FAILED',
      first.detail || 'Square could not complete the request.',
      errors
    );
    this.name = 'SquareError';
  }
}
