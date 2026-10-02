import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Every color below is CSS-var-backed (see globals.css :root / .dark) using the
        // hsl(var(--x) / <alpha-value>) pattern, so dark mode swaps the whole palette in
        // one place and Tailwind's opacity modifiers (e.g. bg-ink-700/30) keep working.
        paper: {
          50: "hsl(var(--paper-50) / <alpha-value>)",
          100: "hsl(var(--paper-100) / <alpha-value>)",
          200: "hsl(var(--paper-200) / <alpha-value>)",
          300: "hsl(var(--paper-300) / <alpha-value>)",
          400: "hsl(var(--paper-400) / <alpha-value>)",
        },
        ink: {
          100: "hsl(var(--ink-100) / <alpha-value>)",
          200: "hsl(var(--ink-200) / <alpha-value>)",
          300: "hsl(var(--ink-300) / <alpha-value>)",
          400: "hsl(var(--ink-400) / <alpha-value>)",
          500: "hsl(var(--ink-500) / <alpha-value>)",
          600: "hsl(var(--ink-600) / <alpha-value>)",
          700: "hsl(var(--ink-700) / <alpha-value>)",
        },
        accent: {
          blue: "hsl(var(--accent-blue) / <alpha-value>)",
          "blue-light": "hsl(var(--accent-blue-light) / <alpha-value>)",
          green: "hsl(var(--accent-green) / <alpha-value>)",
          "green-light": "hsl(var(--accent-green-light) / <alpha-value>)",
          yellow: "hsl(var(--accent-yellow) / <alpha-value>)",
          "yellow-light": "hsl(var(--accent-yellow-light) / <alpha-value>)",
          red: "hsl(var(--accent-red) / <alpha-value>)",
          "red-light": "hsl(var(--accent-red-light) / <alpha-value>)",
        },
        // shadcn/ui semantic tokens, mapped onto the palette above rather than shadcn's
        // default zinc/slate — so every shadcn primitive (Button, Input, Dialog, Select,
        // ...) automatically matches the sketch theme in both light and dark mode.
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        "shadcn-accent": {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        sketch: ["Caveat", "cursive"],
      },
      boxShadow: {
        sketch: "2px 2px 0 rgba(0,0,0,0.05)",
        "sketch-hover": "3px 3px 0 rgba(0,0,0,0.08)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
