/** @type {import('tailwindcss').Config} */
const themeColor = name => ({ opacityValue }) => opacityValue === undefined
  ? `var(--theme-${name})`
  : `color-mix(in srgb, var(--theme-${name}) calc(${opacityValue} * 100%), transparent)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: themeColor("background"),
        surface: themeColor("surface"),
        border: themeColor("border"),
        "text-primary": themeColor("text"),
        "text-secondary": themeColor("muted"),
        accent: themeColor("accent"),
        success: themeColor("success"),
        warning: themeColor("warning"),
        error: themeColor("error"),
      },
    },
  },
  plugins: [],
};
