import type React from "react";

/**
 * Operator-side styling. Intentionally separate from the brand Tailwind
 * tokens so the admin console stays distinct from the user-facing app and
 * doesn't get accidentally caught up in TG theme overrides.
 */

export const palette = {
  bg: "#0f1419",
  panel: "#1b232e",
  border: "#2a3441",
  borderHi: "#3a4555",
  text: "#e5e7eb",
  textDim: "#94a3b8",
  textMuted: "#6b7888",
  accent: "#7c5cff",
  warn: "#7c5e00",
  ok: "#15803d",
  bad: "#7f1d1d",
};

export const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: palette.text,
    background: palette.bg,
    // Body has overflow: hidden globally (iOS rubber-band fix for the
    // Mini App). The operator console runs in a regular browser and
    // can have long tables/lists, so it owns its own scroll container.
    height: "100vh",
    overflowY: "auto",
  },
  shell: { padding: 16, maxWidth: 1100, margin: "0 auto" },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  title: { margin: 0, fontSize: 18, flex: 1 },
  tabBar: {
    display: "flex",
    gap: 4,
    borderBottom: `1px solid ${palette.border}`,
    marginBottom: 16,
  },
  tab: {
    padding: "8px 14px",
    border: "none",
    background: "transparent",
    color: palette.textDim,
    cursor: "pointer",
    fontSize: 13,
    borderBottom: "2px solid transparent",
    fontFamily: "inherit",
  },
  tabActive: {
    color: palette.text,
    borderBottomColor: palette.accent,
  },
  card: {
    background: palette.panel,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    padding: 12,
  },
  meta: { fontSize: 12, marginBottom: 4 },
  label: { color: palette.textMuted, marginRight: 6 },
  details: {
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    whiteSpace: "pre-wrap",
    margin: "8px 0",
    fontFamily: "inherit",
  },
  btn: {
    padding: "6px 10px",
    border: `1px solid ${palette.border}`,
    borderRadius: 6,
    background: "#232c39",
    color: palette.text,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnPrimary: {
    background: palette.accent,
    borderColor: palette.accent,
    color: "white",
  },
  btnDanger: {
    background: palette.bad,
    borderColor: palette.bad,
    color: "white",
  },
  btnWarn: {
    background: palette.warn,
    borderColor: palette.warn,
    color: "white",
  },
  btnGhost: {
    background: "transparent",
  },
  input: {
    padding: "6px 10px",
    border: `1px solid ${palette.border}`,
    borderRadius: 6,
    background: palette.bg,
    color: palette.text,
    fontSize: 13,
    fontFamily: "inherit",
    minWidth: 160,
  },
  select: {
    padding: "6px 10px",
    border: `1px solid ${palette.border}`,
    borderRadius: 6,
    background: palette.bg,
    color: palette.text,
    fontSize: 13,
    fontFamily: "inherit",
  },
  pill: {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 4,
    fontSize: 10,
    marginLeft: 6,
    color: "white",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  pillBan: { background: palette.bad },
  pillDeleted: { background: palette.textMuted, color: "#000" },
  pillOnline: { background: palette.ok },
  pillRole: { background: "#3a4555" },
  error: { color: "#f87171" },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    zIndex: 100,
    display: "flex",
    alignItems: "stretch",
    justifyContent: "center",
    padding: 16,
    overflowY: "auto",
  },
  modal: {
    background: palette.panel,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    width: "100%",
    maxWidth: 800,
    margin: "auto",
    padding: 16,
    boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },
  th: {
    textAlign: "left",
    padding: "8px 6px",
    borderBottom: `1px solid ${palette.border}`,
    color: palette.textDim,
    fontWeight: 500,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  td: {
    padding: "8px 6px",
    borderBottom: `1px solid ${palette.border}`,
    verticalAlign: "top",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    background: palette.panel,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    padding: 12,
  },
  statLabel: {
    fontSize: 11,
    color: palette.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: { fontSize: 24, fontWeight: 600 },
  statHint: { fontSize: 11, color: palette.textDim, marginTop: 2 },
  row: {
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    background: palette.panel,
  },
  toolbar: {
    display: "flex",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  bubble: {
    padding: "6px 10px",
    borderRadius: 8,
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    maxWidth: "75%",
    fontSize: 13,
    margin: "4px 0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  msgRow: { display: "flex", flexDirection: "column", marginBottom: 6 },
  msgMeta: { fontSize: 10, color: palette.textMuted, marginBottom: 2 },
};

export function pillFor(
  status: { bannedAt: string | null; deletedAt: string | null; isOnline?: boolean },
): React.ReactNode {
  return (
    <>
      {status.deletedAt && (
        <span style={{ ...styles.pill, ...styles.pillDeleted }}>удалён</span>
      )}
      {status.bannedAt && (
        <span style={{ ...styles.pill, ...styles.pillBan }}>забанен</span>
      )}
      {status.isOnline && (
        <span style={{ ...styles.pill, ...styles.pillOnline }}>онлайн</span>
      )}
    </>
  );
}
