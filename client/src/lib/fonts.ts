import { Anton, Sora } from 'next/font/google';

export const anton = Anton({
  weight: ['400'],
  subsets: ['latin'],
  variable: '--font-anton',
  display: 'swap',
});

export const sora = Sora({
  weight: ['600'],
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
});
