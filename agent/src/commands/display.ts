import { execFile, spawn } from 'child_process';
import { z } from 'zod';
import type { CommandHandler } from '../lib/types.js';
import { getPlatform } from '../lib/platform.js';
import type { Logger } from '../lib/logger.js';

// --- Zod Schemas ---
const BrightnessArgsSchema = z.object({
  level: z.number().int().min(0).max(100),
});

const PowerArgsSchema = z.object({
  state: z.enum(['on', 'off', 'standby']),
});

const RotateArgsSchema = z.object({
  rotation: z.enum(['normal', 'left', 'right', 'inverted']),
});

const VolumeArgsSchema = z.object({
  level: z.number().int().min(0).max(100),
});

function execFilePromise(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Pipe data to a command via stdin using spawn (no shell).
 */
function spawnWithStdin(cmd: string, args: string[], stdinData: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('error', (err) => reject(new Error(err.message)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Process exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

/**
 * Detect the primary connected display output name from xrandr.
 */
async function getConnectedDisplay(): Promise<string> {
  const output = await execFilePromise('xrandr', []);
  const match = output.match(/^(\S+)\s+connected/m);
  if (!match) {
    throw new Error('No connected display found');
  }
  return match[1];
}

export function registerDisplayCommands(
  register: (command: string, handler: CommandHandler) => void,
  logger: Logger
): void {
  // display:brightness — set screen brightness (Linux only)
  register('display:brightness', async (args) => {
    if (getPlatform() !== 'linux') {
      throw new Error('Not supported on this platform');
    }

    const parsed = BrightnessArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new Error('Invalid brightness level, must be 0-100');
    }

    const { level } = parsed.data;
    const brightness = (level / 100).toFixed(2);

    logger.info(`Setting brightness to ${level}%`);

    const display = await getConnectedDisplay();
    await execFilePromise('xrandr', ['--output', display, '--brightness', brightness]);
    return { level };
  });

  // display:power — control display power via CEC (Linux only)
  register('display:power', async (args) => {
    if (getPlatform() !== 'linux') {
      throw new Error('Not supported on this platform');
    }

    const parsed = PowerArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new Error('Invalid state, must be on | off | standby');
    }

    const { state } = parsed.data;

    const cecCommands: Readonly<Record<string, string>> = {
      on: 'on 0',
      off: 'standby 0',
      standby: 'standby 0',
    };

    const cecCmd = cecCommands[state];

    logger.info(`Setting display power to ${state}`);

    // Pipe CEC command via spawn stdin (no shell)
    await spawnWithStdin('cec-client', ['-s', '-d', '1'], cecCmd + '\n');
    return { state };
  });

  // display:rotate — rotate display output (Linux + Windows)
  register('display:rotate', async (args) => {
    const plat = getPlatform();
    if (plat !== 'linux' && plat !== 'windows') {
      throw new Error('Not supported on this platform');
    }

    const parsed = RotateArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new Error('Invalid rotation, must be normal | left | right | inverted');
    }

    const { rotation } = parsed.data;

    logger.info(`Setting display rotation to ${rotation}`);

    if (plat === 'linux') {
      const display = await getConnectedDisplay();
      await execFilePromise('xrandr', ['--output', display, '--rotate', rotation]);
    } else {
      // Windows: use Add-Type with DEVMODE P/Invoke to rotate the primary display
      const orientationMap: Record<string, number> = {
        normal: 0,    // DMDO_DEFAULT
        left: 1,      // DMDO_90 (portrait)
        inverted: 2,  // DMDO_180
        right: 3,     // DMDO_270 (portrait flipped)
      };
      const orient = orientationMap[rotation];

      // PowerShell script that uses Win32 API to change display orientation
      const ps = `
Add-Type @'
using System;
using System.Runtime.InteropServices;

public class DisplayRotation {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DEVMODE {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmDeviceName;
        public short dmSpecVersion;
        public short dmDriverVersion;
        public short dmSize;
        public short dmDriverExtra;
        public int dmFields;
        public int dmPositionX;
        public int dmPositionY;
        public int dmDisplayOrientation;
        public int dmDisplayFixedOutput;
        public short dmColor;
        public short dmDuplex;
        public short dmYResolution;
        public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmFormName;
        public short dmLogPixels;
        public int dmBitsPerPel;
        public int dmPelsWidth;
        public int dmPelsHeight;
        public int dmDisplayFlags;
        public int dmDisplayFrequency;
        public int dmICMMethod;
        public int dmICMIntent;
        public int dmMediaType;
        public int dmDitherType;
        public int dmReserved1;
        public int dmReserved2;
        public int dmPanningWidth;
        public int dmPanningHeight;
    }

    [DllImport("user32.dll")]
    public static extern int EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);

    [DllImport("user32.dll")]
    public static extern int ChangeDisplaySettings(ref DEVMODE devMode, int flags);

    public const int ENUM_CURRENT_SETTINGS = -1;
    public const int DM_DISPLAYORIENTATION = 0x00000080;
    public const int DM_PELSWIDTH = 0x00080000;
    public const int DM_PELSHEIGHT = 0x00100000;

    public static string Rotate(int orientation) {
        DEVMODE dm = new DEVMODE();
        dm.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));

        if (EnumDisplaySettings(null, ENUM_CURRENT_SETTINGS, ref dm) == 0)
            return "ERROR: Failed to read current display settings";

        int oldOrientation = dm.dmDisplayOrientation;

        // Swap width/height when switching between landscape and portrait
        bool wasPortrait = (oldOrientation == 1 || oldOrientation == 3);
        bool willBePortrait = (orientation == 1 || orientation == 3);
        if (wasPortrait != willBePortrait) {
            int tmp = dm.dmPelsWidth;
            dm.dmPelsWidth = dm.dmPelsHeight;
            dm.dmPelsHeight = tmp;
        }

        dm.dmDisplayOrientation = orientation;
        dm.dmFields = DM_DISPLAYORIENTATION | DM_PELSWIDTH | DM_PELSHEIGHT;

        int result = ChangeDisplaySettings(ref dm, 0);
        if (result == 0) return "OK";
        return "ERROR: ChangeDisplaySettings returned " + result;
    }
}
'@

$r = [DisplayRotation]::Rotate(${orient})
if ($r -ne 'OK') { throw $r }
Write-Output $r
`;

      await execFilePromise('powershell', ['-NoProfile', '-Command', ps]);
    }

    return { rotation };
  });

  // display:volume — set audio volume (Linux only)
  register('display:volume', async (args) => {
    if (getPlatform() !== 'linux') {
      throw new Error('Not supported on this platform');
    }

    const parsed = VolumeArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new Error('Invalid volume level, must be 0-100');
    }

    const { level } = parsed.data;

    logger.info(`Setting volume to ${level}%`);

    await execFilePromise('amixer', ['set', 'Master', `${level}%`]);
    return { level };
  });

  // display:info — query display information (Linux with fallback)
  register('display:info', async () => {
    if (getPlatform() !== 'linux') {
      throw new Error('Not supported on this platform');
    }

    logger.info('Querying display info');

    const stdout = await execFilePromise('xrandr', ['--query']);
    return { raw: stdout };
  });
}
