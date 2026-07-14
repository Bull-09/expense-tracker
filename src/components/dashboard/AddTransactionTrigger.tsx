'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AddTransactionModal } from './AddTransactionModal';
import { AiQuickAddModal } from './AiQuickAddModal';
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
        className="fixed bottom-36 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-emerald text-paper shadow-lg shadow-emerald/30 transition-colors hover:bg-emerald/90 lg:bottom-24 lg:right-8"
        aria-label="Add transaction"
      >
        <Plus size={22} />
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
      <AiQuickAddModal
        categories={categories}
        directory={directory}
        groups={groups}
        currentUserId={currentUserId}
      />
    </>
  );
}
