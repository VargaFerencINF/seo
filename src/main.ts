// csak latin + latin-ext (ő, ű) betűkészlet – kisebb APK
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-ext-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-ext-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-ext-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow/latin-ext-700.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-ext-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import '@fontsource/barlow-semi-condensed/latin-ext-700.css';
import './ui/styles/app.css';
import './ui/styles/map.css';

import { Shell } from './ui/shell';
import { MapScreen } from './ui/screens/mapScreen';
import { ProjectsScreen } from './ui/screens/projectsScreen';
import { SettingsScreen } from './ui/screens/settingsScreen';
import { applyTheme, loadSettings, settings } from './state/settings';
import { icons } from './ui/icons';
import { PositionLayer } from './map/positionLayer';
import { GpsWalk } from './ui/gpsWalk';
import { ImportUi } from './ui/importUi';
import { PhotoManager } from './ui/photos';
import { locateButton } from './ui/locate';
import { listenSharedFiles } from './native/sharedFile';
import { session } from './state/session';
import { toast } from './ui/feedback';
import { loadProject, refreshProjects, saveProject } from './state/projects';
import { editParcelMeta } from './ui/components/parcelEdit';
import { rescore } from './analysis/rescore';
import { applySystemBars, onBackButton } from './native/system';
import { welcome } from './ui/welcome';

async function start(): Promise<void> {
  await loadSettings();
  applyTheme(settings.get().theme);
  settings.subscribe((s, prev) => {
    if (s.theme !== prev.theme) applyTheme(s.theme);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.get().theme === 'system') {
      applyTheme('system');
      void mapScreen.refreshBaseStyle();
    }
  });

  const root = document.getElementById('app')!;
  const shell = new Shell(root);
  const mapScreen = new MapScreen();
  shell.register(mapScreen);
  const projectsScreen = new ProjectsScreen();
  shell.register(projectsScreen);
  shell.register(new SettingsScreen());
  shell.show('map');
  await mapScreen.mount();

  // ---- 4. fázis: terepi funkciók
  const position = new PositionLayer(mapScreen.view);
  const walk = new GpsWalk(mapScreen, position);
  const importer = new ImportUi(mapScreen);
  const photos = new PhotoManager(mapScreen);
  mapScreen.hooks.extraStartActions.push(
    { label: 'Bejárás GPS-szel', icon: icons.walk, run: () => void walk.start() },
    { label: 'Importálás', icon: icons.import, run: () => importer.pickFile() },
    { label: 'Koordináták', icon: icons.coords, run: () => void importer.coordinates() },
  );
  mapScreen.parcelExtraActions.push({ label: 'Fotó', icon: icons.camera, run: () => void photos.take() });
  mapScreen.hooks.photoStrip = () => photos.strip();
  mapScreen.controls.append(locateButton(mapScreen.view, position, () => session.get().mode === 'walking'));
  // ---- 5. fázis: projektek
  mapScreen.hooks.saveParcel = async (p) => {
    let parcel = p;
    const isNew = !(await loadProject(p.id));
    if (isNew) {
      const meta = await editParcelMeta({ name: p.name, note: p.note, tags: p.tags }, 'Telek mentése');
      if (!meta) return;
      parcel = { ...p, ...meta, updatedAt: new Date().toISOString() };
    }
    try {
      await saveProject(parcel);
      session.patch({ parcel, saved: true });
      toast(isNew ? 'Telek mentve a Projektek közé.' : 'Változások mentve.');
    } catch (err) {
      toast(
        `A mentés nem sikerült: ${err instanceof Error ? err.message : String(err)}. Ellenőrizd a szabad tárhelyet.`,
        'error',
        7000,
      );
    }
  };
  projectsScreen.handlers.open = (p) => {
    shell.show('map');
    mapScreen.openParcel(p, true);
  };
  projectsScreen.handlers.exportParcel = (p) => {
    // a PDF-hez térképkép kell, ezért a telket megnyitjuk a térképen
    shell.show('map');
    mapScreen.openParcel(p, true);
    setTimeout(() => void mapScreen.share(), 700);
  };
  void refreshProjects();

  // ---- 7. fázis: natív finomítások
  const bars = () =>
    void applySystemBars(document.documentElement.dataset.theme === 'dark', settings.get().demoMode);
  bars();
  settings.subscribe(bars);
  onBackButton([
    () => {
      const scrim = document.querySelector('.dialog-scrim');
      if (!scrim) return false;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return true;
    },
    () => {
      const mode = session.get().mode;
      if (mode !== 'drawing' && mode !== 'profile' && mode !== 'walking') return false;
      mapScreen.cancelEditing();
      return true;
    },
    () => {
      if (shell.active === 'map') return false;
      shell.show('map');
      return true;
    },
    () => {
      if (mapScreen.sheet.state !== 'full' && mapScreen.sheet.state !== 'half') return false;
      mapScreen.sheet.setState('peek');
      return true;
    },
  ]);
  void welcome();
  // szabályváltozáskor a nyitott telek azonnal újrapontozódik
  settings.subscribe((s, prev) => {
    const p = session.get().parcel;
    if (s.rules !== prev.rules && p?.analysis)
      session.patch({ parcel: { ...p, analysis: rescore(p.analysis, s.rules) } });
  });
  mapScreen.renderSheet();
  void listenSharedFiles((f) => {
    shell.show('map');
    if (f.error) toast(`A megosztott fájl nem olvasható: ${f.error}`, 'error', 7000);
    else if (f.text) void importer.load(f.name ?? 'megosztott', f.text);
  });
}

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast(
    `Váratlan hiba: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}. Ha ismétlődik, indítsd újra az appot.`,
    'error',
    7000,
  );
});
window.addEventListener('error', (e) => {
  if (!e.message || /ResizeObserver/.test(e.message)) return;
  toast(`Váratlan hiba: ${e.message}. Ha ismétlődik, indítsd újra az appot.`, 'error', 7000);
});

void start();
