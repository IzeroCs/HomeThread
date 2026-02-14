import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import env from '../config/env';
import logger from '../config/logger';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT = 5000; // 5 seconds

/** Backend package root (backend/), so ./tools/ot-ctl resolves correctly when run from monorepo root */
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

function getOtCtlPath(): string {
  const p = env.OT_CTL_PATH;
  const resolved = path.isAbsolute(p) ? p : path.resolve(BACKEND_ROOT, p);
  if (fs.existsSync(resolved)) return resolved;
  const inTools = path.join(BACKEND_ROOT, 'tools', path.basename(resolved));
  if (fs.existsSync(inTools)) return inTools;
  return resolved;
}

/**
 * Execute ot-ctl command
 */
async function executeCommand(
  command: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<string> {
  const otCtlPath = getOtCtlPath();
  const useSudo = env.OT_CTL_USE_SUDO;
  const socketPath = env.OT_CTL_SOCKET_PATH;

  // Build command with optional socket path and sudo (use absolute path so sudo finds binary)
  let fullCommand = otCtlPath;

  // Add socket path if specified
  if (socketPath) {
    fullCommand += ` -s ${socketPath}`;
  }

  fullCommand += ` ${command}`;

  // Add sudo if needed
  if (useSudo) {
    fullCommand = `sudo ${fullCommand}`;
  }

  logger.debug(`Executing ot-ctl command: ${fullCommand}`);

  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB buffer
    });

    if (stderr && stderr.trim()) {
      logger.warn(`ot-ctl stderr: ${stderr}`);
    }

    return stdout.trim();
  } catch (error: any) {
    if (error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM') {
      logger.error(`ot-ctl command timeout: ${command}`);
      throw new Error(`Command timeout: ${command}`);
    }

    // Check for permission denied / sudo error
    const errorMessage = error.message || error.stderr || '';
    if (
      errorMessage.includes('Permission denied') ||
      errorMessage.includes('connect session failed') ||
      errorMessage.includes('no askpass program specified')
    ) {
      if (!useSudo) {
        logger.error(`ot-ctl permission denied. Try OT_CTL_USE_SUDO=true in .env`);
        throw new Error(`Permission denied: ot-ctl requires sudo. Set OT_CTL_USE_SUDO=true in .env`);
      }
      logger.error(`ot-ctl failed with sudo. stderr: ${error.stderr || errorMessage}`);
      throw new Error(
        `ot-ctl with sudo failed. Either: (1) Add NOPASSWD for ot-ctl in sudoers, e.g. ` +
          `'%YOUR_GROUP ALL=(ALL) NOPASSWD: /path/to/ot-ctl'; (2) Or run ot-daemon and backend as same user and set OT_CTL_USE_SUDO=false.`
      );
    }

    logger.error(`ot-ctl command failed: ${command}`, error);
    throw new Error(`Command failed: ${error.message || error}`);
  }
}

/**
 * Parse ot-ctl output - removes "Done" suffix and empty lines
 */
function parseOutput(output: string): string {
  return output
    .split('\n')
    .filter((line) => line.trim() !== '' && line.trim() !== 'Done')
    .join('\n')
    .trim();
}

/**
 * Parse state output
 */
function parseState(output: string): string {
  const parsed = parseOutput(output);
  // ot-ctl state returns: "router", "child", "leader", "detached", etc.
  return parsed.toLowerCase();
}

/**
 * Parse list output (routers, children, neighbors)
 */
function parseList(output: string): string[] {
  const parsed = parseOutput(output);
  if (!parsed) return [];

  return parsed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Parse key-value output (e.g., "networkname: TestNetwork")
 */
function parseKeyValue(output: string): Record<string, string> {
  const parsed = parseOutput(output);
  const result: Record<string, string> = {};

  parsed.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join(':').trim();
    }
  });

  return result;
}

/**
 * Parse IP addresses output
 */
function parseIpAddresses(output: string): string[] {
  const parsed = parseOutput(output);
  if (!parsed) return [];

  return parsed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes(':'));
}

/**
 * OT-CTL Service
 */
const otCtlService = {
  /**
   * Execute raw ot-ctl command
   */
  async executeCommand(command: string, timeout?: number): Promise<string> {
    return executeCommand(command, timeout);
  },

  /**
   * Get device state
   */
  async getState(): Promise<string> {
    const output = await executeCommand('state');
    return parseState(output);
  },

  /**
   * Get OpenThread version
   */
  async getVersion(): Promise<string> {
    const output = await executeCommand('version');
    return parseOutput(output);
  },

  /**
   * Reset device
   */
  async reset(): Promise<void> {
    await executeCommand('reset', 10000); // Reset may take longer
  },

  /**
   * Get router list
   */
  async getRouterList(): Promise<string[]> {
    const output = await executeCommand('router list');
    return parseList(output);
  },

  /**
   * Get child list
   */
  async getChildList(): Promise<string[]> {
    const output = await executeCommand('child list');
    return parseList(output);
  },

  /**
   * Get neighbor list
   */
  async getNeighborList(): Promise<string[]> {
    const output = await executeCommand('neighbor list');
    return parseList(output);
  },

  /**
   * Get IP addresses
   */
  async getIpAddresses(): Promise<string[]> {
    const output = await executeCommand('ipaddr');
    return parseIpAddresses(output);
  },

  /**
   * Get network name
   */
  async getNetworkName(): Promise<string> {
    const output = await executeCommand('networkname');
    return parseOutput(output);
  },

  /**
   * Set network name
   */
  async setNetworkName(name: string): Promise<void> {
    await executeCommand(`networkname ${name}`);
  },

  /**
   * Get channel
   */
  async getChannel(): Promise<number> {
    const output = await executeCommand('channel');
    const parsed = parseOutput(output);
    return parseInt(parsed, 10);
  },

  /**
   * Set channel
   */
  async setChannel(channel: number): Promise<void> {
    if (channel < 11 || channel > 26) {
      throw new Error('Channel must be between 11 and 26');
    }
    await executeCommand(`channel ${channel}`);
  },

  /**
   * Get PAN ID
   */
  async getPanId(): Promise<string> {
    const output = await executeCommand('panid');
    return parseOutput(output);
  },

  /**
   * Set PAN ID
   */
  async setPanId(panId: string): Promise<void> {
    await executeCommand(`panid ${panId}`);
  },

  /**
   * Get leader data
   */
  async getLeaderData(): Promise<Record<string, string>> {
    const output = await executeCommand('leaderdata');
    return parseKeyValue(output);
  },

  /**
   * Get network data
   */
  async getNetworkData(): Promise<string> {
    const output = await executeCommand('netdatashow');
    return parseOutput(output);
  },

  /**
   * Ping command
   */
  async ping(address: string, count: number = 4): Promise<string> {
    const output = await executeCommand(`ping ${address} ${count}`, 30000); // Ping timeout longer
    return parseOutput(output);
  },

  /**
   * Get link quality
   */
  async getLinkQuality(): Promise<Record<string, string>> {
    const output = await executeCommand('linkquality');
    return parseKeyValue(output);
  },

  /**
   * Get RLOC16
   */
  async getRloc16(): Promise<string> {
    const output = await executeCommand('rloc16');
    return parseOutput(output);
  },

  /**
   * Get EUI64
   */
  async getEui64(): Promise<string> {
    const output = await executeCommand('eui64');
    return parseOutput(output);
  },
};

export default otCtlService;
