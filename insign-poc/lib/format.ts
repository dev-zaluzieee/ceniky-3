export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("cs-CZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(status: string): string {
  switch (status) {
    case "created": return "Vytvořeno";
    case "extern_sent": return "Odesláno externím podepisujícím";
    case "completed": return "Podepsáno";
    case "rejected": return "Zamítnuto";
    default: return status;
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed": return "bg-emerald-100 text-emerald-800";
    case "rejected": return "bg-rose-100 text-rose-800";
    case "extern_sent": return "bg-amber-100 text-amber-800";
    case "created": return "bg-blue-100 text-blue-800";
    default: return "bg-gray-100 text-gray-800";
  }
}
