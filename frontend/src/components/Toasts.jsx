import { useToast } from "../store/toast";

const TONE = {
  success: "bg-emerald-600",
  error: "bg-red-600",
  info: "bg-ink-900",
};

export default function Toasts() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${TONE[t.type] || TONE.info} text-white rounded-lg shadow-pop px-4 py-3 text-sm flex items-start gap-2 animate-[fadeIn_.15s_ease]`}
          role="alert"
        >
          <span className="flex-1">{t.message}</span>
          <button className="opacity-70 hover:opacity-100" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
