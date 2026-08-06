/**
 * @license
 * Copyright 2023 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import { debuglog } from 'node:util';
export const DEBUG_PREFIXES = {
    cache: 'puppeteer:browsers:cache',
    fileUtil: 'puppeteer:browsers:fileUtil',
    install: 'puppeteer:browsers:install',
    launcher: 'puppeteer:browsers:launcher',
};
export const debug = (prefix) => {
    const log = debuglog(prefix);
    return log.enabled ? log : undefined;
};
//# sourceMappingURL=debug.js.map