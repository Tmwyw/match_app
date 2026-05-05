import { Plus, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { cn } from "./cn";

type Props = {
  /** Suggested chips users can pick with one tap. Tapping a preset toggles it. */
  presets: readonly string[];
  /** Currently selected values (may include both presets and custom strings). */
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** "single" replaces existing selection; "multi" toggles. */
  mode?: "multi" | "single";
  max?: number;
  /** Placeholder for the custom-input textbox. */
  placeholder?: string;
};

export function TagInput({
  presets,
  value,
  onChange,
  mode = "multi",
  max,
  placeholder = "Своё значение…",
}: Props) {
  const [draft, setDraft] = useState("");

  const normalize = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "_");

  const addTag = (raw: string) => {
    const tag = normalize(raw);
    if (!tag) return;
    if (tag.length > 40) return;
    if (value.includes(tag)) return;
    if (mode === "single") {
      onChange([tag]);
    } else {
      if (max && value.length >= max) return;
      onChange([...value, tag]);
    }
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((v) => v !== tag));
  };

  const togglePreset = (preset: string) => {
    if (mode === "single") {
      onChange(value[0] === preset ? [] : [preset]);
      return;
    }
    if (value.includes(preset)) {
      removeTag(preset);
    } else {
      addTag(preset);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeTag(value[value.length - 1]!);
    }
  };

  const presetSet = new Set(presets);
  const customSelected = value.filter((v) => !presetSet.has(v));
  const reachedLimit = mode === "multi" && max != null && value.length >= max;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Selected (presets + custom mixed) shown as removable chips on top */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <button
              type="button"
              key={tag}
              onClick={() => removeTag(tag)}
              className="rounded-chip px-3 py-1.5 text-sm font-medium bg-accent-gradient text-accent-text shadow-glow border border-white/15 inline-flex items-center gap-1.5"
            >
              {tag}
              <X size={14} className="opacity-80" />
            </button>
          ))}
        </div>
      )}

      {/* Preset suggestions — already-selected ones omitted */}
      <div className="flex flex-wrap gap-2">
        {presets
          .filter((p) => !value.includes(p))
          .map((preset) => (
            <button
              type="button"
              key={preset}
              onClick={() => togglePreset(preset)}
              disabled={reachedLimit}
              className={cn(
                "rounded-chip px-3 py-1.5 text-sm font-medium transition active:scale-[0.97] glass text-tg-text-secondary hover:border-app-border-strong disabled:opacity-40",
              )}
            >
              {preset}
            </button>
          ))}
      </div>

      {/* Custom add */}
      {!reachedLimit && (
        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            maxLength={40}
            className="flex-1 h-10 rounded-button glass-input text-tg-text placeholder:text-tg-hint px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={() => addTag(draft)}
            disabled={!draft.trim()}
            className="h-10 w-10 rounded-button bg-accent-gradient text-accent-text shadow-glow border border-white/15 flex items-center justify-center disabled:opacity-40 active:scale-95"
            aria-label="добавить"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      {customSelected.length > 0 && (
        <p className="text-[11px] text-tg-hint px-1">
          Свои значения: {customSelected.join(", ")}
        </p>
      )}
    </div>
  );
}
