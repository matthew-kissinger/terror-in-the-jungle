type MovementArtifactEventKind =
  | 'player_pinned'
  | 'terrain_blocked'
  | 'npc_pinned'
  | 'npc_backtrack'
  | 'npc_contour'

interface MovementArtifactCell {
  x: number
  z: number
  count: number
}

interface MovementArtifactEvent {
  kind: MovementArtifactEventKind
  x: number
  z: number
  count: number
}

interface MovementArtifactTrackPoint {
  x: number
  z: number
  tMs: number
  intent?: string
}

interface MovementArtifactTrack {
  id: string
  subject: 'player' | 'npc'
  lodLevel?: 'high' | 'medium' | 'low' | 'culled'
  points: MovementArtifactTrackPoint[]
}

export interface MovementArtifactReportForViewer {
  cellSize: number
  playerOccupancy: MovementArtifactCell[]
  npcOccupancy: MovementArtifactCell[]
  hotspots: MovementArtifactEvent[]
  tracks: MovementArtifactTrack[]
}

export interface MovementTerrainOverlayArtifact {
  mode: string
  worldSize: number
  resolution: number
  minHeight: number
  maxHeight: number
  contourStep: number
  heights: number[]
  zones: Array<{
    id: string
    name: string
    x: number
    z: number
    radius: number
    isHomeBase: boolean
  }>
  flowPaths: Array<{
    id: string
    width: number
    surface: string
    points: Array<{ x: number; z: number }>
  }>
}

export function renderMovementArtifactViewerHtml(
  movementArtifacts: MovementArtifactReportForViewer,
  terrain: MovementTerrainOverlayArtifact,
): string {
  const payload = JSON.stringify({ movementArtifacts, terrain }).replace(/</g, '\\u003c')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Movement Artifact Viewer</title>
  <style>
    :root {
      --bg: #10140f;
      --panel: #182019;
      --panel-2: #212b22;
      --line: rgba(220, 228, 196, 0.16);
      --text: #edf0df;
      --muted: #aeb79f;
      --accent: #d0b06b;
      --player: #86d6ff;
      --npc: #ffb063;
      --trail: rgba(176, 144, 94, 0.55);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top, rgba(57, 74, 48, 0.32), transparent 32%),
        linear-gradient(180deg, #111610 0%, #0b100c 100%);
    }

    .app {
      display: grid;
      grid-template-columns: minmax(320px, 1fr) 360px;
      min-height: 100vh;
    }

    .viewer {
      padding: 20px;
    }

    .sidebar {
      border-left: 1px solid var(--line);
      background: rgba(13, 18, 13, 0.9);
      padding: 18px 18px 28px;
      overflow: auto;
    }

    h1, h2, h3, p {
      margin: 0;
    }

    h1 {
      font-size: 20px;
      margin-bottom: 8px;
    }

    .subtitle {
      color: var(--muted);
      margin-bottom: 18px;
      line-height: 1.4;
    }

    .panel {
      background: rgba(24, 32, 25, 0.92);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 14px;
    }

    .controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px 14px;
      margin-bottom: 12px;
    }

    label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--muted);
    }

    input[type="checkbox"] {
      accent-color: var(--accent);
    }

    select, input[type="range"], button {
      width: 100%;
    }

    select, button {
      background: var(--panel-2);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 10px;
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .canvas-wrap {
      background: rgba(11, 15, 12, 0.95);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 14px;
    }

    canvas {
      width: 100%;
      max-width: 980px;
      aspect-ratio: 1;
      display: block;
      border-radius: 12px;
      background: #0f1510;
    }

    .timeline {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
      margin-top: 12px;
      color: var(--muted);
      font-size: 13px;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 10px;
    }

    .metric {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 10px;
    }

    .metric .label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
    }

    .metric .value {
      font-size: 18px;
      font-weight: 600;
    }

    .legend {
      display: grid;
      gap: 8px;
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .swatch {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.16);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      color: var(--muted);
      margin-top: 10px;
    }

    th, td {
      text-align: left;
      padding: 7px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    th {
      color: var(--text);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .note {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }

    @media (max-width: 1100px) {
      .app {
        grid-template-columns: 1fr;
      }

      .sidebar {
        border-left: 0;
        border-top: 1px solid var(--line);
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="viewer">
      <h1>Movement Artifact Viewer</h1>
      <p class="subtitle">Terrain-relative playback and hotspot review for harness captures. This is intended for jungle flow tuning: topo bands, trail corridors, pinned cells, contour pressure, and sampled player/NPC tracks.</p>

      <div class="panel">
        <div class="controls">
          <label><input id="toggleTerrain" type="checkbox" checked />Terrain topo</label>
          <label><input id="toggleFlow" type="checkbox" checked />Trail corridors</label>
          <label><input id="togglePlayerHeat" type="checkbox" checked />Player occupancy</label>
          <label><input id="toggleNpcHeat" type="checkbox" checked />NPC occupancy</label>
          <label><input id="toggleHotspots" type="checkbox" checked />Hotspots</label>
          <label><input id="toggleTracks" type="checkbox" checked />Tracks</label>
        </div>
        <div class="controls">
          <label for="hotspotFilter">Hotspot filter</label>
          <select id="hotspotFilter">
            <option value="all">All hotspot kinds</option>
            <option value="terrain_blocked">Terrain blocked</option>
            <option value="player_pinned">Player pinned</option>
            <option value="npc_pinned">NPC pinned</option>
            <option value="npc_backtrack">NPC backtrack</option>
            <option value="npc_contour">NPC contour</option>
          </select>
          <button id="playPause">Play</button>
        </div>
      </div>

      <div class="canvas-wrap">
        <canvas id="canvas" width="1024" height="1024"></canvas>
        <div class="timeline">
          <span id="timeNow">0.0s</span>
          <input id="timeSlider" type="range" min="0" max="1" step="0.001" value="1" />
          <span id="timeMax">0.0s</span>
        </div>
      </div>
    </div>

    <aside class="sidebar">
      <div class="panel">
        <h2>Capture</h2>
        <div id="summary" class="metric-grid"></div>
      </div>

      <div class="panel">
        <h2>Legend</h2>
        <div class="legend">
          <div class="legend-row"><span class="swatch" style="background: rgba(28, 58, 32, 0.9)"></span><span>Lower elevation / gentler support</span></div>
          <div class="legend-row"><span class="swatch" style="background: rgba(84, 122, 69, 0.9)"></span><span>Higher ground / steeper slopes</span></div>
          <div class="legend-row"><span class="swatch" style="background: rgba(166, 142, 94, 0.85)"></span><span>Compiled trail / corridor support</span></div>
          <div class="legend-row"><span class="swatch" style="background: rgba(134, 214, 255, 0.75)"></span><span>Player occupancy / track</span></div>
          <div class="legend-row"><span class="swatch" style="background: rgba(255, 176, 99, 0.75)"></span><span>NPC occupancy / track</span></div>
          <div class="legend-row"><span class="swatch" style="background: rgba(255, 93, 93, 0.85)"></span><span>Stuck or blocked hotspots</span></div>
        </div>
      </div>

      <div class="panel">
        <h2>Top Hotspots</h2>
        <table>
          <thead>
            <tr><th>Kind</th><th>Cell</th><th>Count</th></tr>
          </thead>
          <tbody id="hotspotTable"></tbody>
        </table>
      </div>

      <div class="panel">
        <h2>Tracked Subjects</h2>
        <table>
          <thead>
            <tr><th>Id</th><th>Type</th><th>Pts</th></tr>
          </thead>
          <tbody id="trackTable"></tbody>
        </table>
      </div>

      <div class="panel">
        <p class="note">Use this view to decide whether terrain should shape flow more strongly. Long contour streaks on or near the stamped trail web suggest trail width or shoulder smoothing is still too conservative. Repeated pinned/backtrack cells off the trail web usually indicate ditch, lip, or objective-rim cleanup still needed.</p>
      </div>
    </aside>
  </div>

  <script>
    const DATA = ${payload};
    const { movementArtifacts, terrain } = DATA;
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const toggleTerrain = document.getElementById('toggleTerrain');
    const toggleFlow = document.getElementById('toggleFlow');
    const togglePlayerHeat = document.getElementById('togglePlayerHeat');
    const toggleNpcHeat = document.getElementById('toggleNpcHeat');
    const toggleHotspots = document.getElementById('toggleHotspots');
    const toggleTracks = document.getElementById('toggleTracks');
    const hotspotFilter = document.getElementById('hotspotFilter');
    const playPause = document.getElementById('playPause');
    const timeSlider = document.getElementById('timeSlider');
    const timeNow = document.getElementById('timeNow');
    const timeMax = document.getElementById('timeMax');
    const hotspotTable = document.getElementById('hotspotTable');
    const trackTable = document.getElementById('trackTable');
    const summary = document.getElementById('summary');

    const HOTSPOT_COLORS = {
      terrain_blocked: '#ff5d5d',
      player_pinned: '#76d3ff',
      npc_pinned: '#ff8f5a',
      npc_backtrack: '#ffd166',
      npc_contour: '#7ef0ab'
    };

    const trackEndMs = Math.max(
      1,
      ...movementArtifacts.tracks.flatMap((track) => track.points.map((point) => Number(point.tMs || 0)))
    );
    let playing = false;
    let lastFrame = performance.now();
    let currentTimeMs = trackEndMs;

    timeSlider.max = String(trackEndMs);
    timeSlider.value = String(trackEndMs);
    timeMax.textContent = formatSeconds(trackEndMs / 1000);

    const terrainBackdrop = buildTerrainBackdrop();
    populateSidebar();
    render();

    [toggleTerrain, toggleFlow, togglePlayerHeat, toggleNpcHeat, toggleHotspots, toggleTracks, hotspotFilter]
      .forEach((element) => element.addEventListener('input', render));

    timeSlider.addEventListener('input', () => {
      currentTimeMs = Number(timeSlider.value);
      playing = false;
      playPause.textContent = 'Play';
      render();
    });

    playPause.addEventListener('click', () => {
      playing = !playing;
      playPause.textContent = playing ? 'Pause' : 'Play';
      lastFrame = performance.now();
      if (playing) requestAnimationFrame(tick);
    });

    function tick(now) {
      if (!playing) return;
      const delta = now - lastFrame;
      lastFrame = now;
      currentTimeMs += delta * 1.2;
      if (currentTimeMs >= trackEndMs) {
        currentTimeMs = trackEndMs;
        playing = false;
        playPause.textContent = 'Play';
      }
      timeSlider.value = String(currentTimeMs);
      render();
      if (playing) requestAnimationFrame(tick);
    }

    function populateSidebar() {
      const playerTrack = movementArtifacts.tracks.find((track) => track.subject === 'player');
      const topHotspots = [...movementArtifacts.hotspots]
        .sort((a, b) => b.count - a.count)
        .slice(0, 14);

      summary.innerHTML = '';
      [
        ['Mode', terrain.mode],
        ['World size', terrain.worldSize.toFixed(0) + 'm'],
        ['Height range', terrain.minHeight.toFixed(1) + ' -> ' + terrain.maxHeight.toFixed(1)],
        ['Trail paths', String(terrain.flowPaths.length)],
        ['Player cells', String(movementArtifacts.playerOccupancy.length)],
        ['NPC cells', String(movementArtifacts.npcOccupancy.length)],
        ['Hotspots', String(movementArtifacts.hotspots.length)],
        ['Tracks', String(movementArtifacts.tracks.length)],
      ].forEach(([label, value]) => {
        const metric = document.createElement('div');
        metric.className = 'metric';
        metric.innerHTML = '<span class="label">' + label + '</span><span class="value">' + value + '</span>';
        summary.appendChild(metric);
      });

      hotspotTable.innerHTML = topHotspots
        .map((entry) => '<tr><td>' + entry.kind + '</td><td>(' + entry.x + ', ' + entry.z + ')</td><td>' + entry.count + '</td></tr>')
        .join('');

      trackTable.innerHTML = movementArtifacts.tracks
        .map((track) => '<tr><td>' + track.id + '</td><td>' + track.subject + (track.lodLevel ? ' / ' + track.lodLevel : '') + '</td><td>' + track.points.length + '</td></tr>')
        .join('');
    }

    function buildTerrainBackdrop() {
      const image = document.createElement('canvas');
      image.width = canvas.width;
      image.height = canvas.height;
      const imageCtx = image.getContext('2d');
      const cellSize = image.width / terrain.resolution;
      const range = Math.max(1, terrain.maxHeight - terrain.minHeight);

      for (let row = 0; row < terrain.resolution; row++) {
        for (let col = 0; col < terrain.resolution; col++) {
          const height = getHeightAtCell(col, row);
          const east = getHeightAtCell(Math.min(col + 1, terrain.resolution), row);
          const south = getHeightAtCell(col, Math.min(row + 1, terrain.resolution));
          const slope = Math.min(1, Math.hypot(east - height, south - height) / 18);
          const normalized = (height - terrain.minHeight) / range;
          const red = Math.round(24 + normalized * 38 + slope * 10);
          const green = Math.round(34 + normalized * 54 - slope * 4);
          const blue = Math.round(24 + normalized * 18);
          imageCtx.fillStyle = 'rgba(' + red + ',' + green + ',' + blue + ',0.86)';
          imageCtx.fillRect(col * cellSize, row * cellSize, cellSize + 1, cellSize + 1);

          const contourBand = Math.floor(height / terrain.contourStep);
          const eastBand = Math.floor(east / terrain.contourStep);
          const southBand = Math.floor(south / terrain.contourStep);
          if (contourBand !== eastBand || contourBand !== southBand) {
            imageCtx.fillStyle = 'rgba(232, 235, 214, 0.12)';
            imageCtx.fillRect(col * cellSize, row * cellSize, cellSize + 0.5, Math.max(1, cellSize * 0.16));
          }
        }
      }

      return image;
    }

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f1510';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (toggleTerrain.checked) {
        ctx.drawImage(terrainBackdrop, 0, 0, canvas.width, canvas.height);
      }

      drawZones();
      if (toggleFlow.checked) drawFlowPaths();
      if (togglePlayerHeat.checked) drawOccupancy(movementArtifacts.playerOccupancy, 'rgba(134, 214, 255, 0.55)');
      if (toggleNpcHeat.checked) drawOccupancy(movementArtifacts.npcOccupancy, 'rgba(255, 176, 99, 0.38)');
      if (toggleHotspots.checked) drawHotspots();
      if (toggleTracks.checked) drawTracks();

      timeNow.textContent = formatSeconds(currentTimeMs / 1000);
    }

    function drawZones() {
      const scale = canvas.width / terrain.worldSize;
      ctx.save();
      for (const zone of terrain.zones) {
        const point = worldToCanvas(zone.x, zone.z);
        const radius = Math.max(zone.radius * scale, zone.isHomeBase ? 14 : 10);
        ctx.fillStyle = zone.isHomeBase ? 'rgba(180, 74, 74, 0.16)' : 'rgba(209, 188, 122, 0.1)';
        ctx.strokeStyle = zone.isHomeBase ? 'rgba(219, 117, 117, 0.45)' : 'rgba(215, 198, 150, 0.32)';
        ctx.lineWidth = zone.isHomeBase ? 2 : 1.2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawFlowPaths() {
      const scale = canvas.width / terrain.worldSize;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(176, 144, 94, 0.58)';
      for (const path of terrain.flowPaths) {
        if (!path.points || path.points.length < 2) continue;
        ctx.lineWidth = Math.max(1.5, path.width * scale * 0.34);
        ctx.beginPath();
        path.points.forEach((point, index) => {
          const mapped = worldToCanvas(point.x, point.z);
          if (index === 0) ctx.moveTo(mapped.x, mapped.y);
          else ctx.lineTo(mapped.x, mapped.y);
        });
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawOccupancy(cells, color) {
      if (!cells.length) return;
      const maxCount = Math.max(...cells.map((cell) => cell.count));
      ctx.save();
      for (const cell of cells) {
        const alpha = 0.08 + (cell.count / maxCount) * 0.55;
        const point = worldToCanvas(cell.x, cell.z);
        const radius = Math.max(5, movementArtifacts.cellSize * (canvas.width / terrain.worldSize) * 0.65);
        ctx.fillStyle = color.replace(/0\\.[0-9]+\\)/, alpha.toFixed(2) + ')');
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawHotspots() {
      const filter = hotspotFilter.value;
      ctx.save();
      for (const hotspot of movementArtifacts.hotspots) {
        if (filter !== 'all' && hotspot.kind !== filter) continue;
        const point = worldToCanvas(hotspot.x, hotspot.z);
        const radius = Math.max(4, Math.min(18, 3 + Math.sqrt(hotspot.count)));
        ctx.fillStyle = HOTSPOT_COLORS[hotspot.kind] || '#ffffff';
        ctx.globalAlpha = hotspot.kind === 'npc_contour' ? 0.34 : 0.78;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawTracks() {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const track of movementArtifacts.tracks) {
        if (!track.points.length) continue;
        const stroke = track.subject === 'player' ? 'rgba(134, 214, 255, 0.92)' : 'rgba(255, 176, 99, 0.58)';
        const width = track.subject === 'player' ? 2.4 : 1.25;
        const visiblePoints = track.points.filter((point) => point.tMs <= currentTimeMs);
        if (visiblePoints.length < 2) continue;

        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.beginPath();
        visiblePoints.forEach((point, index) => {
          const mapped = worldToCanvas(point.x, point.z);
          if (index === 0) ctx.moveTo(mapped.x, mapped.y);
          else ctx.lineTo(mapped.x, mapped.y);
        });
        ctx.stroke();

        const head = visiblePoints[visiblePoints.length - 1];
        const headPoint = worldToCanvas(head.x, head.z);
        ctx.fillStyle = stroke;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(headPoint.x, headPoint.y, track.subject === 'player' ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    function getHeightAtCell(col, row) {
      const width = terrain.resolution + 1;
      return terrain.heights[row * width + col];
    }

    function worldToCanvas(x, z) {
      const scale = canvas.width / terrain.worldSize;
      return {
        x: (terrain.worldSize * 0.5 - x) * scale,
        y: (terrain.worldSize * 0.5 - z) * scale
      };
    }

    function formatSeconds(value) {
      return value.toFixed(1) + 's';
    }
  </script>
</body>
</html>`;
}
