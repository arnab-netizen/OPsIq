/**
 * PHASE G2: COMPILER HARDENING - ESLint Rules for Auth Enforcement
 *
 * STRICT RULES:
 * 1. NO new `any` types in auth contexts
 * 2. NO new unions of AuthContext|CanonicalAuthContext
 * 3. NO unsafe casts on auth objects
 * 4. NO legacy auth imports in routes using canonical wrapper
 *
 * These rules catch violations at compile time.
 */

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce strict auth type contracts (PHASE G2 compliance)",
      category: "Security",
      recommended: true,
    },
    messages: {
      noAnyInAuth: "PHASE G2 VIOLATION: any type in auth context (route: {{routeName}})",
      noAuthContextUnion: "PHASE G2 VIOLATION: union type mixing auth contexts (route: {{routeName}})",
      noUnsafeCast: "PHASE G2 VIOLATION: unsafe cast on auth object (route: {{routeName}})",
      noLegacyImportInCanonical: "PHASE G2 VIOLATION: legacy auth import in canonical route (route: {{routeName}})",
    },
  },

  create(context) {
    const filename = context.getFilename();
    const isRoute = filename.includes("/app/api/") && filename.endsWith("route.ts");
    const isCanonicalRoute = isRoute &&
      require("fs").readFileSync(filename, "utf-8").includes("withCanonicalEnforcement");

    return {
      // Rule 1: NO `any` type in auth contexts
      TSTypeAnnotation(node) {
        if (node.typeAnnotation.type === "TSAnyKeyword") {
          const parent = node.parent;
          if (parent && parent.id && parent.id.name &&
              (parent.id.name.includes("auth") || parent.id.name.includes("Context"))) {
            context.report({
              node,
              messageId: "noAnyInAuth",
              data: { routeName: filename },
            });
          }
        }
      },

      // Rule 2: NO unions mixing auth types.
      // Match type names EXACTLY (array membership), not as substrings — "CanonicalAuthContext" contains the
      // substring "AuthContext", so a substring check falsely flagged legitimate `CanonicalAuthContext | null`
      // signatures. Only a genuine union of BOTH distinct types (legacy `AuthContext` AND `CanonicalAuthContext`)
      // should be reported.
      TSUnionType(node) {
        const typeNames = node.types
          .filter(t => t.type === "TSTypeReference")
          .map(t => t.typeName.name);

        if (typeNames.includes("AuthContext") && typeNames.includes("CanonicalAuthContext")) {
          context.report({
            node,
            messageId: "noAuthContextUnion",
            data: { routeName: filename },
          });
        }
      },

      // Rule 3: NO unsafe casts on auth objects
      TSAsExpression(node) {
        if (node.expression && node.expression.name &&
            (node.expression.name.includes("auth") || node.expression.name.includes("context"))) {
          if (node.typeAnnotation.type === "TSAnyKeyword") {
            context.report({
              node,
              messageId: "noUnsafeCast",
              data: { routeName: filename },
            });
          }
        }
      },

      // Rule 4: NO legacy auth imports in canonical routes
      ImportDeclaration(node) {
        if (!isCanonicalRoute) return;

        const legacyAuthModules = [
          "@/lib/auth-guard",
          "@/lib/enforced-route",
        ];

        const sourcePath = node.source.value;
        if (legacyAuthModules.includes(sourcePath)) {
          context.report({
            node,
            messageId: "noLegacyImportInCanonical",
            data: { routeName: filename },
          });
        }
      },
    };
  },
};

module.exports = { rule };
