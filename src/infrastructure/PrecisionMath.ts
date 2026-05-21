export type RoundingMode = "floor" | "ceil" | "nearest";

export interface DecimalParts {
  readonly units: bigint;
  readonly scale: number;
}

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export class PrecisionMath {
  static assertDecimal(value: string, name = "decimal"): string {
    if (!DECIMAL_PATTERN.test(value)) throw new Error(`${name}_invalid_decimal`);
    return value;
  }

  static normalize(value: string): string {
    this.assertDecimal(value);
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [wholeRaw = "0", fractionRaw = ""] = unsigned.split(".");
    const whole = wholeRaw.replace(/^0+(?=\d)/, "");
    const fraction = fractionRaw.replace(/0+$/, "");
    const normalized = `${whole.length === 0 ? "0" : whole}${fraction.length === 0 ? "" : `.${fraction}`}`;
    return negative && normalized !== "0" ? `-${normalized}` : normalized;
  }

  static compare(left: string, right: string): number {
    const scale = Math.max(this.scale(left), this.scale(right));
    const leftUnits = this.toUnits(left, scale);
    const rightUnits = this.toUnits(right, scale);
    return leftUnits === rightUnits ? 0 : leftUnits > rightUnits ? 1 : -1;
  }

  static safeCompare(left: string, right: string): number {
    return this.compare(left, right);
  }

  static add(left: string, right: string): string {
    const scale = Math.max(this.scale(left), this.scale(right));
    return this.fromUnits(this.toUnits(left, scale) + this.toUnits(right, scale), scale);
  }

  static subtract(left: string, right: string): string {
    const scale = Math.max(this.scale(left), this.scale(right));
    return this.fromUnits(this.toUnits(left, scale) - this.toUnits(right, scale), scale);
  }

  static multiply(left: string, right: string): string {
    const leftScale = this.scale(left);
    const rightScale = this.scale(right);
    return this.fromUnits(this.toUnits(left, leftScale) * this.toUnits(right, rightScale), leftScale + rightScale);
  }

  static divide(left: string, right: string, scale = 8): string {
    this.assertDecimal(left, "left");
    this.assertDecimal(right, "right");
    if (!Number.isInteger(scale) || scale < 0) throw new Error("division_scale_invalid");
    const rightScale = this.scale(right);
    const numerator = this.toUnits(left, this.scale(left)) * (10n ** BigInt(scale + rightScale));
    const denominator = this.toUnits(right, rightScale);
    if (denominator === 0n) throw new Error("division_by_zero");
    return this.fromUnits(numerator / denominator, scale);
  }

  static abs(value: string): string {
    this.assertDecimal(value);
    return value.startsWith("-") ? value.slice(1) : value;
  }

  static isAligned(value: string, step: string): boolean {
    const scale = Math.max(this.scale(value), this.scale(step));
    const stepUnits = this.toUnits(step, scale);
    if (stepUnits <= 0n) throw new Error("step_size_invalid");
    return this.toUnits(value, scale) % stepUnits === 0n;
  }

  static roundToStep(value: string, step: string, mode: RoundingMode = "floor"): string {
    const scale = Math.max(this.scale(value), this.scale(step));
    const valueUnits = this.toUnits(value, scale);
    const stepUnits = this.toUnits(step, scale);
    if (stepUnits <= 0n) throw new Error("step_size_invalid");
    const quotient = valueUnits / stepUnits;
    const remainder = valueUnits % stepUnits;
    if (remainder === 0n) return this.fromUnits(valueUnits, scale);
    if (mode === "floor") return this.fromUnits(quotient * stepUnits, scale);
    if (mode === "ceil") return this.fromUnits((quotient + 1n) * stepUnits, scale);
    return this.fromUnits((remainder * 2n >= stepUnits ? quotient + 1n : quotient) * stepUnits, scale);
  }

  static normalizeToStep(value: string, step: string): string {
    if (!this.isAligned(value, step)) throw new Error("decimal_not_step_aligned");
    return this.normalize(value);
  }

  static applyTickSize(price: string, tickSize: string, mode: RoundingMode = "floor"): string {
    return this.roundToStep(price, tickSize, mode);
  }

  static applyStepSize(quantity: string, stepSize: string, mode: RoundingMode = "floor"): string {
    return this.roundToStep(quantity, stepSize, mode);
  }

  static normalizeQuantity(quantity: string, stepSize: string): string {
    return this.normalizeToStep(quantity, stepSize);
  }

  static normalizePrice(price: string, tickSize: string): string {
    return this.normalizeToStep(price, tickSize);
  }

  static toUnits(value: string, scale: number): bigint {
    this.assertDecimal(value);
    if (!Number.isInteger(scale) || scale < 0) throw new Error("scale_invalid");
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [whole = "0", fraction = ""] = unsigned.split(".");
    if (fraction.length > scale) {
      throw new Error("decimal_exceeds_scale");
    }
    const units = BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
    return negative ? -units : units;
  }

  static fromUnits(units: bigint, scale: number): string {
    if (!Number.isInteger(scale) || scale < 0) throw new Error("scale_invalid");
    const negative = units < 0n;
    const unsigned = negative ? -units : units;
    if (scale === 0) return `${negative ? "-" : ""}${unsigned.toString()}`;
    const raw = unsigned.toString().padStart(scale + 1, "0");
    const whole = raw.slice(0, raw.length - scale);
    const fraction = raw.slice(raw.length - scale).replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole}${fraction.length === 0 ? "" : `.${fraction}`}`;
  }

  static scale(value: string): number {
    this.assertDecimal(value);
    return value.includes(".") ? value.split(".")[1]?.length ?? 0 : 0;
  }
}
