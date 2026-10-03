import { NOTIFICATION_CATEGORIES } from "@/lib/permissions";

interface NotificationPrefsEditorProps {
  // Category keys this admin will NOT receive
  muted: string[];
  onChange: (muted: string[]) => void;
}

const NotificationPrefsEditor: React.FC<NotificationPrefsEditorProps> = ({ muted, onChange }) => {
  const allOn = muted.length === 0;
  const allOff = muted.length === NOTIFICATION_CATEGORIES.length;

  const toggle = (key: string, receive: boolean) =>
    onChange(receive ? muted.filter((k) => k !== key) : [...muted, key]);

  return (
    <div className="border rounded-lg">
      <div className="flex items-center justify-end gap-3 px-3 py-2 border-b text-xs">
        <button type="button" className="text-primary hover:underline disabled:opacity-40 disabled:no-underline"
          disabled={allOn} onClick={() => onChange([])}>
          Receive all
        </button>
        <button type="button" className="text-primary hover:underline disabled:opacity-40 disabled:no-underline"
          disabled={allOff} onClick={() => onChange(NOTIFICATION_CATEGORIES.map((c) => c.key))}>
          Mute all
        </button>
      </div>
      <div className="px-3 py-2 grid gap-1.5 sm:grid-cols-2">
        {NOTIFICATION_CATEGORIES.map((cat) => (
          <label key={cat.key} className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="accent-primary mt-0.5"
              checked={!muted.includes(cat.key)}
              onChange={(e) => toggle(cat.key, e.target.checked)}
            />
            <span>
              {cat.label}
              <span className="block text-xs text-muted-foreground">{cat.description}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default NotificationPrefsEditor;
