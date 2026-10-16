/// Pure arithmetic calculation engine for the Universal School Calculator.
/// Evaluates expressions using the Shunting-Yard algorithm with zero `eval` or `new Function`
/// to strictly comply with Content Security Policy (CSP).

export function evaluateArithmetic(expr: string): number | null {
  if (!expr || !expr.trim()) return null;

  const sanitized = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/\s+/g, "");

  if (!sanitized) return null;

  // Tokenize into numbers, operators, and parentheses
  const tokens: string[] = [];
  let i = 0;
  while (i < sanitized.length) {
    const ch = sanitized[i];
    if (ch === "+" || ch === "*" || ch === "/" || ch === "(" || ch === ")") {
      tokens.push(ch);
      i++;
    } else if (ch === "-") {
      const prev = tokens[tokens.length - 1];
      // Check if it's a unary negative number
      if (tokens.length === 0 || ["+", "-", "*", "/", "("].includes(prev)) {
        i++;
        let numStr = "-";
        while (i < sanitized.length && ((sanitized[i] >= "0" && sanitized[i] <= "9") || sanitized[i] === ".")) {
          numStr += sanitized[i];
          i++;
        }
        if (numStr === "-") return null;
        if (i < sanitized.length && sanitized[i] === "%") {
          tokens.push(String(Number(numStr) / 100));
          i++;
        } else {
          tokens.push(numStr);
        }
      } else {
        tokens.push("-");
        i++;
      }
    } else if ((ch >= "0" && ch <= "9") || ch === ".") {
      let numStr = "";
      while (i < sanitized.length && ((sanitized[i] >= "0" && sanitized[i] <= "9") || sanitized[i] === ".")) {
        numStr += sanitized[i];
        i++;
      }
      if (i < sanitized.length && sanitized[i] === "%") {
        tokens.push(String(Number(numStr) / 100));
        i++;
      } else {
        tokens.push(numStr);
      }
    } else {
      // Invalid character (e.g. letters, malicious injection)
      return null;
    }
  }

  // Shunting-Yard algorithm (Dijkstra)
  const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const values: number[] = [];
  const ops: string[] = [];

  const applyOp = (): boolean => {
    if (ops.length === 0 || values.length < 2) return false;
    const op = ops.pop()!;
    const b = values.pop()!;
    const a = values.pop()!;
    let res = 0;
    if (op === "+") res = a + b;
    else if (op === "-") res = a - b;
    else if (op === "*") res = a * b;
    else if (op === "/") {
      if (b === 0) return false;
      res = a / b;
    }
    values.push(res);
    return true;
  };

  for (const token of tokens) {
    if (!isNaN(Number(token))) {
      values.push(Number(token));
    } else if (token === "(") {
      ops.push(token);
    } else if (token === ")") {
      while (ops.length > 0 && ops[ops.length - 1] !== "(") {
        if (!applyOp()) return null;
      }
      if (ops.length === 0 || ops[ops.length - 1] !== "(") return null;
      ops.pop(); // Pop '('
    } else if (["+", "-", "*", "/"].includes(token)) {
      while (
        ops.length > 0 &&
        ops[ops.length - 1] !== "(" &&
        (precedence[ops[ops.length - 1]] ?? 0) >= (precedence[token] ?? 0)
      ) {
        if (!applyOp()) return null;
      }
      ops.push(token);
    } else {
      return null;
    }
  }

  while (ops.length > 0) {
    if (ops[ops.length - 1] === "(" || ops[ops.length - 1] === ")") return null;
    if (!applyOp()) return null;
  }

  if (values.length !== 1 || !Number.isFinite(values[0])) return null;
  return values[0];
}

export function formatCalculation(val: number): string {
  if (Math.abs(val) >= 1e12 || (Math.abs(val) > 0 && Math.abs(val) < 1e-6)) {
    return val.toExponential(4);
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(val);
}

export function applyDiscountWaiver(amount: number, discountPercent: number): number {
  if (discountPercent < 0 || discountPercent > 100) return amount;
  return amount * (1 - discountPercent / 100);
}

export function applyTaxSurcharge(amount: number, surchargePercent: number): number {
  if (surchargePercent < 0) return amount;
  return amount * (1 + surchargePercent / 100);
}
