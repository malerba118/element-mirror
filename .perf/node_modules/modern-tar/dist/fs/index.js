import { a as normalizeBody, c as LINK, l as SYMLINK, n as createUnpacker, o as DIRECTORY, r as transformHeader, s as FILE, t as createTarPacker } from "../packer-BtsuoKCV.js";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { cpus } from "node:os";
import * as path from "node:path";
import { Readable, Writable } from "node:stream";
//#region src/fs/path.ts
function validateBounds(targetPath, destDir, errorMessage) {
	const target = path.resolve(targetPath);
	const dest = path.resolve(destDir);
	if (target !== dest && !target.startsWith(dest + path.sep)) throw new Error(errorMessage);
}
const win32Reserved = {
	":": "",
	"<": "",
	">": "",
	"|": "",
	"?": "",
	"*": "",
	"\"": ""
};
function normalizeName(name) {
	const path = name.replace(/\\/g, "/");
	if (path.split("/").includes("..") || /^[a-zA-Z]:\.\./.test(path)) throw new Error(`${name} points outside extraction directory`);
	let relative = path;
	if (/^[a-zA-Z]:/.test(relative)) relative = relative.replace(/^[a-zA-Z]:[/\\]?/, "");
	else if (relative.startsWith("/")) relative = relative.replace(/^\/+/, "");
	if (process.platform === "win32") return relative.replace(/[<>:"|?*]/g, (char) => win32Reserved[char]);
	return relative;
}
const normalizeHeaderName = (s) => normalizeName(s.replace(/\/+$/, ""));
//#endregion
//#region src/fs/pack.ts
const BIGINT_STAT = { bigint: true };
const WITH_FILE_TYPES = { withFileTypes: true };
const packTarSources = packTar;
function packTar(sources, options = {}) {
	const stream = new Readable({ read() {} });
	(async () => {
		const packer = createTarPacker((chunk) => stream.push(Buffer.from(chunk)), stream.destroy.bind(stream), () => stream.push(null));
		const { dereference = false, filter, map, baseDir, concurrency = cpus().length || 8 } = options;
		let directoryPath;
		let realBaseDir;
		let jobs;
		if (typeof sources === "string") {
			const source = path.resolve(sources);
			directoryPath = source;
			const before = await fsp.stat(source, BIGINT_STAT);
			const entries = await fsp.readdir(source, WITH_FILE_TYPES);
			const after = await fsp.stat(source, BIGINT_STAT);
			jobs = before.dev === after.dev && before.ino === after.ino ? entries.map((entry) => ({
				type: entry.isDirectory() ? DIRECTORY : FILE,
				source: path.join(source, entry.name),
				target: entry.name
			})) : [];
		} else jobs = sources.map((source) => ({ ...source }));
		const results = /* @__PURE__ */ new Map();
		const resolvers = /* @__PURE__ */ new Map();
		const seenInodes = /* @__PURE__ */ new Map();
		let jobIndex = 0;
		let writeIndex = 0;
		let activeWorkers = 0;
		let allJobsQueued = false;
		const writer = async () => {
			const readBufferSmall = Buffer.alloc(64 * 1024);
			let readBufferLarge = null;
			while (true) {
				if (stream.destroyed) return;
				if (allJobsQueued && writeIndex >= jobs.length) break;
				if (!results.has(writeIndex)) {
					await new Promise((resolve) => resolvers.set(writeIndex, resolve));
					continue;
				}
				const result = results.get(writeIndex);
				results.delete(writeIndex);
				resolvers.delete(writeIndex);
				if (!result) {
					writeIndex++;
					continue;
				}
				packer.add(result.header);
				if (result.body) if (result.body instanceof Uint8Array) {
					if (result.body.length > 0) packer.write(result.body);
				} else if (result.body instanceof Readable || result.body instanceof ReadableStream) try {
					for await (const chunk of result.body) {
						if (stream.destroyed) break;
						packer.write(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk));
					}
				} catch (error) {
					stream.destroy(error);
					return;
				}
				else {
					const { handle, size } = result.body;
					const readBuffer = size > 1048576 ? readBufferLarge ??= Buffer.alloc(512 * 1024) : readBufferSmall;
					try {
						let bytesLeft = size;
						while (bytesLeft > 0 && !stream.destroyed) {
							const toRead = Math.min(bytesLeft, readBuffer.length);
							const { bytesRead } = await handle.read(readBuffer, 0, toRead, null);
							if (bytesRead === 0) break;
							packer.write(readBuffer.subarray(0, bytesRead));
							bytesLeft -= bytesRead;
						}
					} catch (error) {
						stream.destroy(error);
						return;
					} finally {
						await handle.close();
					}
				}
				packer.endEntry();
				writeIndex++;
			}
		};
		const controller = () => {
			if (stream.destroyed || allJobsQueued) return;
			while (activeWorkers < concurrency && jobIndex < jobs.length) {
				activeWorkers++;
				const currentIndex = jobIndex++;
				processJob(jobs[currentIndex], currentIndex).catch(stream.destroy.bind(stream)).finally(() => {
					activeWorkers--;
					controller();
				});
			}
			if (activeWorkers === 0 && jobIndex >= jobs.length) {
				allJobsQueued = true;
				resolvers.get(writeIndex)?.();
			}
		};
		const processJob = async (job, index) => {
			let jobResult = null;
			const target = normalizeName(job.target);
			try {
				if (job.type === "content" || job.type === "stream") {
					let body;
					let size;
					const isDir = target.endsWith("/");
					if (job.type === "stream") {
						if (!isDir && job.size <= 0 || isDir && job.size !== 0) throw new Error(isDir ? "Streams for directories must have size 0." : "Streams require a positive size.");
						size = job.size;
						body = job.content;
					} else {
						const content = await normalizeBody(job.content);
						size = content.length;
						body = content;
					}
					const stat = {
						size: isDir ? 0 : size,
						isFile: () => !isDir,
						isDirectory: () => isDir,
						isSymbolicLink: () => false,
						mode: job.mode,
						mtime: job.mtime ?? /* @__PURE__ */ new Date(),
						uid: job.uid ?? 0,
						gid: job.gid ?? 0
					};
					if (filter && !filter(target, stat)) return;
					let header = {
						name: target,
						type: isDir ? DIRECTORY : FILE,
						size: isDir ? 0 : size,
						mode: stat.mode,
						mtime: stat.mtime,
						uid: stat.uid,
						gid: stat.gid,
						uname: job.uname,
						gname: job.gname
					};
					if (map) header = map(header);
					jobResult = {
						header,
						body: isDir ? void 0 : body
					};
					return;
				}
				let source = job.source;
				let stat = await fsp.lstat(source, BIGINT_STAT);
				if (dereference && stat.isSymbolicLink()) {
					source = await fsp.realpath(source);
					const relativeToBase = path.relative(realBaseDir ??= await fsp.realpath(baseDir ?? directoryPath ?? process.cwd()), source);
					if (relativeToBase === ".." || relativeToBase.startsWith(".." + path.sep) || path.isAbsolute(relativeToBase)) return;
					stat = await fsp.lstat(source, BIGINT_STAT);
					if (stat.isSymbolicLink()) return;
				}
				if (filter && !filter(job.source, stat)) return;
				let header = {
					name: target,
					size: 0,
					mode: job.mode ?? Number(stat.mode),
					mtime: job.mtime ?? stat.mtime,
					uid: job.uid ?? Number(stat.uid),
					gid: job.gid ?? Number(stat.gid),
					uname: job.uname,
					gname: job.gname,
					type: FILE
				};
				let body;
				if (stat.isDirectory()) {
					header.type = DIRECTORY;
					header.name = target.endsWith("/") ? target : `${target}/`;
					try {
						const entries = await fsp.readdir(source, WITH_FILE_TYPES);
						const after = await fsp.lstat(source, BIGINT_STAT);
						if (!after.isDirectory() || stat.dev !== after.dev || stat.ino !== after.ino) return;
						for (const d of entries) jobs.push({
							type: d.isDirectory() ? DIRECTORY : FILE,
							source: path.join(source, d.name),
							target: `${header.name}${d.name}`
						});
					} catch {}
				} else if (stat.isSymbolicLink()) {
					header.type = SYMLINK;
					header.linkname = await fsp.readlink(job.source);
				} else if (stat.isFile()) {
					header.size = Number(stat.size);
					let handleToClose;
					let linkname = stat.nlink > 1 ? seenInodes.get(stat.ino) : void 0;
					try {
						let after;
						try {
							if (header.size === 0 || linkname !== void 0) after = await fsp.lstat(source, BIGINT_STAT);
							else handleToClose = await fsp.open(source, fs.constants.O_NOFOLLOW ?? 0);
						} catch (error) {
							const code = error.code;
							if (code === "ELOOP" || code === "ENOENT") return;
							throw error;
						}
						if (after) {
							if (!after.isFile() || stat.dev !== after.dev || stat.ino !== after.ino) return;
						} else {
							const { dev, ino } = await handleToClose.stat(BIGINT_STAT);
							if (stat.dev !== dev || stat.ino !== ino) return;
						}
						if (stat.nlink > 1) linkname = seenInodes.get(stat.ino);
						if (linkname !== void 0) {
							header.type = LINK;
							header.linkname = linkname;
							header.size = 0;
						} else {
							if (stat.nlink > 1) seenInodes.set(stat.ino, target);
							if (header.size > 0) {
								const handle = handleToClose;
								if (header.size < 32 * 1024) {
									const buffer = Buffer.allocUnsafe(header.size);
									let offset = 0;
									while (offset < buffer.length) {
										const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
										if (bytesRead === 0) break;
										offset += bytesRead;
									}
									body = offset === buffer.length ? buffer : buffer.subarray(0, offset);
								} else {
									body = {
										handle,
										size: header.size
									};
									handleToClose = void 0;
								}
							}
						}
					} finally {
						await handleToClose?.close();
					}
				} else return;
				if (map) header = map(header);
				jobResult = {
					header,
					body
				};
			} finally {
				results.set(index, jobResult);
				resolvers.get(index)?.();
			}
		};
		controller();
		await writer();
		if (!stream.destroyed) packer.finalize();
	})().catch((error) => stream.destroy(error));
	return stream;
}
//#endregion
//#region src/fs/concurrency.ts
const createOperationQueue = (concurrency) => {
	let active = 0;
	const tasks = [];
	let head = 0;
	let idle = null;
	let resolveIdle = null;
	const ensureIdle = () => idle ??= new Promise((resolve) => resolveIdle = resolve);
	const flush = () => {
		while (active < concurrency && head < tasks.length) {
			const task = tasks[head++];
			active++;
			task().finally(() => {
				active--;
				flush();
			});
		}
		if (head === tasks.length) {
			tasks.length = 0;
			head = 0;
			if (active === 0 && resolveIdle) {
				resolveIdle();
				idle = null;
				resolveIdle = null;
			}
		}
	};
	return {
add(op) {
			const wasIdle = active === 0 && head === tasks.length;
			return new Promise((resolve, reject) => {
				tasks.push(() => Promise.resolve().then(op).then(resolve, reject));
				if (wasIdle) ensureIdle();
				flush();
			});
		},
		onIdle() {
			return active === 0 && head === tasks.length ? Promise.resolve() : ensureIdle();
		}
	};
};
//#endregion
//#region src/fs/file-sink.ts
const BATCH_BYTES = 256 * 1024;
const CREATE_FLAGS = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW ?? 0) | fs.constants.O_EXCL;
const STATE_OPENING = 1;
const STATE_OPEN = 2;
const STATE_CLOSED = 3;
const STATE_FAILED = 4;
const DRAINED_PROMISE = Promise.resolve();
function createFileSink(path, { mode = 438, mtime } = {}) {
	let state = STATE_OPENING;
	let flushing = false;
	let fd = null;
	let queue = [];
	let spare = [];
	let bytes = 0;
	let storedError = null;
	let endPromise = null;
	let endResolve = null;
	let endReject = null;
	const waitResolves = [];
	const waitRejects = [];
	const settleWaiters = () => {
		if (waitResolves.length === 0) return;
		for (let i = 0; i < waitResolves.length; i++) waitResolves[i]();
		waitResolves.length = 0;
		waitRejects.length = 0;
	};
	const failWaiters = (error) => {
		if (waitRejects.length === 0) return;
		for (let i = 0; i < waitRejects.length; i++) waitRejects[i](error);
		waitRejects.length = 0;
		waitResolves.length = 0;
	};
	const resetBuffers = () => {
		bytes = 0;
		queue.length = 0;
		spare.length = 0;
	};
	const finish = () => {
		state = STATE_CLOSED;
		endResolve?.();
		settleWaiters();
	};
	const swapQueues = () => {
		const current = queue;
		queue = spare;
		spare = current;
		queue.length = 0;
		return current;
	};
	const fail = (error) => {
		if (storedError) return;
		storedError = error;
		state = STATE_FAILED;
		resetBuffers();
		flushing = false;
		const fdToClose = fd;
		fd = null;
		if (fdToClose !== null) fs.ftruncate(fdToClose, 0, () => fs.close(fdToClose));
		endReject?.(error);
		failWaiters(error);
	};
	const close = () => {
		if (fd === null) {
			finish();
			return;
		}
		const fdToClose = fd;
		fd = null;
		if (mtime) fs.futimes(fdToClose, mtime, mtime, (err) => {
			if (err) return fail(err);
			fs.close(fdToClose, (closeErr) => {
				if (closeErr) fail(closeErr);
				else finish();
			});
		});
		else fs.close(fdToClose, (err) => {
			if (err) fail(err);
			else finish();
		});
	};
	const flush = () => {
		if (flushing || queue.length === 0 || state !== STATE_OPEN) return;
		flushing = true;
		const bufs = swapQueues();
		const onDone = (err, written = 0) => {
			if (err) return fail(err);
			flushing = false;
			bytes -= written;
			spare.length = 0;
			if (bytes < BATCH_BYTES) settleWaiters();
			if (queue.length > 0) flush();
			else if (endResolve) close();
		};
		if (bufs.length === 1) {
			const buf = bufs[0];
			fs.write(fd, buf, 0, buf.length, null, onDone);
		} else fs.writev(fd, bufs, onDone);
	};
	const onOpen = (err, openFd) => {
		if (err) return fail(err);
		if (state === STATE_CLOSED || state === STATE_FAILED) {
			fs.close(openFd);
			return;
		}
		fd = openFd;
		state = STATE_OPEN;
		if (endResolve) if (queue.length > 0) flush();
		else close();
		else if (bytes >= BATCH_BYTES && !flushing) flush();
		else settleWaiters();
	};
	const write = (chunk) => {
		if (storedError || state >= STATE_CLOSED || endResolve) return false;
		const buf = Buffer.isBuffer(chunk) ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength) : Buffer.from(chunk);
		if (buf.length === 0) return bytes < BATCH_BYTES;
		queue.push(buf);
		bytes += buf.length;
		if (state === STATE_OPEN && !flushing && bytes >= BATCH_BYTES) flush();
		return bytes < BATCH_BYTES;
	};
	const waitDrain = () => {
		if (state === STATE_OPENING || state === STATE_OPEN && bytes >= BATCH_BYTES) return new Promise((resolve, reject) => {
			waitResolves.push(resolve);
			waitRejects.push(reject);
		});
		return DRAINED_PROMISE;
	};
	const end = () => {
		if (state >= STATE_CLOSED) return DRAINED_PROMISE;
		if (storedError) return Promise.reject(storedError);
		if (endPromise) return endPromise;
		endPromise = new Promise((resolve, reject) => {
			endResolve = resolve;
			endReject = reject;
			if (state === STATE_OPEN && !flushing) if (queue.length > 0) flush();
			else close();
		});
		return endPromise;
	};
	const destroy = (error) => {
		if (error) {
			fail(error);
			return;
		}
		if (state >= STATE_CLOSED || storedError) return;
		resetBuffers();
		flushing = false;
		if (fd !== null) {
			const fdToClose = fd;
			fd = null;
			fs.close(fdToClose);
		}
		finish();
	};
	fs.open(path, CREATE_FLAGS, mode, (err, openFd) => {
		if (!err || err.code !== "EEXIST") return onOpen(err, openFd);
		fs.rm(path, { force: true }, (rmErr) => {
			if (rmErr) return fail(rmErr);
			fs.open(path, CREATE_FLAGS, mode, onOpen);
		});
	});
	return {
		write,
		end,
		destroy,
		waitDrain
	};
}
//#endregion
//#region src/fs/cache.ts
const createCache = () => {
	const m = /* @__PURE__ */ new Map();
	return {
get(k) {
			const v = m.get(k);
			if (m.delete(k)) m.set(k, v);
			return v;
		},
set(k, v) {
			if (m.set(k, v).size > 1e4) m.delete(m.keys().next().value);
		},
		clear() {
			m.clear();
		}
	};
};
//#endregion
//#region src/fs/path-cache.ts
const ENOENT = "ENOENT";
const MAX_SYMLINKS = 64;
const linkSep = process.platform === "win32" ? /[/\\]/ : "/";
const linkParts = (linkname) => linkname.split(linkSep).filter((part) => part && part !== ".");
const createPathCache = (destDirPath, options, opQueue, concurrency) => {
	const { maxDepth = 1024, dmode } = options;
	const dirPromises = createCache();
	const pathConflicts = /* @__PURE__ */ new Map();
	const deferredLinks = [];
	let symlinks;
	const realDirCache = createCache();
	const initializeDestDir = async (destDirPath) => {
		const symbolic = path.resolve(destDirPath);
		try {
			await fsp.mkdir(symbolic, { recursive: true });
		} catch (err) {
			if (err.code === ENOENT) {
				const parentDir = path.dirname(symbolic);
				if (parentDir === symbolic) throw err;
				await fsp.mkdir(parentDir, { recursive: true });
				await fsp.mkdir(symbolic, { recursive: true });
			} else throw err;
		}
		try {
			return {
				symbolic,
				real: await fsp.realpath(symbolic)
			};
		} catch (err) {
			if (err.code === ENOENT) return {
				symbolic,
				real: symbolic
			};
			throw err;
		}
	};
	const destDirPromise = initializeDestDir(destDirPath);
	destDirPromise.catch(() => {});
	const getRealDir = async (dirPath, errorMessage) => {
		const destDir = await destDirPromise;
		if (dirPath === destDir.symbolic) return destDir.real;
		let promise = realDirCache.get(dirPath);
		if (!promise) {
			promise = fsp.realpath(dirPath).then((realPath) => {
				validateBounds(realPath, destDir.real, errorMessage);
				return realPath;
			});
			realDirCache.set(dirPath, promise);
		}
		return promise;
	};
	const prepareDirectory = async (dirPath, mode) => {
		let promise = dirPromises.get(dirPath);
		if (promise) return promise;
		promise = (async () => {
			if (dirPath === (await destDirPromise).symbolic) return;
			await prepareDirectory(path.dirname(dirPath));
			try {
				const stat = await fsp.lstat(dirPath);
				if (stat.isDirectory()) return;
				if (stat.isSymbolicLink()) try {
					const realPath = await getRealDir(dirPath, `Symlink "${dirPath}" points outside the extraction directory.`);
					if ((await fsp.stat(realPath)).isDirectory()) return;
				} catch (err) {
					if (err.code === ENOENT) throw new Error(`Symlink "${dirPath}" points outside the extraction directory.`);
					throw err;
				}
				throw new Error(`"${dirPath}" is not a valid directory component.`);
			} catch (err) {
				if (err.code === ENOENT) {
					await fsp.mkdir(dirPath, { mode: mode ?? options.dmode });
					return;
				}
				throw err;
			}
		})();
		dirPromises.set(dirPath, promise);
		return promise;
	};
	return {
async ready() {
			await destDirPromise;
		},
async preparePath(header) {
			const { name, linkname, type, mode, mtime } = header;
			const normalizedName = normalizeHeaderName(name);
			const destDir = await destDirPromise;
			const outPath = path.join(destDir.symbolic, normalizedName);
			if (maxDepth !== Infinity) {
				let depth = 1;
				for (const char of normalizedName) if (char === "/" && ++depth > maxDepth) throw new Error("Tar exceeds max specified depth.");
			}
			const prevOp = pathConflicts.get(normalizedName);
			if (prevOp) {
				if (prevOp === "directory" && type !== "directory" || prevOp !== "directory" && type === "directory") throw new Error(`Path conflict ${type} over existing ${prevOp} at "${name}"`);
				return;
			}
			const parentDir = path.dirname(outPath);
			switch (type) {
				case DIRECTORY: {
					pathConflicts.set(normalizedName, DIRECTORY);
					const safeMode = mode ? mode & 511 : void 0;
					await prepareDirectory(outPath, dmode ?? safeMode);
					if (mtime) await fsp.lutimes(outPath, mtime, mtime).catch(() => {});
					return;
				}
				case FILE:
					pathConflicts.set(normalizedName, FILE);
					await prepareDirectory(parentDir);
					return path.join(await getRealDir(parentDir, `File "${name}" points outside the extraction directory.`), path.basename(outPath));
				case SYMLINK: {
					pathConflicts.set(normalizedName, SYMLINK);
					if (!linkname) return;
					validateBounds(path.resolve(parentDir, linkname), destDir.symbolic, `Symlink "${linkname}" points outside the extraction directory.`);
					await prepareDirectory(parentDir);
					const realParentDir = await fsp.realpath(parentDir);
					validateBounds(realParentDir, destDir.real, "Symlink parent changed.");
					validateBounds(path.resolve(realParentDir, linkname), destDir.real, `Symlink "${linkname}" points outside the extraction directory.`);
					const realOutPath = path.join(realParentDir, path.basename(outPath));
					try {
						await fsp.symlink(linkname, realOutPath);
					} catch (err) {
						if (err.code !== "EEXIST") throw err;
						await fsp.rm(realOutPath, { force: true });
						if (await fsp.realpath(parentDir) !== realParentDir) throw new Error("Symlink parent changed.");
						await fsp.symlink(linkname, realOutPath);
					}
					(symlinks ??= []).push([normalizedName, linkname]);
					dirPromises.clear();
					realDirCache.clear();
					if (mtime) await fsp.lutimes(outPath, mtime, mtime).catch(() => {});
					return;
				}
				case LINK: {
					pathConflicts.set(normalizedName, LINK);
					if (!linkname) return;
					if (path.isAbsolute(linkname)) throw new Error(`Hardlink "${linkname}" points outside the extraction directory.`);
					const linkTarget = path.join(destDir.symbolic, linkname);
					validateBounds(linkTarget, destDir.symbolic, `Hardlink "${linkname}" points outside the extraction directory.`);
					await prepareDirectory(parentDir);
					if (linkTarget !== outPath) deferredLinks.push({
						linkTarget,
						outPath
					});
					return;
				}
				default: return;
			}
		},
async checkSymlinks() {
			if (!symlinks) return;
			const { symbolic: dest, real } = await destDirPromise;
			const realPrefix = real + path.sep;
			const root = path.parse(real).root;
			const depth = linkParts(real.slice(root.length)).length;
			const targetParts = (linkname, resolvedParts, message) => {
				if (!path.isAbsolute(linkname)) return linkParts(linkname);
				validateBounds(linkname, real, message);
				resolvedParts.length = 0;
				const parts = linkParts(linkname.slice(root.length));
				parts.splice(0, depth);
				return parts;
			};
			const getSymlinkError = async ([name, storedLinkname]) => {
				const outPath = path.join(dest, name);
				try {
					try {
						const resolved = await fsp.realpath(outPath);
						if (resolved !== real && !resolved.startsWith(realPrefix)) throw new Error(`Symlink "${storedLinkname}" points outside the extraction directory.`);
						return;
					} catch (err) {
						if (err.code !== ENOENT) throw err;
					}
					if (!(await fsp.lstat(outPath)).isSymbolicLink()) return;
					const linkname = await fsp.readlink(outPath);
					const message = `Symlink "${linkname}" points outside the extraction directory.`;
					const realParent = await fsp.realpath(path.dirname(outPath));
					validateBounds(realParent, real, message);
					const resolvedParts = linkParts(path.relative(real, realParent));
					const pendingParts = targetParts(linkname, resolvedParts, message);
					let followedSymlinks = 0;
					for (let i = 0; i < pendingParts.length; i++) {
						const part = pendingParts[i];
						if (part === "..") {
							if (!resolvedParts.length) throw new Error(message);
							resolvedParts.pop();
							continue;
						}
						resolvedParts.push(part);
						const nextPath = path.join(real, ...resolvedParts);
						let nextStat;
						try {
							nextStat = await fsp.lstat(nextPath);
						} catch (err) {
							if (err.code === ENOENT) continue;
							throw err;
						}
						if (!nextStat.isSymbolicLink()) continue;
						if (++followedSymlinks > MAX_SYMLINKS) throw new Error(message);
						const nextLink = await fsp.readlink(nextPath);
						resolvedParts.pop();
						pendingParts.splice(i + 1, 0, ...targetParts(nextLink, resolvedParts, message));
					}
				} catch (err) {
					if (err.code !== ENOENT) return err;
				}
			};
			for (let start = 0; start < symlinks.length; start += concurrency) {
				const batch = symlinks.slice(start, start + concurrency);
				const errors = await Promise.all(batch.map((symlink) => opQueue.add(() => getSymlinkError(symlink))));
				for (const [i, error] of errors.entries()) {
					if (error === void 0) continue;
					await fsp.rm(path.join(dest, batch[i][0]), { force: true });
					throw error;
				}
			}
		},
async applyLinks() {
			const destRoot = (await destDirPromise).real;
			for (const { linkTarget, outPath } of deferredLinks) try {
				const realTargetDir = await fsp.realpath(path.dirname(linkTarget));
				validateBounds(realTargetDir, destRoot, `Hardlink "${linkTarget}" points outside the extraction directory.`);
				const realTarget = path.join(realTargetDir, path.basename(linkTarget));
				const [targetResult, outDirResult] = await Promise.allSettled([opQueue.add(() => fsp.lstat(realTarget)), opQueue.add(() => fsp.realpath(path.dirname(outPath)))]);
				if (targetResult.status === "rejected") throw targetResult.reason;
				const targetStat = targetResult.value;
				if (targetStat.isSymbolicLink()) throw new Error(`Hardlink "${linkTarget}" is a symlink.`);
				if (outDirResult.status === "rejected") throw outDirResult.reason;
				const realOutDir = outDirResult.value;
				validateBounds(realOutDir, destRoot, `Hardlink "${outPath}" points outside the extraction directory.`);
				const realOutPath = path.join(realOutDir, path.basename(outPath));
				try {
					await fsp.link(realTarget, realOutPath);
				} catch (err) {
					const code = err.code;
					if (code !== "EEXIST" && code !== ENOENT) throw err;
					try {
						const outStat = await fsp.lstat(realOutPath);
						if (outStat.dev === targetStat.dev && outStat.ino === targetStat.ino) continue;
						await fsp.rm(realOutPath, { force: true });
					} catch (err) {
						if (err.code !== ENOENT) throw err;
					}
					await fsp.link(realTarget, realOutPath);
				}
				const linkStat = await fsp.lstat(realOutPath);
				if (linkStat.dev !== targetStat.dev || linkStat.ino !== targetStat.ino) {
					await fsp.rm(realOutPath, { force: true });
					throw new Error(`Hardlink target "${linkTarget}" changed during creation for link at "${outPath}".`);
				}
			} catch (err) {
				if (err.code === ENOENT) throw new Error(`Hardlink target "${linkTarget}" does not exist for link at "${outPath}".`);
				throw err;
			}
		}
	};
};
//#endregion
//#region src/fs/unpack.ts
function unpackTar(directoryPath, options = {}) {
	const unpacker = createUnpacker(options);
	const concurrency = options.concurrency || cpus().length || 8;
	const opQueue = createOperationQueue(concurrency);
	const pathCache = createPathCache(directoryPath, options, opQueue, concurrency);
	let currentFileStream = null;
	let currentWriteCallback = null;
	let queuedError = null;
	const onQueuedError = (err) => {
		queuedError ??= err;
		if (!writable.destroyed) writable.destroy(err);
	};
	const writable = new Writable({
		async write(chunk, _, cb) {
			const pendingFileOpens = [];
			let writeError;
			try {
				unpacker.write(chunk);
				if (unpacker.isEntryActive()) {
					if (currentFileStream && currentWriteCallback) {
						let needsDrain = false;
						const writeCallback = currentWriteCallback;
						while (!unpacker.isBodyComplete()) {
							needsDrain = false;
							if (unpacker.streamBody(writeCallback) === 0) if (needsDrain) await currentFileStream.waitDrain();
							else return;
						}
						while (!unpacker.skipPadding()) return;
						const streamToClose = currentFileStream;
						if (streamToClose) opQueue.add(() => streamToClose.end()).catch(onQueuedError);
						currentFileStream = null;
						currentWriteCallback = null;
					} else if (!unpacker.skipEntry()) return;
				}
				while (true) {
					const header = unpacker.readHeader();
					if (header === void 0 || header === null) return;
					const transformedHeader = transformHeader(header, options);
					if (!transformedHeader) {
						if (!unpacker.skipEntry()) return;
						continue;
					}
					const outPath = await opQueue.add(() => pathCache.preparePath(transformedHeader));
					if (outPath) {
						const safeMode = transformedHeader.mode ? transformedHeader.mode & 511 : void 0;
						const fileStream = createFileSink(outPath, {
							mode: options.fmode ?? safeMode,
							mtime: transformedHeader.mtime ?? void 0
						});
						pendingFileOpens.push(fileStream.waitDrain().catch((error) => error));
						let needsDrain = false;
						const writeCallback = (chunk) => {
							const writeOk = fileStream.write(chunk);
							if (!writeOk) needsDrain = true;
							return writeOk;
						};
						while (!unpacker.isBodyComplete()) {
							needsDrain = false;
							if (unpacker.streamBody(writeCallback) === 0) if (needsDrain) await fileStream.waitDrain();
							else {
								currentFileStream = fileStream;
								currentWriteCallback = writeCallback;
								return;
							}
						}
						while (!unpacker.skipPadding()) {
							currentFileStream = fileStream;
							currentWriteCallback = writeCallback;
							return;
						}
						opQueue.add(() => fileStream.end()).catch(onQueuedError);
					} else if (!unpacker.skipEntry()) return;
				}
			} catch (err) {
				writeError = err;
			} finally {
				cb((pendingFileOpens.length ? (await Promise.all(pendingFileOpens)).find((error) => error) : void 0) ?? writeError);
			}
		},
		async final(cb) {
			try {
				unpacker.end();
				unpacker.validateEOF();
				await pathCache.ready();
				await opQueue.onIdle();
				if (queuedError) throw queuedError;
				await pathCache.checkSymlinks();
				await pathCache.applyLinks();
				cb();
			} catch (err) {
				cb(err);
			}
		},
		destroy(error, callback) {
			(async () => {
				if (currentFileStream) {
					currentFileStream.destroy(error ?? void 0);
					currentFileStream = null;
					currentWriteCallback = null;
				}
				await opQueue.onIdle();
			})().then(() => callback(error ?? null), (e) => callback(error ?? (e instanceof Error ? e : /* @__PURE__ */ new Error("Stream destroyed"))));
		}
	});
	return writable;
}
//#endregion
export { packTar, packTarSources, unpackTar };
