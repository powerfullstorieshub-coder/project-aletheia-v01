import assert from "node:assert/strict";
import test from "node:test";

import { calculateExpression } from "./calculation-engine.js";

const assertValue = (expression, expected) => {
  const result = calculateExpression(expression);
  assert.equal(result.ok, true, `${expression}: ${result.error?.message || "calculation failed"}`);
  assert.equal(result.value, expected, expression);
};

const assertFailure = (expression, expectedCode) => {
  const result = calculateExpression(expression);
  assert.equal(result.ok, false, expression);
  assert.equal(result.error.code, expectedCode, expression);
  assert.ok(result.error.message.length > 0, expression);
};

test("supports basic arithmetic and the required examples", () => {
  assertValue("2 + 3 * 4", 14);
  assertValue("(2 + 3) * 4", 20);
  assertValue("-5 + 2", -3);
  assertValue("10 / 4", 2.5);
  assertValue("2 ^ 3", 8);
  assertValue("18 - 7 + 2", 13);
  assertValue("6 * 7", 42);
});

test("applies precedence, parentheses, and left associativity", () => {
  assertValue("2 * (3 + 4) ^ 2", 98);
  assertValue("20 / 5 / 2", 2);
  assertValue("20 - 5 - 2", 13);
  assertValue("2 ^ 3 ^ 2", 512);
});

test("supports decimals, unary signs, and exponent precedence", () => {
  assertValue(".5 + 1.25", 1.75);
  assertValue("5. - 2.5", 2.5);
  assertValue("-(2 + 3)", -5);
  assertValue("(-2) ^ 2", 4);
  assertValue("-2 ^ 2", -4);
  assertValue("2 ^ -2", 0.25);
  assertValue("--5", 5);
});

test("supports modulo and whitespace", () => {
  assertValue("17 % 5", 2);
  assertValue("1 + 2 % 3 * 4", 9);
  assertValue("  ( 10 - 4 ) % 4  ", 2);
  assertValue("-5 % 2", -1);
});

test("preserves the JavaScript number result without arbitrary rounding", () => {
  const result = calculateExpression("0.1 + 0.2");
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.value - 0.3) < Number.EPSILON);
});

test("reports malformed expressions clearly", () => {
  for (const expression of [
    "",
    "   ",
    ".",
    "2 +",
    "2 + * 3",
    "(2 + 3",
    "2 + 3)",
    "1 2",
    "2(3)",
    "1.2.3",
  ]) {
    assertFailure(expression, "invalid_expression");
  }
});

test("reports division and modulo by zero", () => {
  assertFailure("10 / 0", "division_by_zero");
  assertFailure("10 / -0", "division_by_zero");
  assertFailure("10 % 0", "modulo_by_zero");
});

test("rejects unsupported syntax and code-like input without executing it", () => {
  globalThis.__vaerixonCalculationProbe = "untouched";

  for (const expression of [
    "Math.max(1, 2)",
    "globalThis.__vaerixonCalculationProbe = 'changed'",
    "process.exit(1)",
    "1; 2",
    "1e3",
    "2 ** 3",
    "2 × 3",
  ]) {
    const result = calculateExpression(expression);
    assert.equal(result.ok, false, expression);
    assert.ok(
      ["unsupported_syntax", "invalid_expression"].includes(result.error.code),
      `${expression}: ${result.error.code}`,
    );
  }

  assert.equal(globalThis.__vaerixonCalculationProbe, "untouched");
  delete globalThis.__vaerixonCalculationProbe;
});

test("rejects operations that do not produce a finite real result", () => {
  assertFailure("10 ^ 10000", "non_finite_result");
  assertFailure("(-1) ^ 0.5", "non_finite_result");
});

test("bounds input length, token count, and parser nesting", () => {
  assertFailure("1".repeat(257), "expression_too_long");
  assertFailure("1+".repeat(64) + "1", "expression_too_complex");
  assertFailure("(".repeat(65) + "1" + ")".repeat(65), "expression_too_complex");
});

test("rejects non-string input without coercing it", () => {
  assertFailure(null, "invalid_expression");
  assertFailure({ toString: () => "2 + 2" }, "invalid_expression");
});
