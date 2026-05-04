/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: "var(--tg-theme-bg-color, #17212b)",
          text: "var(--tg-theme-text-color, #f5f5f7)",
          hint: "var(--tg-theme-hint-color, #7d8b99)",
          link: "var(--tg-theme-link-color, #6ab2f2)",
          button: "var(--tg-theme-button-color, #7b61ff)",
          "button-text": "var(--tg-theme-button-text-color, #ffffff)",
          "secondary-bg": "var(--tg-theme-secondary-bg-color, #232e3c)",
        },
        card: "var(--tg-theme-secondary-bg-color, #232e3c)",
        accent: {
          DEFAULT: "var(--accent)",
          text: "var(--accent-text)",
          muted: "var(--accent-muted)",
        },
        "role-buyer": "var(--role-buyer)",
        "role-owner": "var(--role-owner)",
        danger: "var(--danger)",
        success: "var(--success)",
      },
      borderRadius: {
        card: "var(--radius-card, 18px)",
        button: "var(--radius-button, 14px)",
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
      },
    },
  },
  plugins: [],
};
