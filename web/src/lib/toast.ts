export type ToastKind = "ok" | "warn" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  kind?: ToastKind;
  action?: ToastAction;
  durationMs?: number;
}

/**
 * Show a transient toast. The 3-arg signature accepts a `kind` string for
 * backward compatibility with existing call sites; the object signature lets
 * callers add an optional action button (used by Triage Undo).
 */
export function showToast(
  message: string,
  kindOrOptions: ToastKind | ToastOptions = "ok",
): void {
  const options: ToastOptions =
    typeof kindOrOptions === "string"
      ? { kind: kindOrOptions }
      : kindOrOptions;
  const kind = options.kind || "ok";
  const durationMs = options.durationMs ?? (options.action ? 5000 : 2400);

  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  toast.appendChild(text);

  if (options.action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = options.action.label;
    button.addEventListener("click", () => {
      try {
        options.action?.onClick();
      } finally {
        toast.classList.remove("toast-show");
        setTimeout(() => toast.remove(), 240);
      }
    });
    toast.appendChild(button);
  }

  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-show"));
  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => toast.remove(), 240);
  }, durationMs);
}
