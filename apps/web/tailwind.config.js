/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand-fixed palette — does NOT inherit from the user's TG theme.
        // (We tried --tg-theme-* originally but some TG themes ship values
        //  that collapse our cards/inputs into the page bg. Forcing our
        //  own palette gives a consistent reference-mockup look.)
        tg: {
          bg: "var(--app-bg)",
          text: "var(--app-text)",
          "text-secondary": "var(--app-text-secondary)",
          hint: "var(--app-hint)",
          "secondary-bg": "var(--app-card)",
          button: "var(--accent)",
          "button-text": "var(--accent-text)",
        },
        card: "var(--app-card)",
        "card-elevated": "var(--app-card-elevated)",
        "app-border": "var(--app-border)",
        "app-border-strong": "var(--app-border-strong)",
        accent: {
          DEFAULT: "var(--accent)",
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
        action: "0 8px 24px -8px rgba(0, 0, 0, 0.45)",
        "card-elevated": "0 1px 0 rgba(255, 255, 255, 0.04) inset",
      },
    },
  },
  plugins: [],
};
