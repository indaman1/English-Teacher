import { useMemo, useState, type FormEvent } from 'react';
import { BookText, Plus, Search, Shuffle, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { countByStatus, filterVocabulary, NEXT_STATUS, pickPracticeWords, type VocabFilter } from '@/features/vocabulary/filter';
import { addWord, DuplicateWordError, listVocabulary, removeWord, setWordStatus } from '@/services/supabase/vocabulary';
import type { VocabularyItem } from '@/types';

const STATUS_TONE = { new: 'neutral', learning: 'warning', mastered: 'success' } as const;
const STATUS_LABEL = { new: 'New', learning: 'Learning', mastered: 'Mastered' } as const;

function PracticeCard({ words, onClose }: { words: VocabularyItem[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const w = words[i];
  return (
    <Modal open onClose={onClose} title="Practise your words" description={`Word ${i + 1} of ${words.length}. Say it out loud, then check.`}>
      <div className="rounded-2xl bg-slate-50 p-6 text-center">
        <p className="text-3xl font-bold text-slate-900">{w.word}</p>
        {show ? (
          <div className="mt-4 text-left text-sm">
            <p className="text-slate-700">{w.meaning}</p>
            {w.example && <p className="mt-2 text-slate-500">“{w.example}”</p>}
            {w.hausa_explanation && <p className="mt-2 text-slate-600">Hausa: {w.hausa_explanation}</p>}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Try to remember the meaning and make your own sentence.</p>
        )}
      </div>
      <div className="mt-4 flex justify-between gap-2">
        <Button variant="secondary" onClick={() => setShow((s) => !s)}>
          {show ? 'Hide meaning' : 'Show meaning'}
        </Button>
        {i + 1 < words.length ? (
          <Button
            onClick={() => {
              setI(i + 1);
              setShow(false);
            }}
          >
            Next word
          </Button>
        ) : (
          <Button onClick={onClose}>Finish</Button>
        )}
      </div>
    </Modal>
  );
}

export default function Vocabulary() {
  usePageTitle('Vocabulary notebook');
  const { user, profile } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(listVocabulary, []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VocabFilter>('all');
  const [adding, setAdding] = useState(false);
  const [practice, setPractice] = useState<VocabularyItem[] | null>(null);
  const [form, setForm] = useState({ word: '', meaning: '', example: '', hausa: '' });
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<VocabularyItem[] | null>(null);

  const items = useMemo(() => local ?? data ?? [], [local, data]);
  const counts = useMemo(() => countByStatus(items), [items]);
  const visible = useMemo(() => filterVocabulary(items, query, filter), [items, query, filter]);

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message="We could not load your words." onRetry={reload} />;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!user || !form.word.trim()) return;
    setSaving(true);
    try {
      const created = await addWord(user.id, { word: form.word, meaning: form.meaning, example: form.example, hausa_explanation: form.hausa });
      setLocal([created, ...items]);
      setForm({ word: '', meaning: '', example: '', hausa: '' });
      setAdding(false);
      toast.success('Word saved.');
    } catch (err) {
      if (err instanceof DuplicateWordError) toast.info(err.message);
      else toast.error('Could not save the word. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function cycle(item: VocabularyItem) {
    const next = NEXT_STATUS[item.status];
    setLocal(items.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
    try {
      await setWordStatus(item.id, next);
    } catch {
      setLocal(items);
      toast.error('Could not update the word.');
    }
  }

  async function remove(item: VocabularyItem) {
    const before = items;
    setLocal(items.filter((i) => i.id !== item.id));
    try {
      await removeWord(item.id);
    } catch {
      setLocal(before);
      toast.error('Could not remove the word.');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Vocabulary notebook</h1>
          <p className="mt-1 text-slate-600">Words from your lessons, plus any you add yourself.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={items.length === 0} onClick={() => setPractice(pickPracticeWords(items, 5))}>
            <Shuffle className="h-4 w-4" aria-hidden /> Practise
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add word
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'new', label: 'New', count: counts.new },
            { value: 'learning', label: 'Learning', count: counts.learning },
            { value: 'mastered', label: 'Mastered', count: counts.mastered },
          ]}
        />
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            aria-label="Search words"
            placeholder="Search words"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<BookText className="h-6 w-6" aria-hidden />}
          title="Your notebook is empty"
          description="New words from your lessons are saved here automatically. You can also add your own."
          action={<Button onClick={() => setAdding(true)}>Add your first word</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState title="No words match" description="Try a different search or filter." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((w) => (
            <li key={w.id}>
              <Card className="flex h-full flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{w.word}</h3>
                  <button type="button" onClick={() => cycle(w)} aria-label={`Status ${STATUS_LABEL[w.status]}. Tap to change.`}>
                    <Badge tone={STATUS_TONE[w.status]}>{STATUS_LABEL[w.status]}</Badge>
                  </button>
                </div>
                {w.meaning && <p className="mt-1 text-sm text-slate-700">{w.meaning}</p>}
                {w.example && <p className="mt-1 text-sm text-slate-500">“{w.example}”</p>}
                {w.hausa_explanation && profile?.explanation_language === 'hausa' && <p className="mt-1 text-sm text-slate-600">Hausa: {w.hausa_explanation}</p>}
                <div className="mt-auto flex justify-end pt-3">
                  <Button variant="ghost" size="sm" onClick={() => remove(w)} aria-label={`Remove ${w.word}`}>
                    <Trash2 className="h-4 w-4" aria-hidden /> Remove
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a word">
        <form onSubmit={onAdd} className="space-y-3">
          <Input label="Word or phrase" value={form.word} maxLength={80} onChange={(e) => setForm({ ...form, word: e.target.value })} required />
          <Input label="Meaning" value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
          <Textarea label="Example sentence" value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} className="min-h-16" />
          <Input label="Hausa explanation (optional)" value={form.hausa} onChange={(e) => setForm({ ...form, hausa: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!form.word.trim()}>
              Save word
            </Button>
          </div>
        </form>
      </Modal>

      {practice && practice.length > 0 && <PracticeCard words={practice} onClose={() => setPractice(null)} />}
    </div>
  );
}
