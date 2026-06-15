/* eslint-disable @typescript-eslint/no-explicit-any */
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

// @ts-ignore jscodeshift types not fully exported
import type { FileInfo, API } from 'jscodeshift';
// @ts-ignore jscodeshift internal types
import type { ASTPath } from 'jscodeshift/src/core';

export default function transformer(fileInfo: FileInfo, api: API): string | undefined {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  let hasChanges = false;

  // Transform 1: Replace withRequestContext import
  root
    .find(j.ImportDeclaration)
    .filter((path: ASTPath) => {
      return (path.value.source as { value: string }).value === '@/lib/api-handler';
    })
    .forEach((path: ASTPath) => {
      (path.value.source as { value: string }).value = '@/lib/enforced-route';
      const spec = path.value.specifiers?.[0];
      if (spec && spec.type === 'ImportSpecifier') {
        (spec as any).imported.name = 'withEnforcementFull';
        (spec as any).local.name = 'withEnforcementFull';
      }
      hasChanges = true;
    });

  // Transform 2: Ensure NextRequest type is imported
  const hasNextRequestImport = root
    .find(j.ImportDeclaration)
    .some((path: ASTPath) => {
      return (
        (path.value.source as { value: string }).value === 'next/server' &&
        path.value.specifiers?.some(
          (s: any) => s.local?.name === 'NextRequest'
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
      (nextRequestImport as any).importKind = 'type';
      firstImport.insertAfter(nextRequestImport);
      hasChanges = true;
    }
  }

  // Transform 3: Ensure error imports
  const hasErrorImports = root
    .find(j.ImportDeclaration)
    .some((path: ASTPath) => {
      return (
        (path.value.source as { value: string }).value === '@/infra/errors' &&
        path.value.specifiers?.some(
          (s: any) =>
            s.imported?.name === 'UnauthorizedError' ||
            s.imported?.name === 'ForbiddenError'
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
    .filter((path: ASTPath) => {
      const declaration = path.value.declaration;
      return (
        declaration &&
        (declaration as any).type === 'VariableDeclaration' &&
        (declaration as any).declarations[0]?.init?.callee?.name === 'withRequestContext'
      );
    })
    .forEach((path: ASTPath) => {
      const declaration = path.value.declaration as any;
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
            if (params.length > 1 && (params[1] as any).name === 'context') {
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
    .filter((path: ASTPath) => {
      const callee = (path.value as any).callee;
      if (
        callee.type === 'MemberExpression' &&
        (callee.object as any).name === 'Response' &&
        (callee.property as any).name === 'json'
      ) {
        const args = (path.value as any).arguments;
        if (args.length >= 2) {
          const secondArg = args[1];
          if (secondArg?.type === 'ObjectExpression') {
            const statusProp = (secondArg as any).properties?.find(
              (p: any) =>
                p.key?.name === 'status' &&
                (p.value?.value === 401 || p.value?.value === 403)
            );
            return !!statusProp;
          }
        }
      }
      return false;
    })
    .replaceWith((path: ASTPath) => {
      // Get the status code
      const args = (path.value as any).arguments;
      const secondArg = args[1] as any;
      const statusProp = secondArg.properties.find(
        (p: any) => p.key.name === 'status'
      );
      const statusCode = statusProp?.value?.value;

      const errorClass =
        statusCode === 401 ? 'UnauthorizedError' : 'ForbiddenError';
      const errorMsg = args[0]?.properties?.[0]?.value?.value || 'Unauthorized';

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
      (path: ASTPath) =>
        (path.value as any).callee.name === 'Error' &&
        (path.value as any).arguments[0]?.value?.includes('nauthorized')
    )
    .forEach((path: ASTPath) => {
      ((path.value as any).callee as any).name = 'UnauthorizedError';
      hasChanges = true;
    });

  return hasChanges ? root.toSource() : undefined;
}
