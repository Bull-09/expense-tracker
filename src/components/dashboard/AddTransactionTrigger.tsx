'use client';

import { useState } from 'react';
import { Mic, Plus } from 'lucide-react';
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
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-40 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-lg shadow-gold/25 transition-colors hover:bg-gold/90 lg:bottom-24 lg:right-8"
        aria-label="AI quick add"
      >
        <Mic size={24} />
      </button>
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
      {aiOpen && (
        <AiQuickAddModal
          categories={categories}
          directory={directory}
          groups={groups}
          currentUserId={currentUserId}
          onClose={() => setAiOpen(false)}
        />
      )}
    </>
  );
}
