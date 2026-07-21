'use client';

import { useState, useTransition } from 'react';
import { Check, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createGroup, updateProfileUpiId } from '@/app/actions/transactions';
import { cn } from '@/lib/utils/format';
import { DirectoryUser, Group } from '@/lib/types';

const EMOJI_OPTIONS = ['💸', '🏠', '✈️', '🍜', '🎉', '🎮', '🎓', '💪'];

export function GroupsPanel({
  groups,
  directory,
  currentUserId,
  currentUpiId,
}: {
  groups: Group[];
  directory: DirectoryUser[];
  currentUserId: string;
  currentUpiId?: string | null;
}) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Array<{ name: string; phone: string; upiId: string }>>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactUpi, setContactUpi] = useState('');
  const [myUpiId, setMyUpiId] = useState(currentUpiId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [isPending, startTransition] = useTransition();

  const otherUsers = directory.filter((user) => user.id !== currentUserId);

  function toggleMember(id: string) {
    setSelectedMembers((current) =>
      current.includes(id) ? current.filter((memberId) => memberId !== id) : [...current, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(false);

    startTransition(async () => {
      try {
        await createGroup({
          name,
          emoji,
          memberIds: selectedMembers,
          contacts,
        });
        setName('');
        setEmoji(EMOJI_OPTIONS[0]);
        setSelectedMembers([]);
        setContacts([]);
        setCreated(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create group.');
      }
    });
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] gap-5">
      <div className="flex flex-col gap-4">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-ink-border bg-ink-raised p-6 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald/15 text-emerald">
              <Users size={22} />
            </div>
            <h2 className="font-semibold">No groups yet</h2>
            <p className="mt-1 text-sm text-paper/50">
              Make one for a trip, flat, couple, event, or any friend circle.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="rounded-xl border border-ink-border bg-ink-raised p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl" aria-hidden="true">{group.emoji}</span>
                    <h2 className="truncate text-lg font-semibold">{group.name}</h2>
                  </div>
                  <p className="mt-1 text-sm text-paper/45">
                    {group.members?.length ?? 0} {(group.members?.length ?? 0) === 1 ? 'member' : 'members'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {group.members?.map((member) => (
                  <div
                    key={member.id ?? member.user_id}
                    className="flex items-center gap-2 rounded-full border border-ink-border bg-ink px-2.5 py-1.5 text-sm"
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
                      style={{ backgroundColor: member.profile?.avatar_color ?? '#3F7A5C' }}
                    >
                      {(member.profile?.full_name ?? member.contact_name ?? '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="max-w-32 truncate">{member.profile?.full_name ?? member.contact_name ?? 'Member'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-ink-border bg-ink-raised p-5 h-fit">
        <div className="mb-4 rounded-xl border border-mint/20 bg-mint/5 p-3"><label className="text-xs font-semibold uppercase tracking-wider text-paper/45">Your UPI ID</label><div className="mt-2 flex gap-2"><input value={myUpiId} onChange={(event) => setMyUpiId(event.target.value)} placeholder="name@bank" className="h-10 min-w-0 flex-1 rounded-lg border border-ink-border bg-ink px-3 text-sm" /><button type="button" onClick={() => startTransition(() => updateProfileUpiId(myUpiId))} className="rounded-lg bg-mint px-3 text-xs font-bold text-ink">Save</button></div></div>
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald/15 text-emerald">
            <Plus size={18} />
          </div>

          <div>
            <h2 className="font-semibold">Create group</h2>
            <p className="text-sm text-paper/45">Keep shared expenses in the right circle.</p>
          </div>

        </div>

        <div className="flex flex-col gap-4">
          <Input
            label="Group name"
            placeholder="e.g. Goa trip, Flatmates"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div>
            <p className="mb-2 text-sm font-medium text-paper/70">Vibe</p>
            <div className="grid grid-cols-8 gap-2">
              {EMOJI_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setEmoji(option)}
                  className={cn(
                    'h-10 rounded-lg border text-lg transition-colors',
                    emoji === option ? 'border-emerald bg-emerald/15' : 'border-ink-border bg-ink'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-paper/70">Members</p>
            {otherUsers.length === 0 ? (
              <p className="rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm text-paper/45">
                Share the app first. Friends appear here after they sign up.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto thin-scroll flex flex-col gap-2">
                {otherUsers.map((user) => {
                  const selected = selectedMembers.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleMember(user.id)}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                        selected ? 'border-emerald bg-emerald/10' : 'border-ink-border bg-ink'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                          style={{ backgroundColor: user.avatar_color }}
                        >
                          {user.full_name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate text-sm">{user.full_name}</span>
                      </span>
                      {selected && <Check size={16} className="text-emerald" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-paper/70">Non-app contacts</p>
            <div className="grid gap-2">
              <input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Name" className="rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm outline-none focus:border-mint" />
              <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Phone" inputMode="tel" className="rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm outline-none focus:border-mint" />
              <input value={contactUpi} onChange={(event) => setContactUpi(event.target.value)} placeholder="UPI ID" className="rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm outline-none focus:border-mint" />
            </div>
            <button type="button" onClick={() => { if (!contactName.trim()) return; setContacts((current) => [...current, { name: contactName.trim(), phone: contactPhone.trim(), upiId: contactUpi.trim() }]); setContactName(''); setContactPhone(''); setContactUpi(''); }} className="mt-2 text-xs font-semibold text-mint">+ Add contact</button>
            {contacts.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{contacts.map((contact, index) => <button key={`${contact.name}-${index}`} type="button" onClick={() => setContacts((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-full border border-ink-border px-2.5 py-1 text-xs text-paper/60">{contact.name} ×</button>)}</div>}
          </div>

          {error && (
            <div className="rounded-lg border border-clay/30 bg-clay-soft/10 px-3 py-2 text-sm text-clay">
              {error}
            </div>
          )}
          {created && <p className="text-sm text-emerald">Group created</p>}

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create group'}
          </Button>
        </div>
      </form>
    </div>
  );
}
