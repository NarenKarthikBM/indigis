import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#F8FAFC",
          secondary: "#FFFFFF",
        },
        surface: {
          DEFAULT: "#F1F5F9",
          raised: "#FFFFFF",
          hover: "#E2E8F0",
        },
        accent: {
          purple: "#7C3AED",
          coral: "#EF4444",
          blue: "#3B82F6",
        },
        text: {
          primary: "#0F172A",
          secondary: "#475569",
          muted: "#94A3B8",
        },
        border: {
          DEFAULT: "#E2E8F0",
          strong: "#CBD5E1",
        },
        success: "#10B981",
        nav: {
          bg: "#312E81",
          active: "#4338CA",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderColor: {
        DEFAULT: "#E2E8F0",
      },
    },
  },
  plugins: [],
};

export default config;
