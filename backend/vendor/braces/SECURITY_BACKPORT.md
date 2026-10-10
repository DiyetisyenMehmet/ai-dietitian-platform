# Diewish braces security backport

Internal, non-published security backport of braces@3.0.3.

- Advisory: GHSA-vfj7-8cjw-p6xm
- CVE: CVE-2026-93687
- Reviewed patch source: FSDevelop/braces@28d440b5dd449dbf1fe6f3506cf94ecca4d02660
- Upstream PR: micromatch/braces#72
- Diewish local version: 3.0.4-diewish.backport.1 (synthetic local version; no upstream 3.0.4 release exists)

The patch bounds brace/parenthesis nesting in parsing and recursive AST
processing, includes the compatibility follow-ups reviewed on the upstream PR,
and rejects cyclic parent chains.

This package replaces only the vulnerable transitive development dependency.
Remove this backport when upstream parent packages eliminate braces or an
official patched release becomes available. Do not publish this package.

The included code remains under the upstream MIT license.
