import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { cronToHuman } from './ScheduleListPage';
import type { Schedule, ScheduleType, ScheduleTargetType, Device, DeviceGroup, Zone } from '../lib/types';
import {
  ChevronRight,
  Calendar,
  Save,
  Clock,
  Monitor,
  Power,
  FileText,
  Music,
  Settings,
  CalendarDays,
  CheckCircle,
  AlertCircle,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEDULE_TYPES: { value: ScheduleType; label: string }[] = [
  { value: 'power', label: 'Power' },
  { value: 'content', label: 'Content' },
  { value: 'playlist', label: 'Playlist' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'event', label: 'Event' },
];

const TARGET_TYPES: { value: ScheduleTargetType; label: string }[] = [
  { value: 'device', label: 'Device' },
  { value: 'group', label: 'Group' },
  { value: 'zone', label: 'Zone' },
];

const ACTIONS_BY_TYPE: Record<ScheduleType, { value: string; label: string }[]> = {
  power: [
    { value: 'power_on', label: 'Power On' },
    { value: 'power_off', label: 'Power Off' },
  ],
  content: [
    { value: 'push_content', label: 'Push Content' },
  ],
  playlist: [
    { value: 'set_playlist', label: 'Set Playlist' },
  ],
  maintenance: [
    { value: 'restart', label: 'Restart' },
    { value: 'set_config', label: 'Set Config' },
  ],
  event: [
    { value: 'power_on', label: 'Power On' },
    { value: 'push_content', label: 'Push Content' },
  ],
};

const TYPE_META: Record<ScheduleType, { icon: typeof Power; color: string; bgColor: string; label: string }> = {
  power: { icon: Power, color: 'text-amber-600', bgColor: 'bg-amber-500/5', label: 'Power' },
  content: { icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-500/5', label: 'Content' },
  playlist: { icon: Music, color: 'text-emerald-600', bgColor: 'bg-emerald-500/5', label: 'Playlist' },
  maintenance: { icon: Settings, color: 'text-surface-600', bgColor: 'bg-surface-100', label: 'Maintenance' },
  event: { icon: CalendarDays, color: 'text-red-600', bgColor: 'bg-red-500/5', label: 'Event' },
};

interface CronParts {
  minute: string;
  hour: string;
  dom: string;
  month: string;
  dow: string;
}

const CRON_PRESETS: { key: string; label: string; parts: CronParts }[] = [
  { key: 'daily', label: 'Daily', parts: { minute: '0', hour: '9', dom: '*', month: '*', dow: '*' } },
  { key: 'weekdays', label: 'Weekdays', parts: { minute: '0', hour: '9', dom: '*', month: '*', dow: '1-5' } },
  { key: 'weekends', label: 'Weekends', parts: { minute: '0', hour: '10', dom: '*', month: '*', dow: '0,6' } },
  { key: 'weekly', label: 'Weekly', parts: { minute: '0', hour: '9', dom: '*', month: '*', dow: '1' } },
  { key: 'monthly', label: 'Monthly', parts: { minute: '0', hour: '9', dom: '1', month: '*', dow: '*' } },
];

const DOW_OPTIONS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '0', label: 'Sun' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCron(cron: string): CronParts {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { minute: '0', hour: '9', dom: '*', month: '*', dow: '*' };
  }
  return {
    minute: parts[0],
    hour: parts[1],
    dom: parts[2],
    month: parts[3],
    dow: parts[4],
  };
}

function buildCron(parts: CronParts): string {
  return `${parts.minute} ${parts.hour} ${parts.dom} ${parts.month} ${parts.dow}`;
}

function isConcreteCronNumber(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value)) return false;
  const num = parseInt(value, 10);
  return num >= min && num <= max;
}

function hasConcreteTime(parts: CronParts): boolean {
  return isConcreteCronNumber(parts.hour, 0, 23) && isConcreteCronNumber(parts.minute, 0, 59);
}

function cronPartsToTimeValue(parts: CronParts): string {
  if (!hasConcreteTime(parts)) return '';
  return `${parts.hour.padStart(2, '0')}:${parts.minute.padStart(2, '0')}`;
}

function formatTimeValue(time: string): string {
  const [hourStr, minuteStr] = time.split(':');
  if (hourStr === undefined || minuteStr === undefined) return 'Custom time';

  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 'Custom time';

  const period = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = hour % 12 || 12;
  return `${normalizedHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

function presetMatchesPattern(parts: CronParts, presetParts: CronParts): boolean {
  return parts.dom === presetParts.dom
    && parts.month === presetParts.month
    && parts.dow === presetParts.dow;
}

function parseDowToSet(dow: string): Set<string> {
  if (dow === '*') return new Set();
  const expanded: string[] = [];
  for (const segment of dow.split(',')) {
    const rangeMatch = segment.match(/^(\d)-(\d)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) {
        expanded.push(String(i));
      }
    } else {
      expanded.push(segment.trim());
    }
  }
  return new Set(expanded);
}

function dowSetToString(set: Set<string>): string {
  if (set.size === 0) return '*';
  const sorted = Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return sorted.join(',');
}

interface FormState {
  name: string;
  type: ScheduleType;
  target_type: ScheduleTargetType;
  target_ids: string[];
  action: string;
  cron: string;
  payload: string;
  enabled: boolean;
  staggerSeconds: number;
}

function getInitialForm(): FormState {
  return {
    name: '',
    type: 'power',
    target_type: 'device',
    target_ids: [],
    action: 'power_on',
    cron: '0 9 * * *',
    payload: '',
    enabled: true,
    staggerSeconds: 0,
  };
}

function scheduleToForm(s: Schedule): FormState {
  return {
    name: s.name,
    type: s.type,
    target_type: s.target_type,
    target_ids: [...s.target_ids],
    action: s.action,
    cron: s.cron_expression,
    payload: s.payload ? JSON.stringify(s.payload, null, 2) : '',
    enabled: s.is_enabled,
    staggerSeconds: s.stagger_seconds ?? 0,
  };
}

/** Whether a schedule's action benefits from staggering (inrush protection). */
function isStaggerableAction(type: ScheduleType, action: string): boolean {
  return type === 'power' && action === 'power_on';
}

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label?: string;
}

function ToggleSwitch({ checked, disabled, onChange, label }: ToggleSwitchProps) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? 'bg-primary-600' : 'bg-surface-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-base text-surface-700">{label}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Cron Builder Component
// ---------------------------------------------------------------------------

interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
}

function CronBuilder({ value, onChange }: CronBuilderProps) {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');

  const parts = useMemo(() => parseCron(value), [value]);
  const dowSet = useMemo(() => parseDowToSet(parts.dow), [parts.dow]);
  const timeValue = useMemo(() => cronPartsToTimeValue(parts), [parts]);

  const activePreset = useMemo(() => {
    for (const preset of CRON_PRESETS) {
      if (presetMatchesPattern(parts, preset.parts)) return preset.key;
    }
    return null;
  }, [parts]);

  const handlePreset = useCallback((presetKey: string) => {
    const preset = CRON_PRESETS.find((p) => p.key === presetKey);
    if (preset) {
      onChange(buildCron({
        ...preset.parts,
        hour: hasConcreteTime(parts) ? parts.hour : preset.parts.hour,
        minute: hasConcreteTime(parts) ? parts.minute : preset.parts.minute,
      }));
      setMode('preset');
    }
  }, [onChange, parts]);

  const updatePart = useCallback((key: keyof CronParts, val: string) => {
    const updated: CronParts = { ...parts, [key]: val };
    onChange(buildCron(updated));
  }, [parts, onChange]);

  const handleTimeChange = useCallback((nextTime: string) => {
    const [nextHour, nextMinute] = nextTime.split(':');
    if (nextHour === undefined || nextMinute === undefined) return;

    onChange(buildCron({
      ...parts,
      hour: String(parseInt(nextHour, 10)),
      minute: String(parseInt(nextMinute, 10)),
    }));
  }, [parts, onChange]);

  const toggleDow = useCallback((day: string) => {
    const next = new Set(dowSet);
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    const updated: CronParts = { ...parts, dow: dowSetToString(next) };
    onChange(buildCron(updated));
  }, [dowSet, parts, onChange]);

  const humanReadable = cronToHuman(value);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-semibold text-surface-600 mb-1.5">Time</label>
        <input
          type="time"
          value={timeValue}
          step={60}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="h-10 w-full px-3 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <p className="text-xs text-surface-400 mt-1">
          {timeValue
            ? 'Pick the exact time for this schedule.'
            : 'This cron uses an advanced time pattern. Choose a time here to convert it to an exact hour and minute.'}
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMode('preset')}
          className={`h-9 px-3 rounded-xl text-base font-medium transition-colors ${
            mode === 'preset'
              ? 'bg-primary-50 text-primary-700'
              : 'text-surface-600 hover:bg-surface-100'
          }`}
        >
          Presets
        </button>
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`h-9 px-3 rounded-xl text-base font-medium transition-colors ${
            mode === 'custom'
              ? 'bg-primary-50 text-primary-700'
              : 'text-surface-600 hover:bg-surface-100'
          }`}
        >
          Custom
        </button>
      </div>

      {/* Preset buttons */}
      {mode === 'preset' && (
        <div className="flex flex-wrap gap-2">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => handlePreset(preset.key)}
              className={`h-10 px-3 rounded-xl border text-base font-medium transition-colors ${
                activePreset === preset.key
                  ? 'border-primary-300 bg-primary-50 text-primary-700'
                  : 'border-surface-300 card-bg text-surface-600 hover:bg-surface-50'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {/* Custom builder */}
      {mode === 'custom' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">Day of Week</label>
            <div className="flex flex-wrap gap-1">
              {DOW_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDow(d.value)}
                  className={`h-10 w-10 rounded-xl border text-base font-medium transition-colors ${
                    dowSet.has(d.value)
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-surface-300 card-bg text-surface-600 hover:bg-surface-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-surface-400 mt-1">
              {dowSet.size === 0 ? 'No days selected = every day' : `${dowSet.size} day(s) selected`}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-surface-600 mb-1.5">Day of Month</label>
            <select
              value={parts.dom}
              onChange={(e) => updatePart('dom', e.target.value)}
              className="h-10 w-full px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="*">Every day</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-surface-50 p-3">
        <span className="text-xs font-medium text-surface-500">Preview</span>
        <p className="text-base text-surface-900 font-medium">{humanReadable}</p>
        <p className="text-xs text-surface-400 mt-0.5">
          {timeValue ? `Scheduled time: ${formatTimeValue(timeValue)}` : 'Select a time to schedule this action.'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target multi-select with schedule awareness
// ---------------------------------------------------------------------------

interface TargetOption {
  id: string;
  name: string;
}

interface ScheduleAwareMultiSelectProps {
  options: TargetOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  loading: boolean;
  placeholder: string;
  /** All existing schedules — used to show "already scheduled" badges */
  existingSchedules: Schedule[];
  /** The target type currently selected */
  targetType: ScheduleTargetType;
  /** The schedule being edited (so we exclude it from "existing") */
  editingScheduleId?: string;
  onEditSchedule: (id: string) => void;
}

function ScheduleAwareMultiSelect({
  options,
  selected,
  onChange,
  loading,
  placeholder,
  existingSchedules,
  targetType,
  editingScheduleId,
  onEditSchedule,
}: ScheduleAwareMultiSelectProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Build a map: targetId → list of schedules that include this target
  const targetScheduleMap = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    existingSchedules.forEach((s) => {
      if (s.id === editingScheduleId) return; // exclude the one being edited
      if (s.target_type !== targetType) return;
      s.target_ids.forEach((tid) => {
        if (!map[tid]) map[tid] = [];
        map[tid].push(s);
      });
    });
    return map;
  }, [existingSchedules, targetType, editingScheduleId]);

  const toggle = useCallback((id: string) => {
    if (selectedSet.has(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }, [selected, selectedSet, onChange]);

  const toggleAll = useCallback(() => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.id));
    }
  }, [selected, options, onChange]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-base text-surface-400">
        <Spinner size="sm" />
        Loading...
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <p className="text-base text-surface-400 py-2">{placeholder}</p>
    );
  }

  const scheduledCount = options.filter((o) => targetScheduleMap[o.id]?.length).length;
  const unscheduledCount = options.length - scheduledCount;

  return (
    <div>
      {/* Summary bar */}
      {options.length > 0 && (
        <div className="flex items-center gap-3 mb-2 text-sm">
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="h-3 w-3" />
            {scheduledCount} already scheduled
          </span>
          <span className="flex items-center gap-1 text-surface-400">
            <AlertCircle className="h-3 w-3" />
            {unscheduledCount} unscheduled
          </span>
        </div>
      )}

      <div className="border border-surface-300 rounded-xl card-bg max-h-[320px] overflow-y-auto">
        {/* Select all */}
        <label className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--glass-border)] hover:bg-surface-50 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.length === options.length && options.length > 0}
            ref={(el) => {
              if (el) el.indeterminate = selected.length > 0 && selected.length < options.length;
            }}
            onChange={toggleAll}
            className="h-3.5 w-3.5 rounded border-surface-300"
          />
          <span className="text-base text-surface-600 font-medium">Select all</span>
        </label>

        {options.map((opt) => {
          const schedules = targetScheduleMap[opt.id] || [];
          const hasSchedules = schedules.length > 0;

          return (
            <div
              key={opt.id}
              className={`border-b border-surface-100 last:border-b-0 ${
                hasSchedules ? 'bg-amber-500/5' : ''
              }`}
            >
              {/* Checkbox row */}
              <label className="flex items-center gap-2 px-3 py-2 hover:bg-surface-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSet.has(opt.id)}
                  onChange={() => toggle(opt.id)}
                  className="h-3.5 w-3.5 rounded border-surface-300"
                />
                <span className="text-base text-surface-700 flex-1">{opt.name}</span>

                {hasSchedules && (
                  <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    {schedules.length} schedule{schedules.length > 1 ? 's' : ''}
                  </span>
                )}
              </label>

              {/* Existing schedules for this target */}
              {hasSchedules && (
                <div className="px-3 pb-2 pl-8 space-y-1">
                  {schedules.map((s) => {
                    const meta = TYPE_META[s.type] || TYPE_META.maintenance;
                    const TypeIcon = meta.icon;
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 rounded-xl border border-surface-200 card-bg px-2 py-1.5 group/sched"
                      >
                        <div className={`h-5 w-5 rounded ${meta.bgColor} flex items-center justify-center shrink-0`}>
                          <TypeIcon className={`h-3 w-3 ${meta.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-surface-700 truncate">{s.name}</p>
                          <p className="text-[10px] text-surface-400 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {cronToHuman(s.cron_expression)}
                            <span className="mx-0.5">·</span>
                            {s.action}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`h-1.5 w-1.5 rounded-full ${s.is_enabled ? 'bg-emerald-500' : 'bg-surface-300'}`} />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onEditSchedule(s.id);
                            }}
                            className="h-5 w-5 rounded flex items-center justify-center text-surface-400 hover:text-primary-600 hover:bg-primary-50 opacity-0 group-hover/sched:opacity-100 transition-all"
                            title="Edit this schedule"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Existing Schedules Panel (collapsible sidebar)
// ---------------------------------------------------------------------------

function ExistingSchedulesPanel({
  schedules,
  editingId,
  onEdit,
}: {
  schedules: Schedule[];
  editingId?: string;
  onEdit: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (schedules.length === 0) return null;

  // Group by type
  const grouped = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    schedules.forEach((s) => {
      if (!map[s.type]) map[s.type] = [];
      map[s.type].push(s);
    });
    return Object.entries(map);
  }, [schedules]);

  return (
    <div className="bryzos-card rounded-3xl">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-surface-500" />
          <span className="text-base font-semibold text-surface-800">Existing Schedules</span>
          <span className="text-sm text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded-full">{schedules.length}</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-surface-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-surface-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-surface-100 px-3 py-2 space-y-3 max-h-[400px] overflow-y-auto">
          {grouped.map(([type, items]) => {
            const meta = TYPE_META[type as ScheduleType] || TYPE_META.maintenance;
            const TypeIcon = meta.icon;
            return (
              <div key={type}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TypeIcon className={`h-3 w-3 ${meta.color}`} />
                  <span className="text-sm font-semibold text-surface-500 uppercase tracking-wider">{meta.label}</span>
                  <span className="text-[10px] text-surface-400">({items.length})</span>
                </div>
                <div className="space-y-1">
                  {items.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => onEdit(s.id)}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 cursor-pointer transition-all group/item ${
                        s.id === editingId
                          ? 'border-primary-300 bg-primary-50/50 ring-1 ring-primary-200'
                          : 'border-surface-200 hover:border-surface-300 hover:bg-surface-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${s.id === editingId ? 'text-primary-700' : 'text-surface-800'}`}>
                          {s.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-surface-400 flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {cronToHuman(s.cron_expression)}
                          </span>
                          <span className="text-[10px] text-surface-400 flex items-center gap-0.5">
                            <Monitor className="h-2.5 w-2.5" />
                            {s.target_ids.length}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`h-1.5 w-1.5 rounded-full ${s.is_enabled ? 'bg-emerald-500' : 'bg-surface-300'}`} />
                        <span className="text-[10px] text-surface-400">{s.action}</span>
                        {s.id === editingId ? (
                          <span className="text-[9px] font-bold text-primary-600 bg-primary-100 px-1 py-0.5 rounded">EDITING</span>
                        ) : (
                          <Pencil className="h-3 w-3 text-surface-400 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main: ScheduleEditorPage
// ---------------------------------------------------------------------------

export function ScheduleEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const isEdit = !!id;

  const [form, setForm] = useState<FormState>(getInitialForm);
  const [initialized, setInitialized] = useState(!isEdit);

  // Fetch existing schedule for edit mode
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['schedule', id],
    queryFn: () => api.get<Schedule>(`/schedules/${id}`),
    enabled: isEdit,
  });

  // Fetch ALL existing schedules for this site (for the awareness panel)
  const { data: allSchedules = [] } = useQuery({
    queryKey: ['schedules', activeSiteId],
    queryFn: () => api.get<Schedule[]>(`/schedules?site_id=${activeSiteId}`),
    enabled: !!activeSiteId,
  });

  // Populate form on load
  useEffect(() => {
    if (existing && !initialized) {
      setForm(scheduleToForm(existing));
      setInitialized(true);
    }
  }, [existing, initialized]);

  // Fetch targets based on target_type
  const { data: devices = [], isLoading: loadingDevices } = useQuery({
    queryKey: ['devices', activeSiteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${activeSiteId}`),
    enabled: !!activeSiteId && form.target_type === 'device',
  });

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['groups', activeSiteId],
    queryFn: () => api.get<DeviceGroup[]>(`/groups?site_id=${activeSiteId}`),
    enabled: !!activeSiteId && form.target_type === 'group',
  });

  const { data: zones = [], isLoading: loadingZones } = useQuery({
    queryKey: ['zones', activeSiteId],
    queryFn: () => api.get<Zone[]>(`/zones?site_id=${activeSiteId}`),
    enabled: !!activeSiteId && form.target_type === 'zone',
  });

  // Derive target options
  const targetOptions: TargetOption[] = useMemo(() => {
    if (form.target_type === 'device') return devices.map((d) => ({ id: d.id, name: d.display_name }));
    if (form.target_type === 'group') return groups.map((g) => ({ id: g.id, name: g.name }));
    if (form.target_type === 'zone') return zones.map((z) => ({ id: z.id, name: z.name }));
    return [];
  }, [form.target_type, devices, groups, zones]);

  const targetLoading = (form.target_type === 'device' && loadingDevices)
    || (form.target_type === 'group' && loadingGroups)
    || (form.target_type === 'zone' && loadingZones);

  // Available actions for selected type
  const availableActions = ACTIONS_BY_TYPE[form.type];

  const staggerApplies = isStaggerableAction(form.type, form.action);

  // Immutable field updaters
  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleTypeChange = useCallback((newType: ScheduleType) => {
    const firstAction = ACTIONS_BY_TYPE[newType][0]?.value ?? '';
    setForm((prev) => ({ ...prev, type: newType, action: firstAction }));
  }, []);

  const handleTargetTypeChange = useCallback((newTargetType: ScheduleTargetType) => {
    setForm((prev) => ({ ...prev, target_type: newTargetType, target_ids: [] }));
  }, []);

  // Navigate to edit another schedule
  const handleEditSchedule = useCallback((scheduleId: string) => {
    navigate(`/schedules/${scheduleId}/edit`);
  }, [navigate]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: () => {
      let parsedPayload: Record<string, unknown> | null = null;
      if (form.payload.trim()) {
        try {
          parsedPayload = JSON.parse(form.payload);
        } catch {
          throw new Error('Invalid JSON in payload field');
        }
      }

      const body = {
        site_id: activeSiteId,
        name: form.name,
        type: form.type,
        target_type: form.target_type,
        target_ids: form.target_ids,
        action: form.action,
        cron_expression: form.cron,
        is_enabled: form.enabled,
        stagger_seconds: isStaggerableAction(form.type, form.action) ? form.staggerSeconds : null,
        ...(parsedPayload ? { payload: parsedPayload } : {}),
      };

      if (isEdit) {
        return api.put<Schedule>(`/schedules/${id}`, body);
      }
      return api.post<Schedule>('/schedules', body);
    },
    onSuccess: () => {
      addToast('success', isEdit ? 'Schedule updated' : 'Schedule created');
      queryClient.invalidateQueries({ queryKey: ['schedules', activeSiteId] });
      navigate('/schedules');
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Save failed');
    },
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      addToast('error', 'Name is required');
      return;
    }
    if (form.target_ids.length === 0) {
      addToast('error', 'At least one target is required');
      return;
    }
    if (!form.cron.trim()) {
      addToast('error', 'Cron expression is required');
      return;
    }

    saveMutation.mutate();
  }, [form, addToast, saveMutation]);

  // No site
  if (!activeSiteId) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-surface-900 leading-tight mb-4">
          {isEdit ? 'Edit Schedule' : 'New Schedule'}
        </h1>
        <EmptyState
          icon={Calendar}
          title="No Site Selected"
          description="Please select a site from the header."
        />
      </div>
    );
  }

  // Loading edit data
  if (isEdit && loadingExisting) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" className="text-surface-400" />
      </div>
    );
  }

  // Not found
  if (isEdit && !existing && !loadingExisting) {
    return (
      <EmptyState
        icon={Calendar}
        title="Schedule not found"
        description="The schedule you are looking for does not exist or was deleted."
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate('/schedules')}>
            Back to Schedules
          </Button>
        }
      />
    );
  }

  const showPayload = form.action === 'push_content' || form.action === 'set_config' || form.action === 'set_playlist';

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-base">
        <Link
          to="/schedules"
          className="text-surface-500 hover:text-surface-700 transition-colors"
        >
          Schedules
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-surface-400" />
        <span className="text-surface-900 font-medium">
          {isEdit ? existing?.name ?? 'Edit' : 'New Schedule'}
        </span>
      </nav>

      {/* Two-column layout: Form + Existing Schedules */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: Form */}
        <form onSubmit={handleSubmit} className="flex-1 min-w-0 max-w-2xl">
          <div className="bryzos-card rounded-3xl divide-y divide-[var(--glass-border)]">

            {/* Section: Basic Info */}
            <div className="p-4 space-y-5">
              <h2 className="text-lg font-bold text-surface-900">Basic Info</h2>

              <div>
                <label className="block text-sm font-semibold text-surface-600 mb-1.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="h-10 w-full px-3 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="e.g. Morning Power On"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => handleTypeChange(e.target.value as ScheduleType)}
                    className="h-10 w-full px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {SCHEDULE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5">Action</label>
                  <select
                    value={form.action}
                    onChange={(e) => updateField('action', e.target.value)}
                    className="h-10 w-full px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {availableActions.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <ToggleSwitch
                  checked={form.enabled}
                  onChange={() => updateField('enabled', !form.enabled)}
                  label={form.enabled ? 'Enabled' : 'Disabled'}
                />
              </div>
            </div>

            {/* Section: Target */}
            <div className="p-4 space-y-5">
              <h2 className="text-lg font-bold text-surface-900">Target</h2>

              <div>
                <label className="block text-sm font-semibold text-surface-600 mb-1.5">Target Type</label>
                <select
                  value={form.target_type}
                  onChange={(e) => handleTargetTypeChange(e.target.value as ScheduleTargetType)}
                  className="h-10 w-full px-2 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {TARGET_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                  Select {form.target_type === 'device' ? 'Devices' : form.target_type === 'group' ? 'Groups' : 'Zones'}
                </label>
                <ScheduleAwareMultiSelect
                  options={targetOptions}
                  selected={form.target_ids}
                  onChange={(ids) => updateField('target_ids', ids)}
                  loading={targetLoading}
                  placeholder={`No ${form.target_type}s found for this site`}
                  existingSchedules={allSchedules}
                  targetType={form.target_type}
                  editingScheduleId={isEdit ? id : undefined}
                  onEditSchedule={handleEditSchedule}
                />
                {form.target_ids.length > 0 && (
                  <p className="text-xs text-surface-400 mt-1">
                    {form.target_ids.length} selected
                  </p>
                )}
              </div>
            </div>

            {/* Section: Schedule (Cron) */}
            <div className="p-4 space-y-5">
              <h2 className="text-lg font-bold text-surface-900">Schedule</h2>
              <CronBuilder
                value={form.cron}
                onChange={(cron) => updateField('cron', cron)}
              />
            </div>

            {/* Section: Payload (conditional) */}
            {showPayload && (
              <div className="p-4 space-y-5">
                <h2 className="text-lg font-bold text-surface-900">Payload</h2>
                <div>
                  <label className="block text-sm font-semibold text-surface-600 mb-1.5">
                    JSON Payload (optional)
                  </label>
                  <textarea
                    value={form.payload}
                    onChange={(e) => updateField('payload', e.target.value)}
                    rows={5}
                    className="w-full px-3 py-2 rounded-xl border border-surface-300 card-bg text-base text-surface-700 font-mono placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-y"
                    placeholder='{"content_id": "...", "transition": "fade"}'
                  />
                </div>
              </div>
            )}

            {/* Actions bar */}
            <div className="flex items-center justify-end gap-2 px-4 py-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate('/schedules')}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={saveMutation.isPending}
              >
                <Save className="h-3.5 w-3.5" />
                {isEdit ? 'Save Changes' : 'Create Schedule'}
              </Button>
            </div>
          </div>
        </form>

        {/* Right: Power options + Existing Schedules panel */}
        <div className="lg:w-[340px] shrink-0 space-y-3">
          {staggerApplies && (
            <div className="bryzos-card rounded-3xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Power className="h-4 w-4 text-amber-600" />
                <span className="text-base font-semibold text-surface-800">Power options</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold text-surface-600">Stagger gap</label>
                  <span className="text-base font-bold text-surface-900">{form.staggerSeconds}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={form.staggerSeconds}
                  onChange={(e) => updateField('staggerSeconds', Number(e.target.value))}
                  className="w-full accent-primary-600"
                />
                <p className="text-xs text-surface-400 mt-1">
                  Delay inserted between each device powering on, so they don't all draw
                  inrush current at once. Devices start parent-PCs first, then by power order.
                </p>
              </div>

              {form.target_ids.length > 1 && form.staggerSeconds > 0 && (
                <div className="rounded-xl border border-[var(--glass-border)] bg-surface-50 px-3 py-2">
                  <p className="text-xs text-surface-500">
                    {form.target_type === 'device'
                      ? `~${(form.target_ids.length - 1) * form.staggerSeconds}s for all ${form.target_ids.length} devices to start.`
                      : `Sequence length depends on how many devices are in the selected ${form.target_type}(s).`}
                  </p>
                </div>
              )}
            </div>
          )}

          <ExistingSchedulesPanel
            schedules={allSchedules}
            editingId={isEdit ? id : undefined}
            onEdit={handleEditSchedule}
          />

          {/* Quick tip */}
          {!isEdit && allSchedules.length > 0 && (
            <div className="mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3">
              <p className="text-sm text-blue-500 font-medium mb-1">Avoid duplicates</p>
              <p className="text-sm text-blue-600 leading-relaxed">
                Devices with existing schedules are marked with an amber badge in the target list.
                Hover to see schedule details and click the edit icon to modify them.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
