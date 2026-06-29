'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AddTransactionModal } from './AddTransactionModal';
import { Category, DirectoryUser, Group } from '@/lib/types';

export function AddTransactionTrigger({
  categories,
  directory,
  groups,
  currentUserId,
}: {
  categories: Category[];
  directory: DirectoryUser[];
  groups: Group[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-20 w-14 h-14 rounded-full bg-emerald text-paper flex items-center justify-center shadow-lg shadow-emerald/30 hover:bg-emerald/90 transition-colors"
        aria-label="Add transaction"
      >
        <Plus size={26} />
      </button>
      {open && (
        <AddTransactionModal
          categories={categories}
          directory={directory}
          groups={groups}
          currentUserId={currentUserId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
