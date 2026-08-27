export const MAX_REVISIONS = 1;

export class MaxRevisionsReached extends Error {
  constructor() {
    super("Maximum revisions reached");
    this.name = "MaxRevisionsReached";
  }
}

export class ReviewError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
  }
}
