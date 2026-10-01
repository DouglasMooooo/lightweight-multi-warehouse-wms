export class DomainError extends Error {
  constructor(
    message: string,
    readonly code = "DOMAIN_VALIDATION_FAILED",
  ) {
    super(message);
    this.name = "DomainError";
  }
}
