/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand-fixed palette — independent of the user's TG theme so the
        // gradient-mesh + glass design reads consistently for everyone.
        tg: {
          bg: "var(--app-bg)",
          "bg-deep": "var(--app-bg-deep)",
          text: "var(--app-text)",
          "text-secondary": "var(--app-text-secondary)",
          hint: "var(--app-hint)",
          "secondary-bg": "var(--app-glass)",
          button: "var(--accent)",
          "button-text": "var(--accent-text)",
        },
        glass: {
          DEFAULT: "var(--app-glass)",
          strong: "var(--app-glass-strong)",
          elevated: "var(--app-glass-elevated)",
        },
        // Legacy aliases so existing screens keep compiling.
        card: "var(--app-glass)",
        "card-elevated": "var(--app-glass-elevated)",
        "app-border": "var(--app-glass-border)",
        "app-border-strong": "var(--app-glass-border-strong)",
        accent: {
          DEFAULT: "var(--accent)",
          2: "var(--accent-2)",
          text: "var(--accent-text)",
          muted: "var(--accent-muted)",
          ring: "var(--accent-ring)",
        },
        "role-buyer": "var(--role-buyer)",
        "role-owner": "var(--role-owner)",
        danger: {
          DEFAULT: "var(--danger)",
          muted: "var(--danger-muted)",
        },
        success: "var(--success)",
      },
      borderRadius: {
        card: "var(--radius-card)",
        button: "var(--radius-button)",
        input: "var(--radius-input)",
        chip: "var(--radius-chip)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        action: "0 8px 24px -8px rgba(0, 0, 0, 0.5)",
        glow: "var(--accent-glow)",
        "glow-success": "0 8px 28px -8px rgba(16, 185, 129, 0.5)",
        "glow-danger": "0 8px 28px -8px rgba(239, 68, 68, 0.5)",
      },
      backgroundImage: {
        "accent-gradient": "linear-gradient(135deg, var(--accent), var(--accent-2))",
      },
    },
  },
  plugins: [],
};
