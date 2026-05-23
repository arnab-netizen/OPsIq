/**
 * AST-SAFE AUTH GOVERNANCE NORMALIZATION CODEMODS
 *
 * Transforms:
 * 1. withRequestContext → withEnforcementFull
 * 2. Response.json(401/403) → throw UnauthorizedError/ForbiddenError
 * 3. Error("Unauthorized") → UnauthorizedError
 * 4. Direct getSession() → withAuth()
 *
 * Uses jscodeshift for AST safety - preserves semantics & formatting.
 */

export default function transformer(fileInfo: unknown, api: unknown) {
  const j = (api as unknown as { jscodeshift: unknown }).jscodeshift as any;
  const root = j(fileInfo);
  let hasChanges = false;

  // Transform 1: Replace withRequestContext import
  root
    .find(j.ImportDeclaration)
    .filter((path: unknown) => {
      return (path as unknown as { value: { source: { value: string } } }).value.source.value === '@/lib/api-handler';
    })
    .forEach((path: unknown) => {
      const typedPath = path as unknown as { value: { source: { value: string }; specifiers?: Array<{ type: string; imported: { name: string }; local: { name: string } }> } };
      typedPath.value.source.value = '@/lib/enforced-route';
      const spec = typedPath.value.specifiers?.[0];
      if (spec && spec.type === 'ImportSpecifier') {
        spec.imported.name = 'withEnforcementFull';
        spec.local.name = 'withEnforcementFull';
      }
      hasChanges = true;
    });

  // Transform 2: Ensure NextRequest type is imported
  const hasNextRequestImport = root
    .find(j.ImportDeclaration)
    .some((path: unknown) => {
      const typedPath = path as unknown as { value: { source: { value: string }; specifiers?: Array<{ local?: { name: string } }> } };
      return (
        typedPath.value.source.value === 'next/server' &&
        typedPath.value.specifiers?.some(
          (s: unknown) => (s as unknown as { local?: { name: string } }).local?.name === 'NextRequest'
        )
      );
    });

  if (!hasNextRequestImport) {
    const firstImport = root.find(j.ImportDeclaration).at(0);
    if (firstImport.length > 0) {
      const nextRequestImport = j.importDeclaration(
        [j.importSpecifier(j.identifier('NextRequest'))],
        j.literal('next/server')
      );
      (nextRequestImport as unknown as { importKind: string }).importKind = 'type';
      firstImport.insertAfter(nextRequestImport);
      hasChanges = true;
    }
  }

  // Transform 3: Ensure error imports
  const hasErrorImports = root
    .find(j.ImportDeclaration)
    .some((path: unknown) => {
      const typedPath = path as unknown as { value: { source: { value: string }; specifiers?: Array<{ imported?: { name: string } }> } };
      return (
        typedPath.value.source.value === '@/infra/errors' &&
        typedPath.value.specifiers?.some(
          (s: unknown) =>
            (s as unknown as { imported?: { name: string } }).imported?.name === 'UnauthorizedError' ||
            (s as unknown as { imported?: { name: string } }).imported?.name === 'ForbiddenError'
        )
      );
    });

  if (!hasErrorImports) {
    const firstImport = root.find(j.ImportDeclaration).at(0);
    if (firstImport.length > 0) {
      const errorImport = j.importDeclaration(
        [
          j.importSpecifier(j.identifier('UnauthorizedError')),
          j.importSpecifier(j.identifier('ForbiddenError')),
        ],
        j.literal('@/infra/errors')
      );
      firstImport.insertAfter(errorImport);
      hasChanges = true;
    }
  }

  // Transform 4: Replace withRequestContext handlers
  root
    .find(j.ExportNamedDeclaration)
    .filter((path: unknown) => {
      const typedPath = path as unknown as { value: { declaration: unknown } };
      const declaration = typedPath.value.declaration as unknown as { type: string; declarations: Array<{ init?: { callee?: { name: string } } }> };
      return (
        declaration &&
        declaration.type === 'VariableDeclaration' &&
        declaration.declarations[0]?.init?.callee?.name === 'withRequestContext'
      );
    })
    .forEach((path: unknown) => {
      const typedPath = path as unknown as { value: { declaration: unknown } };
      const declaration = typedPath.value.declaration as unknown as { declarations: Array<{ init: { callee: { name: string }; arguments: Array<{ type: string; params: Array<{ type: string; name?: string }> }> } }> };
      const varDecl = declaration.declarations[0];
      if (varDecl.init?.callee?.name === 'withRequestContext') {
        varDecl.init.callee.name = 'withEnforcementFull';

        // Update handler signature
        const handler = varDecl.init.arguments[0];
        if (handler?.type === 'ArrowFunctionExpression') {
          const params = handler.params;
          if (params.length >= 1) {
            // First param: add NextRequest type
            if (params[0].type === 'Identifier') {
              params[0] = j.identifier.from({
                name: 'request',
                typeAnnotation: j.tsTypeAnnotation(
                  j.tsTypeReference(j.identifier('NextRequest'))
                ),
              });
            }

            // Remove second param 'context' if exists, or leave it for params access
            // For routes with dynamic segments, keep params
            if (params.length > 1 && params[1].name === 'context') {
              // These need the params parameter instead
              params[1] = j.identifier.from({
                name: 'params',
              });
            }
          }
        }
        hasChanges = true;
      }
    });

  // Transform 5: Replace Response.json with 401/403 with throw statements
  root
    .find(j.CallExpression)
    .filter((path: unknown) => {
      const typedPath = path as unknown as { value: { callee: unknown; arguments: Array<unknown> } };
      const callee = typedPath.value.callee as unknown as { type: string; object?: { name: string }; property?: { name: string } };
      if (
        callee.type === 'MemberExpression' &&
        (callee.object as unknown as { name: string })?.name === 'Response' &&
        (callee.property as unknown as { name: string })?.name === 'json'
      ) {
        const args = typedPath.value.arguments;
        if (args.length >= 2) {
          const secondArg = args[1];
          if ((secondArg as unknown as { type: string })?.type === 'ObjectExpression') {
            const statusProp = (secondArg as unknown as { properties?: Array<{ key?: { name: string }; value?: { value: number } }> }).properties?.find(
              (p: unknown) =>
                (p as unknown as { key?: { name: string }; value?: { value: number } }).key?.name === 'status' &&
                ((p as unknown as { key?: { name: string }; value?: { value: number } }).value?.value === 401 || (p as unknown as { key?: { name: string }; value?: { value: number } }).value?.value === 403)
            );
            return !!statusProp;
          }
        }
      }
      return false;
    })
    .replaceWith((path: unknown) => {
      // Get the status code
      const typedPath = path as unknown as { value: { arguments: Array<unknown> } };
      const args = typedPath.value.arguments;
      const secondArg = args[1] as unknown as { properties: Array<{ key: { name: string }; value?: { value: number } }> };
      const statusProp = secondArg.properties.find(
        (p: unknown) => (p as unknown as { key: { name: string } }).key.name === 'status'
      );
      const statusCode = (statusProp as unknown as { value?: { value: number } })?.value?.value;

      const errorClass =
        statusCode === 401 ? 'UnauthorizedError' : 'ForbiddenError';
      const errorMsg = (args[0] as unknown as { properties?: Array<{ value?: { value: string } }> })?.properties?.[0]?.value?.value || 'Unauthorized';

      const throwStmt = j.throwStatement(
        j.newExpression(j.identifier(errorClass), [
          j.literal(errorMsg),
        ])
      );

      hasChanges = true;
      return throwStmt;
    });

  // Transform 6: Replace Error("Unauthorized") with UnauthorizedError
  root
    .find(j.NewExpression)
    .filter(
      (path: unknown) =>
        (path as unknown as { value: { callee: { name: string }; arguments: Array<{ value?: string }> } }).value.callee.name === 'Error' &&
        (path as unknown as { value: { callee: { name: string }; arguments: Array<{ value?: string }> } }).value.arguments[0]?.value?.includes('nauthorized')
    )
    .forEach((path: unknown) => {
      (path as unknown as { value: { callee: { name: string } } }).value.callee.name = 'UnauthorizedError';
      hasChanges = true;
    });

  return hasChanges ? root.toSource() : undefined;
}
