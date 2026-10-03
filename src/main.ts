import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
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
  shell.register(new ProjectsScreen());
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
  mapScreen.renderSheet();
  void listenSharedFiles((f) => {
    shell.show('map');
    if (f.error) toast(`A megosztott fájl nem olvasható: ${f.error}`, 'error', 7000);
    else if (f.text) importer.load(f.name ?? 'megosztott', f.text);
  });
}

void start();
