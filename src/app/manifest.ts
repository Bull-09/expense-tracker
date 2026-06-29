import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mithu Chit Fund Tracker',
    short_name: 'Mithu',
    description: 'Track personal money and shared expenses with friends.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#0F1115',
    theme_color: '#3F7A5C',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/maskable-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
