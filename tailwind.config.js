/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cores do Tutts (ajuste conforme sua identidade visual)
        tutts: {
          primary: '#2563eb',    // Azul principal
          secondary: '#1e40af',  // Azul escuro
          accent: '#3b82f6',     // Azul claro
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          dark: '#1f2937',
          light: '#f3f4f6',
        },
      },
    },
  },
  plugins: [],
};
