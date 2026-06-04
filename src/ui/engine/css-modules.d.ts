// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * TypeScript declaration for CSS Module imports.
 * Allows `import styles from './Foo.module.css'` with type safety.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
