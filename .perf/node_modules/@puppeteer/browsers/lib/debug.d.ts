/**
 * @license
 * Copyright 2023 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const DEBUG_PREFIXES: {
    readonly cache: "puppeteer:browsers:cache";
    readonly fileUtil: "puppeteer:browsers:fileUtil";
    readonly install: "puppeteer:browsers:install";
    readonly launcher: "puppeteer:browsers:launcher";
};
export type LoggerFunction = (...args: unknown[]) => void;
export type Logger = (prefix: string) => LoggerFunction | undefined;
export declare const debug: (prefix: string) => LoggerFunction | undefined;
//# sourceMappingURL=debug.d.ts.map