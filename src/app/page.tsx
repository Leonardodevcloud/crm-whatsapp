'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider } from '@/lib/hooks';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Verificar se tem token
    const token = localStorage.getItem('tutts_crm_token');
    if (token) {
      router.push('/inbox');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <AuthProvider>
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    </AuthProvider>
  );
}
