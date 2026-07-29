export class TokenBudget {
  private used = 0;

  constructor(
    private readonly budget: number,
    private readonly onUpdate: (used: number, budget: number) => void,
  ) {}

  consume(tokens: number): void {
    this.used += tokens;
    this.onUpdate(this.used, this.budget);
  }

  get remaining(): number {
    return Math.max(0, this.budget - this.used);
  }

  get totalUsed(): number {
    return this.used;
  }

  get isExhausted(): boolean {
    return this.used >= this.budget;
  }

  assertAvailable(estimatedTokens: number): void {
    if (this.used + estimatedTokens > this.budget) {
      throw new TokenBudgetExhaustedError(
        `Token budget exhausted: used ${this.used}/${this.budget}, need ~${estimatedTokens} more`,
      );
    }
  }

  snapshot(): { used: number; budget: number; remaining: number } {
    return { used: this.used, budget: this.budget, remaining: this.remaining };
  }
}

export class TokenBudgetExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenBudgetExhaustedError";
  }
}
