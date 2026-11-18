export function Spinner({ label = "Load ho raha hai…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-emerald-100/70">
      <span
        aria-hidden
        className="h-8 w-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin"
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="glass animate-pop-in rounded-2xl border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
      <p className="font-semibold">Kuch ghalat ho gaya</p>
      <p className="mt-1 opacity-90">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full bg-red-500/20 px-4 py-1.5 font-semibold text-red-100 transition hover:bg-red-500/30"
        >
          Dobara try karo
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass animate-fade-up rounded-3xl px-6 py-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-3xl shadow-[0_0_30px_rgba(34,197,94,0.25)]">
        📦
      </div>
      <h3 className="mt-5 text-lg font-bold text-emerald-50">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-emerald-100/60">
        {body}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
