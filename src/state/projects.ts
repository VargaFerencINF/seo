/** Projektlista állapota és műveletei. */
import { createStore } from './store';
import { getRepository, type ParcelSummary } from '../storage/repository';
import type { Parcel } from '../types';

export interface ProjectsState {
  items: ParcelSummary[];
  loading: boolean;
  error: string | null;
  query: string;
  selected: string[];
}

export const projects = createStore<ProjectsState>({
  items: [],
  loading: false,
  error: null,
  query: '',
  selected: [],
});

export async function refreshProjects(): Promise<void> {
  projects.patch({ loading: true, error: null });
  try {
    const items = await getRepository().list();
    const ids = new Set(items.map((i) => i.id));
    projects.patch({ items, loading: false, selected: projects.get().selected.filter((id) => ids.has(id)) });
  } catch (err) {
    projects.patch({
      loading: false,
      error: `A mentett telkek nem tölthetők be: ${err instanceof Error ? err.message : String(err)}. Indítsd újra az alkalmazást.`,
    });
  }
}

export async function saveProject(p: Parcel): Promise<void> {
  await getRepository().save(p);
  await refreshProjects();
}

export async function deleteProject(id: string): Promise<void> {
  await getRepository().remove(id);
  await refreshProjects();
}

export async function loadProject(id: string): Promise<Parcel | null> {
  return getRepository().get(id);
}

export function toggleSelected(id: string, max = 3): boolean {
  const sel = projects.get().selected;
  if (sel.includes(id)) {
    projects.patch({ selected: sel.filter((x) => x !== id) });
    return true;
  }
  if (sel.length >= max) return false;
  projects.patch({ selected: [...sel, id] });
  return true;
}
