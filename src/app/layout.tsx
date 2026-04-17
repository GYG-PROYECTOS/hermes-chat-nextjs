import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hermes Wiki Chat',
  description: 'Chat con documentos del wiki Hermes',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
