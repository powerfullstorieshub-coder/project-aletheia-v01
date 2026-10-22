const MAX_EXPRESSION_LENGTH = 256;
const MAX_TOKEN_COUNT = 128;
const MAX_PARSE_DEPTH = 64;

class CalculationFailure extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CalculationFailure";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new CalculationFailure(code, message);
};

const isDigit = (character) => character >= "0" && character <= "9";

const tokenize = (source) => {
  if (source.length > MAX_EXPRESSION_LENGTH) {
    fail("expression_too_long", "Expression exceeds the supported length limit.");
  }

  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }

    if (isDigit(character) || character === ".") {
      const start = index;
      let digitCount = 0;

      while (isDigit(source[index])) {
        index += 1;
        digitCount += 1;
      }

      if (source[index] === ".") {
        index += 1;
        while (isDigit(source[index])) {
          index += 1;
          digitCount += 1;
        }
      }

      if (digitCount === 0) {
        fail("invalid_expression", "Expression contains an invalid number.");
      }

      const value = Number(source.slice(start, index));
      if (!Number.isFinite(value)) {
        fail("non_finite_result", "A numeric value is outside the supported range.");
      }
      tokens.push({ type: "number", value });
    } else if ("+-*/%^()".includes(character)) {
      tokens.push({ type: character, value: character });
      index += 1;
    } else {
      fail(
        "unsupported_syntax",
        "Only decimal numbers, parentheses, and +, -, *, /, %, ^ are supported.",
      );
    }

    if (tokens.length > MAX_TOKEN_COUNT) {
      fail("expression_too_complex", "Expression exceeds the supported complexity limit.");
    }
  }

  if (tokens.length === 0) {
    fail("invalid_expression", "Expression is empty.");
  }

  return tokens;
};

const ensureFinite = (value) => {
  if (!Number.isFinite(value)) {
    fail("non_finite_result", "The expression does not produce a finite real result.");
  }
  return value;
};

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  assertDepth(depth) {
    if (depth > MAX_PARSE_DEPTH) {
      fail("expression_too_complex", "Expression nesting exceeds the supported limit.");
    }
  }

  current() {
    return this.tokens[this.index];
  }

  parse() {
    const value = this.parseAdditive(0);
    if (this.index !== this.tokens.length) {
      fail("invalid_expression", "Expression is incomplete or malformed.");
    }
    return ensureFinite(value);
  }

  parseAdditive(depth) {
    this.assertDepth(depth);
    let value = this.parseMultiplicative(depth);

    while (this.current()?.type === "+" || this.current()?.type === "-") {
      const operator = this.current().type;
      this.index += 1;
      const right = this.parseMultiplicative(depth);
      value = ensureFinite(operator === "+" ? value + right : value - right);
    }

    return value;
  }

  parseMultiplicative(depth) {
    this.assertDepth(depth);
    let value = this.parseUnary(depth);

    while (["*", "/", "%"].includes(this.current()?.type)) {
      const operator = this.current().type;
      this.index += 1;
      const right = this.parseUnary(depth);

      if ((operator === "/" || operator === "%") && right === 0) {
        const code = operator === "/" ? "division_by_zero" : "modulo_by_zero";
        const operation = operator === "/" ? "Division" : "Modulo";
        fail(code, `${operation} by zero is undefined.`);
      }

      if (operator === "*") value = ensureFinite(value * right);
      if (operator === "/") value = ensureFinite(value / right);
      if (operator === "%") value = ensureFinite(value % right);
    }

    return value;
  }

  parseUnary(depth) {
    this.assertDepth(depth);
    const operator = this.current()?.type;

    if (operator === "+" || operator === "-") {
      this.index += 1;
      const operand = this.parseUnary(depth + 1);
      return ensureFinite(operator === "-" ? -operand : operand);
    }

    return this.parsePower(depth);
  }

  parsePower(depth) {
    this.assertDepth(depth);
    const base = this.parsePrimary(depth);

    if (this.current()?.type !== "^") return base;

    this.index += 1;
    const exponent = this.parseUnary(depth + 1);
    return ensureFinite(base ** exponent);
  }

  parsePrimary(depth) {
    this.assertDepth(depth);
    const token = this.current();

    if (token?.type === "number") {
      this.index += 1;
      return token.value;
    }

    if (token?.type === "(") {
      this.index += 1;
      const value = this.parseAdditive(depth + 1);
      if (this.current()?.type !== ")") {
        fail("invalid_expression", "Expression contains an unmatched parenthesis.");
      }
      this.index += 1;
      return value;
    }

    fail("invalid_expression", "Expression is incomplete or malformed.");
  }
}

/**
 * Safely evaluate a numeric expression without executing user-provided code.
 *
 * Success: { ok: true, value: number }
 * Failure: { ok: false, error: { code: string, message: string } }
 */
export const calculateExpression = (expression) => {
  if (typeof expression !== "string") {
    return {
      ok: false,
      error: {
        code: "invalid_expression",
        message: "Expression must be a string.",
      },
    };
  }

  try {
    const value = new Parser(tokenize(expression)).parse();
    return { ok: true, value };
  } catch (error) {
    if (!(error instanceof CalculationFailure)) throw error;
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }
};
