import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../lib/db.js';
import { sendCacheRefreshToApps } from '../services/appRefresh.js';

const router = Router();
const DEFAULT_GUEST_NAME_FONT_SIZE_REM = 3.5;
const MIN_GUEST_NAME_FONT_SIZE_REM = 2;
const MAX_GUEST_NAME_FONT_SIZE_REM = 12;

interface ReceptionScreenConfig {
  screenIndex: number;
  screenLabel?: string;
  mode?: string;
  videoUrl?: string;
  guestNames?: string[];
  guestNameFontSizeRem?: number;
  welcomeSlides?: unknown[];
  infoSlides?: unknown[];
}

interface ReceptionAssignment {
  app: {
    id: string;
    name: string;
    config: Record<string, unknown>;
    template_type: string;
  };
  device: {
    id: string;
    display_name: string;
    slug: string | null;
  };
}

const defaultScreens: ReceptionScreenConfig[] = [
  {
    screenIndex: 0,
    screenLabel: 'Left Screen',
    mode: 'slides',
    videoUrl: '',
    guestNames: [],
    guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM,
    welcomeSlides: [],
    infoSlides: [],
  },
  {
    screenIndex: 1,
    screenLabel: 'Center Screen',
    mode: 'slides',
    videoUrl: '',
    guestNames: [],
    guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM,
    welcomeSlides: [],
    infoSlides: [],
  },
  {
    screenIndex: 2,
    screenLabel: 'Right Screen',
    mode: 'slides',
    videoUrl: '',
    guestNames: [],
    guestNameFontSizeRem: DEFAULT_GUEST_NAME_FONT_SIZE_REM,
    welcomeSlides: [],
    infoSlides: [],
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sanitizeGuestNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((name) => String(name ?? '').trim())
    .filter((name) => name.length > 0)
    .map((name) => name.slice(0, 120));
}

function sanitizeGuestNameFontSizeRem(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_GUEST_NAME_FONT_SIZE_REM;
  return Math.min(MAX_GUEST_NAME_FONT_SIZE_REM, Math.max(MIN_GUEST_NAME_FONT_SIZE_REM, parsed));
}

function getScreens(config: Record<string, unknown>): ReceptionScreenConfig[] {
  const screens = Array.isArray(config.screens) ? config.screens : defaultScreens;
  return screens.map((screen, index) => {
    const record = asRecord(screen);
    return {
      ...defaultScreens[index],
      ...record,
      screenIndex: typeof record.screenIndex === 'number' ? record.screenIndex : index,
    } as ReceptionScreenConfig;
  });
}

function setRightScreenSettings(
  config: Record<string, unknown>,
  settings: { guestNames?: string[]; guestNameFontSizeRem?: number }
): Record<string, unknown> {
  const screens = getScreens(config);
  const rightIndex = screens.findIndex((screen) => screen.screenIndex === 2);
  const rightScreen = rightIndex >= 0 ? screens[rightIndex] : defaultScreens[2];
  const nextRightScreen: ReceptionScreenConfig = {
    ...rightScreen,
    screenIndex: 2,
    ...(settings.guestNames !== undefined ? { guestNames: settings.guestNames } : {}),
    ...(settings.guestNameFontSizeRem !== undefined ? { guestNameFontSizeRem: settings.guestNameFontSizeRem } : {}),
  };

  if (rightIndex >= 0) {
    screens[rightIndex] = nextRightScreen;
  } else {
    screens.push(nextRightScreen);
    screens.sort((a, b) => a.screenIndex - b.screenIndex);
  }

  return { ...config, screens };
}

function getRightScreenGuestNames(config: Record<string, unknown>): string[] {
  const rightScreen = getScreens(config).find((screen) => screen.screenIndex === 2);
  return sanitizeGuestNames(rightScreen?.guestNames || []);
}

function getRightScreenGuestNameFontSizeRem(config: Record<string, unknown>): number {
  const rightScreen = getScreens(config).find((screen) => screen.screenIndex === 2);
  return sanitizeGuestNameFontSizeRem(rightScreen?.guestNameFontSizeRem);
}

async function loadReceptionAssignment(deviceIdOrSlug: string): Promise<ReceptionAssignment | null> {
  const db = getDb();
  const lookup = deviceIdOrSlug.trim();
  const canUseSuffixLookup = /^[a-zA-Z0-9-]+$/.test(lookup) && lookup.length >= 6;

  const row = await db('devices')
    .leftJoin('apps', 'devices.app_id', 'apps.id')
    .select(
      'devices.id as device_id',
      'devices.display_name as device_display_name',
      'devices.slug as device_slug',
      'apps.id as app_id',
      'apps.name as app_name',
      'apps.template_type as app_template_type',
      'apps.config as app_config'
    )
    .where((builder) => {
      builder.whereRaw('devices.id::text = ?', [lookup]).orWhere('devices.slug', lookup);
      if (canUseSuffixLookup) {
        builder.orWhereRaw('devices.id::text ILIKE ?', [`%${lookup}`]);
      }
    })
    .first();

  if (!row || !row.app_id || row.app_template_type !== 'custom06-reception-program') {
    return null;
  }

  return {
    device: {
      id: row.device_id,
      display_name: row.device_display_name,
      slug: row.device_slug,
    },
    app: {
      id: row.app_id,
      name: row.app_name,
      template_type: row.app_template_type,
      config: asRecord(row.app_config),
    },
  };
}

function renderReceptionPage(deviceId: string): string {
  const safeDeviceId = JSON.stringify(deviceId);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>Reception Names</title>
  <style>
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #f6f3ef; color: #251f1c; }
    main { width: min(960px, 100%); margin: 0 auto; padding: 28px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: clamp(34px, 5vw, 56px); line-height: 1; letter-spacing: 0; }
    .device { margin-top: 10px; color: #6d625c; font-size: 22px; }
    .panel { background: #fff; border: 1px solid #ddd5ce; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 50px rgba(40, 28, 20, 0.08); }
    .panel-head { padding: 26px 30px; border-bottom: 1px solid #eee7e2; background: #fbfaf8; }
    .panel-head h2 { margin: 0; font-size: 30px; }
    .panel-head p { margin: 10px 0 0; color: #756b65; font-size: 19px; }
    .panel-tools { margin-top: 18px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .tool-group { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .tool-btn { height: 52px; border-radius: 12px; border: 2px solid #ddd5ce; background: #fff; color: #251f1c; font-size: 18px; font-weight: 700; padding: 0 16px; cursor: pointer; }
    .tool-btn:disabled { opacity: 0.5; cursor: default; }
    .tool-btn-danger { border-color: #f0c7c7; background: #fff1f1; color: #a61f1f; }
    .font-chip { height: 52px; display: inline-flex; align-items: center; border-radius: 12px; border: 2px solid #ddd5ce; padding: 0 16px; font-size: 18px; color: #5a4f49; background: #fff; }
    .font-chip strong { color: #251f1c; margin-left: 8px; }
    .list { display: grid; gap: 34px; padding: 38px 30px; }
    .row { display: flex; gap: 14px; align-items: center; margin-bottom: 22px; }
    .row:last-of-type { margin-bottom: 0; }
    input { width: 100%; height: 72px; border: 2px solid #ddd5ce; border-radius: 16px; padding: 0 22px; font-size: 30px; font-weight: 700; color: #251f1c; outline: none; }
    input:focus { border-color: #351A55; box-shadow: 0 0 0 4px rgba(53, 26, 85, 0.12); }
    button { height: 72px; border: 0; border-radius: 16px; padding: 0 28px; font-size: 24px; font-weight: 800; cursor: pointer; touch-action: manipulation; }
    button:disabled { opacity: 0.5; cursor: default; }
    .save { min-width: 150px; background: #351A55; color: #fff; }
    .remove { width: 72px; padding: 0; background: #fff1f1; color: #a61f1f; border: 2px solid #f0c7c7; }
    .add { width: 100%; margin-top: 28px; background: #fff; color: #351A55; border: 3px dashed #cfc5d8; }
    .empty { padding: 42px 20px; border: 2px dashed #ddd5ce; border-radius: 16px; text-align: center; color: #756b65; font-size: 24px; background: #fbfaf8; }
    .status { min-height: 30px; margin-top: 18px; font-size: 20px; color: #756b65; }
    .status.error { color: #a61f1f; }
    @media (max-width: 640px) {
      main { padding: 18px; }
      header { align-items: stretch; flex-direction: column; }
      .save { width: 100%; }
      input { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Right Screen Names</h1>
        <div class="device" id="deviceName">Loading...</div>
      </div>
      <button class="save" id="saveButton" disabled>Save</button>
    </header>
    <section class="panel">
      <div class="panel-head">
        <h2>Guest Name List</h2>
        <p>Add names for the right reception screen.</p>
        <div class="panel-tools">
          <button class="tool-btn tool-btn-danger" id="removeAllButton" type="button">Remove All</button>
          <div class="tool-group" aria-label="Guest name font size">
            <button class="tool-btn" id="decreaseFontButton" type="button">A-</button>
            <span class="font-chip">Font <strong id="fontSizeValue">${DEFAULT_GUEST_NAME_FONT_SIZE_REM.toFixed(1)}rem</strong></span>
            <button class="tool-btn" id="increaseFontButton" type="button">A+</button>
          </div>
        </div>
      </div>
      <div class="list" id="nameList"></div>
    </section>
    <div class="status" id="status"></div>
  </main>
  <script>
    const deviceId = ${safeDeviceId};
    const minFontSize = ${MIN_GUEST_NAME_FONT_SIZE_REM};
    const maxFontSize = ${MAX_GUEST_NAME_FONT_SIZE_REM};
    const defaultFontSize = ${DEFAULT_GUEST_NAME_FONT_SIZE_REM};
    const state = { names: [], saved: '', loading: true, fontSize: defaultFontSize };
    const list = document.getElementById('nameList');
    const saveButton = document.getElementById('saveButton');
    const statusEl = document.getElementById('status');
    const deviceName = document.getElementById('deviceName');
    const removeAllButton = document.getElementById('removeAllButton');
    const decreaseFontButton = document.getElementById('decreaseFontButton');
    const increaseFontButton = document.getElementById('increaseFontButton');
    const fontSizeValue = document.getElementById('fontSizeValue');

    function setStatus(message, isError) {
      statusEl.textContent = message || '';
      statusEl.className = isError ? 'status error' : 'status';
    }

    function snapshot() {
      return JSON.stringify({
        names: state.names.map((name) => String(name || '').trim()).filter(Boolean),
        fontSize: clampFontSize(state.fontSize)
      });
    }

    function clampFontSize(value) {
      const parsed = Number(value);
      const next = Number.isFinite(parsed) ? parsed : defaultFontSize;
      return Math.round(Math.min(maxFontSize, Math.max(minFontSize, next)) * 10) / 10;
    }

    function updateFontControls() {
      const value = clampFontSize(state.fontSize);
      state.fontSize = value;
      fontSizeValue.textContent = value.toFixed(1) + 'rem';
      decreaseFontButton.disabled = state.loading || value <= minFontSize;
      increaseFontButton.disabled = state.loading || value >= maxFontSize;
    }

    function setFontSize(value) {
      state.fontSize = clampFontSize(value);
      updateFontControls();
      updateSaveButton();
    }

    function render() {
      list.innerHTML = '';
      updateSaveButton();
      updateFontControls();
      removeAllButton.disabled = state.loading || state.names.length === 0;

      if (state.names.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No guest names added.';
        list.appendChild(empty);
      }

      state.names.forEach((name, index) => {
        const row = document.createElement('div');
        row.className = 'row';

        const input = document.createElement('input');
        input.value = name;
        input.placeholder = 'Name ' + (index + 1);
        input.autocomplete = 'off';
        input.addEventListener('input', () => {
          state.names[index] = input.value;
          updateSaveButton();
        });

        const remove = document.createElement('button');
        remove.className = 'remove';
        remove.type = 'button';
        remove.textContent = 'X';
        remove.setAttribute('aria-label', 'Remove name ' + (index + 1));
        remove.addEventListener('click', () => {
          state.names.splice(index, 1);
          render();
        });

        row.appendChild(input);
        row.appendChild(remove);
        list.appendChild(row);
      });

      const add = document.createElement('button');
      add.className = 'add';
      add.type = 'button';
      add.textContent = 'Add Name';
      add.addEventListener('click', () => {
        state.names.push('');
        render();
        const inputs = list.querySelectorAll('input');
        const next = inputs[inputs.length - 1];
        if (next) next.focus();
      });
      list.appendChild(add);
    }

    function updateSaveButton() {
      const dirty = snapshot() !== state.saved;
      saveButton.disabled = state.loading || !dirty;
    }

    async function loadNames() {
      try {
        setStatus('Loading...');
        const res = await fetch('/api/reception/' + encodeURIComponent(deviceId) + '/names', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load names');
        state.names = json.data.guestNames || [];
        state.fontSize = clampFontSize(json.data.guestNameFontSizeRem);
        state.saved = snapshot();
        deviceName.textContent = json.data.device.display_name || 'Reception device';
        setStatus('');
      } catch (error) {
        setStatus(error.message || 'Failed to load names', true);
      } finally {
        state.loading = false;
        render();
      }
    }

    async function saveNames() {
      try {
        state.loading = true;
        render();
        setStatus('Saving...');
        const guestNames = state.names.map((name) => String(name || '').trim()).filter(Boolean);
        const res = await fetch('/api/reception/' + encodeURIComponent(deviceId) + '/names', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestNames, guestNameFontSizeRem: clampFontSize(state.fontSize) })
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save names');
        state.names = json.data.guestNames || [];
        state.fontSize = clampFontSize(json.data.guestNameFontSizeRem);
        state.saved = snapshot();
        setStatus('Saved');
        setTimeout(() => { if (snapshot() === state.saved) setStatus(''); }, 1800);
      } catch (error) {
        setStatus(error.message || 'Failed to save names', true);
      } finally {
        state.loading = false;
        render();
      }
    }

    removeAllButton.addEventListener('click', () => {
      if (state.loading || state.names.length === 0) return;
      state.names = [];
      setStatus('');
      render();
    });

    saveButton.addEventListener('click', saveNames);
    decreaseFontButton.addEventListener('click', () => setFontSize(state.fontSize - 0.2));
    increaseFontButton.addEventListener('click', () => setFontSize(state.fontSize + 0.2));
    loadNames();
  </script>
</body>
</html>`;
}

router.get('/reception/:deviceId', (_req, res, _next) => {
  const deviceId = String(_req.params.deviceId || '');
  res.type('html').send(renderReceptionPage(deviceId));
});

router.get('/api/reception/:deviceId/names', async (req, res, next) => {
  try {
    const assignment = await loadReceptionAssignment(String(req.params.deviceId || ''));
    if (!assignment) {
      res.status(404).json({ success: false, error: 'Reception device not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        device: assignment.device,
        app: { id: assignment.app.id, name: assignment.app.name },
        guestNames: getRightScreenGuestNames(assignment.app.config),
        guestNameFontSizeRem: getRightScreenGuestNameFontSizeRem(assignment.app.config),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/api/reception/:deviceId/names', async (req, res, next) => {
  try {
    const assignment = await loadReceptionAssignment(String(req.params.deviceId || ''));
    if (!assignment) {
      res.status(404).json({ success: false, error: 'Reception device not found' });
      return;
    }

    const hasGuestNames = Object.prototype.hasOwnProperty.call(req.body || {}, 'guestNames');
    const hasGuestNameFontSize = Object.prototype.hasOwnProperty.call(req.body || {}, 'guestNameFontSizeRem');
    const guestNames = hasGuestNames
      ? sanitizeGuestNames(req.body?.guestNames)
      : getRightScreenGuestNames(assignment.app.config);
    const guestNameFontSizeRem = hasGuestNameFontSize
      ? sanitizeGuestNameFontSizeRem(req.body?.guestNameFontSizeRem)
      : getRightScreenGuestNameFontSizeRem(assignment.app.config);
    const nextConfig = setRightScreenSettings(assignment.app.config, {
      ...(hasGuestNames ? { guestNames } : {}),
      ...(hasGuestNameFontSize ? { guestNameFontSizeRem } : {}),
    });
    const requestId = crypto.randomUUID();
    const db = getDb();

    await db('apps')
      .where({ id: assignment.app.id })
      .update({
        config: JSON.stringify(nextConfig),
        updated_at: db.fn.now(),
      });

    const refreshedDeviceIds = await sendCacheRefreshToApps([assignment.app.id], 'reception-names-save', {
      appId: assignment.app.id,
      requestId,
    });

    res.json({
      success: true,
      data: {
        guestNames,
        guestNameFontSizeRem,
        cache_refresh_device_ids: refreshedDeviceIds,
        cache_refresh_request_id: requestId,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
