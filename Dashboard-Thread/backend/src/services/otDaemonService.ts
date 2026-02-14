import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import env from '../config/env';
import logger from '../config/logger';

let daemonProcess: ChildProcess | null = null;
let currentDevice: string | null = null;
let currentBaudrate: number | null = null;

/** Backend package root (backend/), so ./tools/ot-daemon resolves when run from monorepo root */
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

function getDaemonPath(): string {
  const p = env.OT_DAEMON_PATH;
  const resolved = path.isAbsolute(p) ? p : path.resolve(BACKEND_ROOT, p);
  if (fs.existsSync(resolved)) return resolved;
  const inTools = path.join(BACKEND_ROOT, 'tools', path.basename(resolved));
  if (fs.existsSync(inTools)) return inTools;
  return resolved;
}

/**
 * Build spinel URL for ot-daemon: spinel+hdlc+uart://DEVICE?uart-baudrate=BAUDRATE
 */
function buildSpinelUrl(device: string, baudrate: number): string {
  return `spinel+hdlc+uart://${device}?uart-baudrate=${baudrate}`;
}

/**
 * Status: 'running' | 'stopped'
 */
export function getStatus(): 'running' | 'stopped' {
  if (!daemonProcess || !daemonProcess.pid) return 'stopped';
  try {
    process.kill(daemonProcess.pid, 0);
    return 'running';
  } catch {
    daemonProcess = null;
    return 'stopped';
  }
}

/**
 * Get current device and baudrate (if daemon was started by this service).
 */
export function getConfig(): { device: string | null; baudrate: number | null } {
  return { device: currentDevice, baudrate: currentBaudrate };
}

/**
 * Start ot-daemon with optional device and baudrate.
 * Uses env defaults if not provided. Stops existing daemon if already running.
 */
export function start(device?: string, baudrate?: number): void {
  stop();

  const dev = device ?? env.OT_DAEMON_DEFAULT_DEVICE;
  const baud = baudrate ?? env.OT_DAEMON_DEFAULT_BAUDRATE;
  const url = buildSpinelUrl(dev, baud);
  const daemonPath = getDaemonPath();

  const useSudo = env.OT_DAEMON_USE_SUDO;
  const verbose = env.OT_DAEMON_VERBOSE;
  const cmd = useSudo ? 'sudo' : daemonPath;
  const baseArgs = useSudo ? [daemonPath] : [];
  if (verbose) baseArgs.push('-v');
  baseArgs.push(url);
  const args = baseArgs;
  logger.info(`Starting ot-daemon: ${useSudo ? 'sudo ' : ''}${daemonPath}${verbose ? ' -v' : ''} ${url}`);

  daemonProcess = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  currentDevice = dev;
  currentBaudrate = baud;

  daemonProcess.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) logger.debug(`ot-daemon: ${line}`);
  });
  daemonProcess.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) logger.warn(`ot-daemon stderr: ${line}`);
  });
  daemonProcess.on('error', (err) => {
    logger.error('ot-daemon process error:', err);
    daemonProcess = null;
    currentDevice = null;
    currentBaudrate = null;
  });
  daemonProcess.on('exit', (code, signal) => {
    logger.info(`ot-daemon exited code=${code} signal=${signal}`);
    daemonProcess = null;
    currentDevice = null;
    currentBaudrate = null;
  });
}

/**
 * Stop ot-daemon if it was started by this service.
 */
export function stop(): void {
  if (!daemonProcess || !daemonProcess.pid) return;
  logger.info('Stopping ot-daemon');
  daemonProcess.kill('SIGTERM');
  daemonProcess = null;
  currentDevice = null;
  currentBaudrate = null;
}

export default {
  getStatus,
  getConfig,
  start,
  stop,
};
