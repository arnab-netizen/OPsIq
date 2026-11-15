/**
 * Controlled inputs must capture the typed value when the event fires.
 *
 * React restores a controlled input's DOM value right after the event handler returns. A functional
 * state updater (`setX((x) => ({ ...x, f: e.target.value }))`) is not always run immediately: when the
 * component already has an update pending React defers it to the next render, by which time the DOM
 * node holds the old value again. The updater then stores the old value and the edit is silently lost
 * (this made cashflow-edit-ui.test.tsx time out intermittently). The fix is to read the value into a
 * local const in the handler and use that const inside the updater.
 */
import { describe, it, expect } from "vitest";
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");
const SKIP_DIRS = new Set(["node_modules", "generated", "__tests__", ".next"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function findLazyEventReads(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];
  const visit = (node: ts.Node, enclosing: ts.SignatureDeclaration[]) => {
    const isFn = ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);
    const stack = isFn ? [...enclosing, node] : enclosing;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^set[A-Z]/.test(node.expression.text) && node.arguments.length === 1) {
      const updater = node.arguments[0];
      if (ts.isArrowFunction(updater) || ts.isFunctionExpression(updater)) {
        const outerParams = new Set<string>();
        for (const f of enclosing) for (const p of f.parameters) if (ts.isIdentifier(p.name)) outerParams.add(p.name.text);
        for (const p of updater.parameters) if (ts.isIdentifier(p.name)) outerParams.delete(p.name.text);
        const scan = (n: ts.Node) => {
          if (
            ts.isPropertyAccessExpression(n) &&
            ts.isPropertyAccessExpression(n.expression) &&
            ts.isIdentifier(n.expression.expression) &&
            outerParams.has(n.expression.expression.text) &&
            /^(target|currentTarget)$/.test(n.expression.name.text)
          ) {
            const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
            hits.push(`${path.relative(SRC, file)}:${line} ${n.getText(sf)}`);
          }
          ts.forEachChild(n, scan);
        };
        scan(updater.body);
      }
    }
    ts.forEachChild(node, (c) => visit(c, stack));
  };
  visit(sf, []);
  return hits;
}

describe("controlled inputs capture the typed value eagerly", () => {
  it("detector flags a lazy read inside a functional setState updater", () => {
    const bad = `function C(){ const [d,setD]=useState({}); return <input onChange={(e) => setD((p) => ({ ...p, f: e.target.value }))} />; }`;
    expect(findLazyEventReads("bad.tsx", bad)).toHaveLength(1);
  });

  it("detector accepts a value captured before the updater", () => {
    const good = `function C(){ const [d,setD]=useState({}); return <input onChange={(e) => { const v = e.target.value; setD((p) => ({ ...p, f: v })); }} />; }`;
    expect(findLazyEventReads("good.tsx", good)).toHaveLength(0);
  });

  it("no source file reads e.target / e.currentTarget inside a functional setState updater", () => {
    const hits = walk(SRC).flatMap((f) => findLazyEventReads(f, fs.readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
