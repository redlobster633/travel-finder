"use client";

import { useState, type FormEvent } from "react";
import {
  DIET_PRESETS,
  INTEREST_PRESETS,
  addPreference,
  hasPreferences,
  preferenceLabel,
  togglePreference,
  type PreferenceKind,
  type Preferences,
  EMPTY_PREFERENCES,
} from "@/lib/preferences";

function chipClass(on: boolean) {
  return `rounded-full px-3 py-1 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
    on ? "bg-white font-semibold text-orange-600" : "bg-white/20 hover:bg-white/30"
  }`;
}

function PreferenceRow({
  kind,
  label,
  hint,
  presets,
  selected,
  onChange,
}: {
  kind: PreferenceKind;
  label: string;
  hint: string;
  presets: readonly { id: string; label: string }[];
  selected: Preferences;
  onChange: (next: Preferences) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const ids = kind === "diet" ? selected.diets : selected.interests;
  const custom = ids.filter((id) => !presets.some((preset) => preset.id === id));

  function toggle(id: string) {
    setNote(null);
    onChange(togglePreference(selected, kind, id));
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const result = addPreference(selected, kind, draft);
    if (!result.ok) {
      setNote(result.reason === "full" ? "You can pick up to 8." : "Use a short phrase, like pescatarian.");
      return;
    }
    setDraft("");
    setAdding(false);
    setNote(null);
    onChange(result.preferences);
  }

  return (
    <div role="group" aria-label={label}>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {presets.map((preset) => {
          const on = ids.includes(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(preset.id)}
              className={chipClass(on)}
            >
              {preset.label}
            </button>
          );
        })}
        {custom.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed
            onClick={() => toggle(id)}
            className={chipClass(true)}
          >
            {preferenceLabel(kind, id)}
          </button>
        ))}
        {adding ? (
          <form onSubmit={add} className="flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && event.currentTarget.form?.contains(next)) return;
                if (!draft.trim()) {
                  setAdding(false);
                  setNote(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                  setNote(null);
                }
              }}
              maxLength={40}
              placeholder={hint}
              aria-label={`Add your own ${label.toLowerCase()}`}
              className="w-36 rounded-full bg-white px-3 py-1 text-sm text-stone-900 outline-none placeholder:text-stone-400"
            />
            <button type="submit" className={chipClass(false)}>
              Add
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={chipClass(false)}>
            + Add
          </button>
        )}
      </div>
      {note && <p className="mt-1 text-xs text-white/90">{note}</p>}
    </div>
  );
}

export default function PreferenceBar({
  value,
  onChange,
}: {
  value: Preferences;
  onChange: (next: Preferences) => void;
}) {
  return (
    <div className="mt-5 space-y-3">
      <PreferenceRow
        kind="diet"
        label="Diet, optional"
        hint="e.g. pescatarian"
        presets={DIET_PRESETS}
        selected={value}
        onChange={onChange}
      />
      <PreferenceRow
        kind="interest"
        label="Want to do, optional"
        hint="e.g. live music"
        presets={INTEREST_PRESETS}
        selected={value}
        onChange={onChange}
      />
      {hasPreferences(value) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_PREFERENCES)}
          className="text-sm text-white/90 underline-offset-2 hover:underline"
        >
          Clear preferences
        </button>
      )}
    </div>
  );
}
