// Copyright (c) 2026 keigoly. All rights reserved.
// Licensed under the Business Source License 1.1

const DEBUG = true;

export function log(...args: unknown[]) { if (DEBUG) console.log('[NJ]', ...args); }
export function warn(...args: unknown[]) { console.warn('[NJ]', ...args); }
