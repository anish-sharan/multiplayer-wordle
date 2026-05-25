import "./globals.css";

export const metadata = {
  title: "Multiplayer Wordle",
  description: "Play Wordle with friends in real time — co-op on a shared board or versus race mode.",
};

// Mobile-friendly viewport: fit device width, allow pinch-zoom for accessibility.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e0f1a",
};

// Applies the saved theme before first paint so there's no flash of the
// wrong palette. Falls back to the dark theme.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
