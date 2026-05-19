import "./styles.css";

export const metadata = {
  title: "MMP Budget Dashboard",
  description: "Authenticated sales budget dashboard with approved access"
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
