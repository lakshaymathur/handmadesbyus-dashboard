// Custom rule (CLAUDE.md): every server action goes through authedAction() from
// @/lib/auth/action, which requires login, validates input with Zod and sets audit fields.
//
// In a file starting with "use server", every runtime export must be
//   export const name = authedAction(schema, handler);
// Inline "use server" functions (which would skip the wrapper) are reported anywhere.

const WRAPPER = "authedAction";
const WRAPPER_MODULE = "@/lib/auth/action";

/** @param {import("estree").Node | null | undefined} node */
function isUseServer(node) {
  return (
    node?.type === "ExpressionStatement" &&
    node.expression.type === "Literal" &&
    node.expression.value === "use server"
  );
}

/**
 * Local names bound to the real wrapper: `import { authedAction } from "@/lib/auth/action"`
 * (or `as alias`). A same-named helper defined or imported elsewhere doesn't count.
 * @param {import("estree").Program["body"]} body
 */
function wrapperNames(body) {
  const names = new Set();
  for (const stmt of body) {
    if (
      stmt.type !== "ImportDeclaration" ||
      stmt.source.value !== WRAPPER_MODULE
    )
      continue;
    if (/** @type {any} */ (stmt).importKind === "type") continue;
    for (const spec of stmt.specifiers) {
      if (
        spec.type === "ImportSpecifier" &&
        /** @type {any} */ (spec).importKind !== "type" &&
        spec.imported.type === "Identifier" &&
        spec.imported.name === WRAPPER
      ) {
        names.add(spec.local.name);
      }
    }
  }
  return names;
}

/**
 * @param {import("estree").Node | null | undefined} init
 * @param {Set<string>} names
 */
function isWrapperCall(init, names) {
  return (
    init?.type === "CallExpression" &&
    init.callee.type === "Identifier" &&
    names.has(init.callee.name)
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require every server action to be wrapped in authedAction()",
    },
    schema: [],
    messages: {
      notWrapped:
        'Server actions must be `export const {{name}} = authedAction(schema, handler)`, with authedAction imported from "@/lib/auth/action".',
      noReexport:
        'Don\'t re-export from a "use server" file: export each action as `export const x = authedAction(...)` so the check can see it.',
      noDefault:
        "Server action files can't have a default export: use `export const x = authedAction(...)`.",
      inlineUseServer:
        'Inline "use server" functions skip authedAction(). Put the action in features/<name>/actions.ts and wrap it.',
    },
  },
  create(context) {
    const body = context.sourceCode.ast.body;
    // Directives come first; "use server" must be among them to make the file an action file.
    let isActionFile = false;
    for (const stmt of body) {
      if (
        stmt.type !== "ExpressionStatement" ||
        stmt.expression.type !== "Literal"
      )
        break;
      if (isUseServer(stmt)) isActionFile = true;
    }

    const wrappers = wrapperNames(body);

    /** @param {import("estree").Node & { body?: any }} fn */
    function checkInlineDirective(fn) {
      const first =
        fn.body?.type === "BlockStatement" ? fn.body.body[0] : undefined;
      if (isUseServer(first))
        context.report({ node: first, messageId: "inlineUseServer" });
    }

    return {
      FunctionDeclaration: checkInlineDirective,
      FunctionExpression: checkInlineDirective,
      ArrowFunctionExpression: checkInlineDirective,

      ExportDefaultDeclaration(node) {
        if (isActionFile) context.report({ node, messageId: "noDefault" });
      },
      ExportAllDeclaration(node) {
        if (isActionFile && node.exportKind !== "type") {
          context.report({ node, messageId: "noReexport" });
        }
      },
      ExportNamedDeclaration(node) {
        if (!isActionFile || node.exportKind === "type") return;
        const decl = node.declaration;
        if (!decl) {
          // `export { a, b }` or `export { a } from "./x"`; type-only specifiers are fine.
          const runtime = node.specifiers.filter(
            (s) => s.exportKind !== "type",
          );
          if (runtime.length > 0)
            context.report({ node, messageId: "noReexport" });
          return;
        }
        if (
          decl.type === "TSTypeAliasDeclaration" ||
          decl.type === "TSInterfaceDeclaration"
        ) {
          return;
        }
        if (decl.type === "VariableDeclaration" && decl.kind === "const") {
          for (const d of decl.declarations) {
            if (!isWrapperCall(d.init, wrappers)) {
              const name = d.id.type === "Identifier" ? d.id.name : "action";
              context.report({
                node: d,
                messageId: "notWrapped",
                data: { name },
              });
            }
          }
          return;
        }
        const name = decl.id?.name ?? "action";
        context.report({ node: decl, messageId: "notWrapped", data: { name } });
      },
    };
  },
};

export default rule;
