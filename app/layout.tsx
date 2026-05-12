import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import GrainCanvas from '@/components/GrainCanvas';

export const metadata: Metadata = {
  title: 'casebook.chat',
  description: 'A forum for Indian law students and lawyers',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ position: 'relative', overflowX: 'hidden' }}>
        <AuthProvider>
          {/* Live film grain overlay */}
          <GrainCanvas />

          {/* Reading progress bar */}
          <div
            id="readProg"
            style={{
              position: 'fixed',
              top: 'var(--nav-h)',
              left: 0,
              height: 2,
              background: 'linear-gradient(90deg, var(--accent), var(--gold))',
              width: '0%',
              zIndex: 300,
              transition: 'width .1s linear',
            }}
          />

          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
