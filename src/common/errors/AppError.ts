export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "No autorizado") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Datos inválidos",
    public readonly details?: unknown,
  ) {
    super(message, 400, "VALIDATION_ERROR");
  }
}
