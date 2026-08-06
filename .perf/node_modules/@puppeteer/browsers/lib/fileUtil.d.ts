/**
 * @license
 * Copyright 2023 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Logger } from './debug.js';
/**
 * @internal
 */
export declare function unpackArchive(archivePath: string, folderPath: string, logger?: Logger): Promise<void>;
/**
 * @internal
 */
export declare const internalConstantsForTesting: {
    xz: string;
    bzip2: string;
};
/**
 * @internal
 */
export declare function extractZipWithYauzl(archivePath: string, folderPath: string, _logger?: Logger): Promise<void>;
//# sourceMappingURL=fileUtil.d.ts.map