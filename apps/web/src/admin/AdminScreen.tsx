import { useState } from "react";
import { ChatViewerPanel } from "./ChatViewerPanel";
import { ReportsTab } from "./ReportsTab";
import { StatsTab } from "./StatsTab";
import { UserDetailPanel } from "./UserDetailPanel";
import { UsersTab } from "./UsersTab";
import { styles } from "./admin-styles";

type Tab = "stats" | "users" | "reports";

const TABS: readonly { key: Tab; label: string }[] = [
  { key: "stats", label: "статистика" },
  { key: "users", label: "пользователи" },
  { key: "reports", label: "жалобы" },
];

/**
 * Operator console — opened via /?admin=<token>. Token is sent as Bearer
 * on every /admin/* call. Intentionally not styled to match the Mini App;
 * it's an out-of-band tool, not user-facing. Stack: tab content + an
 * optional user detail modal + chat transcript modal layered on top.
 */
export function AdminScreen({ token }: { token: string }) {
  const [tab, setTab] = useState<Tab>("stats");
  const [userPanel, setUserPanel] = useState<string | null>(null);
  const [chatPanel, setChatPanel] = useState<string | null>(null);

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.header}>
          <h1 style={styles.title}>CREO Metrics · admin</h1>
        </div>

        <div style={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.key}
              style={{
                ...styles.tab,
                ...(tab === t.key ? styles.tabActive : null),
              }}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "stats" && <StatsTab token={token} />}
        {tab === "users" && (
          <UsersTab token={token} onOpenUser={setUserPanel} />
        )}
        {tab === "reports" && (
          <ReportsTab
            token={token}
            onOpenUser={setUserPanel}
            onOpenChat={setChatPanel}
          />
        )}
      </div>

      {userPanel && (
        <UserDetailPanel
          token={token}
          userId={userPanel}
          onClose={() => setUserPanel(null)}
          onOpenChat={setChatPanel}
          onOpenUser={setUserPanel}
        />
      )}
      {chatPanel && (
        <ChatViewerPanel
          token={token}
          chatId={chatPanel}
          onClose={() => setChatPanel(null)}
          onOpenUser={(id) => {
            setChatPanel(null);
            setUserPanel(id);
          }}
        />
      )}
    </div>
  );
}
