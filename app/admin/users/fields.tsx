import { WORSHIP_FEATURES, type WorshipFeatureKey } from "@/lib/worship-auth/features";

export const fieldClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none ring-[#7bbc07] transition focus:ring-2";

export function TextField({
  label,
  name,
  type = "text",
  required,
  minLength,
  autoComplete,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const id = `${name}-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <label htmlFor={id} className="block text-sm font-medium text-neutral-300">
      {label}
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={fieldClass}
      />
    </label>
  );
}

export function FeatureChecks({
  selected,
  disabled = false,
}: {
  selected: readonly WorshipFeatureKey[];
  disabled?: boolean;
}) {
  const selectedKeys = new Set<string>(selected);

  return (
    <fieldset disabled={disabled} className="disabled:opacity-50">
      <legend className="text-sm font-medium text-neutral-300">Feature access</legend>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        {disabled
          ? "Administrators can open every feature."
          : "Check the tools this person should be allowed to use. Enforcement is added per tool, with documentation next."}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {WORSHIP_FEATURES.map((feature) => (
          <label
            key={feature.key}
            className="flex items-start gap-3 rounded-xl border border-white/10 bg-neutral-950/50 px-3 py-3 text-sm text-neutral-200"
          >
            <input
              type="checkbox"
              name="features"
              value={feature.key}
              defaultChecked={selectedKeys.has(feature.key)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-neutral-900 accent-[#7bbc07]"
            />
            <span>
              <span className="block font-medium">{feature.label}</span>
              <span className="mt-0.5 block text-xs text-neutral-500">{feature.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
