// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

type FalAudioModel = 'seed-audio';

interface AudioTarget {
  id: string;
  group: 'radio-ui' | 'objectives' | 'weapons' | 'aircraft' | 'ordnance' | 'runtime-background' | 'future-location';
  seconds: number;
  runtimeTarget: string;
  prompt: string;
  variants: string[];
  reviewOnly?: boolean;
}

interface Options {
  all: boolean;
  dryRun: boolean;
  includeReviewOnly: boolean;
  ids: Set<string>;
  outRoot: string;
  variants: number;
  pollMs: number;
  list: boolean;
  model: FalAudioModel;
}

interface SubmitResponse {
  request_id: string;
  response_url?: string;
  status_url?: string;
  queue_position?: number;
}

interface StatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | string;
  request_id?: string;
  response_url?: string;
  error?: string;
  logs?: Array<{ message?: string }>;
}

interface FalAudioFile {
  url?: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
  duration?: number;
  sample_rate?: number;
  channels?: number;
}

interface FalAudioResult {
  audio?: FalAudioFile | string;
  [key: string]: unknown;
}

interface GeneratedCandidate {
  id: string;
  group: AudioTarget['group'];
  runtimeTarget: string;
  variant: string;
  prompt: string;
  requestId?: string;
  model: FalAudioModel;
  endpoint: string;
  file?: string;
  sourceUrl?: string;
  duration?: number;
  error?: string;
  reviewOnly: boolean;
}

const ENDPOINTS: Record<FalAudioModel, string> = {
  'seed-audio': 'bytedance/seed-audio-1.0',
};

const DEFAULT_OUT_ROOT = 'artifacts/audio/fal-review';

const TARGETS: AudioTarget[] = [
  {
    id: 'radio-open-feedback',
    group: 'radio-ui',
    seconds: 0.55,
    runtimeTarget: 'radio dial open / focus change',
    prompt:
      'A dry, close-mic tactical radio handset click and soft circuit wake chirp for a Vietnam-era field radio UI. No continuous static hiss, no speech, no music, no ambience.',
    variants: [
      'restrained military equipment, clean analog relay snap, very short tail',
      'warmer field-radio hardware, tiny cloth-covered switch movement, subtle low thump',
      'slightly brighter UI confirmation, crisp but not sci-fi, no noise bed',
    ],
  },
  {
    id: 'radio-confirm-feedback',
    group: 'radio-ui',
    seconds: 0.85,
    runtimeTarget: 'radio selection accepted / fire mission confirmed',
    prompt:
      'A short dry radio confirmation cue: push-to-talk click, one compact analog acknowledgement chirp, then silence. No voice, no Morse, no music, no background static.',
    variants: [
      'field command gear, confident and understated',
      'lower-pitched radio electronics, grounded and utilitarian',
      'slightly urgent combat UI response, still clean and non-musical',
    ],
  },
  {
    id: 'objective-offer-feedback',
    group: 'objectives',
    seconds: 0.9,
    runtimeTarget: 'local objective available cue at objective source',
    prompt:
      'A local objective-source cue heard only when physically near the objective: subtle flag rope movement, canvas strap tension, and a small field-marker hardware tick. It should feel like the place became actionable, not like a radio or HUD message. No radio chirp, no headset tone, no UI success pulse, no melody, no background bed, no static.',
    variants: [
      'cloth flag line tightens with a dry wooden post creak',
      'ammo crate strap shifts with a small metal buckle tick',
      'field marker stake and canvas tag move in humid air, close and restrained',
    ],
  },
  {
    id: 'objective-complete-feedback',
    group: 'objectives',
    seconds: 0.95,
    runtimeTarget: 'local objective complete feedback near objective only',
    prompt:
      'A short local objective-complete sound for a serious tactical jungle combat game, emitted from the objective when the player is physically present: field marker locks into place, canvas or rope settles, a small crate latch closes, and dust or gear softly shifts. It must be satisfying but physical and grounded. Do not make a radio pitch, headset acknowledgement, UI reward pulse, table stamp, brass sound, melody, fanfare, ambience, or voice.',
    variants: [
      'wooden field post knock, rope cinch, and soft canvas settle',
      'supply crate latch closes with a restrained low gear thump',
      'flag hardware clack and cloth snap, clear but not celebratory',
      'small metal bracket locks onto a marker stake with dirt scuff',
      'equipment strap pull, buckle tick, and subdued objective-settle thud',
    ],
  },
  {
    id: 'objective-fail-feedback',
    group: 'objectives',
    seconds: 1.0,
    runtimeTarget: 'local objective lost or failed feedback near objective only',
    prompt:
      'A muted local objective-failed sound emitted from the objective source: flag rope slackens, canvas drops, a field marker latch falls open, and dirt or gear shifts. Serious tactical tone, physical and spatial, not a global UI warning. No radio dropout, no headset tone, no alarm loop, no melody, no background bed, no speech.',
    variants: [
      'rope slack and cloth sag with a low wooden knock',
      'crate latch slips open and canvas strap drags softly',
      'field marker loosens in dirt, restrained and non-musical',
    ],
  },
  {
    id: 'capture-confirmation-alt',
    group: 'objectives',
    seconds: 0.85,
    runtimeTarget: 'local zoneCaptured replacement at capture point only',
    prompt:
      'A short local control-point secured sound emitted from the capture point when the player is nearby: flag line snap, field marker clamp, canvas pennant movement, small wood-and-metal contact, and dust settling. It should cut through combat as a physical objective sound, not a radio acknowledgement or HUD stinger. Do not make a radio chirp, electronic pitch, table stamp, map-marker sound, musical flourish, background bed, voice, or static hiss.',
    variants: [
      'repeatable flag rope snap with a wooden marker clamp',
      'soft canvas settle, muted rope tension, and a rounded wood clamp with no sharp metal tick',
      'field post knocked into place with a short cloth settle',
      'ammo crate latch and stake hardware, clear but understated',
      'tight wood-metal contact transient with a low physical lock',
    ],
  },
  {
    id: 'hit-marker-feedback',
    group: 'weapons',
    seconds: 0.22,
    runtimeTarget: 'hit marker sweetener',
    prompt:
      'A very short dry hit confirmation tick for a serious FPS: muted wood/metal tap with slight low snap. No gore, no voice, no music, no background.',
    variants: [
      'subtle analog tick, low fatigue for repeated hits',
      'slightly sharper transient for combat readability',
      'darker thud-click, still under a quarter second',
    ],
  },
  {
    id: 'kill-confirm-feedback',
    group: 'weapons',
    seconds: 0.45,
    runtimeTarget: 'kill marker sweetener',
    prompt:
      'A compact dry kill confirmation cue: decisive low click and short tactical marker snap. Serious tone, no musical flourish, no voice, no ambience.',
    variants: [
      'field-map marker snap, confident but not celebratory',
      'low metal tick and soft paper stamp, restrained',
      'slightly more urgent combat feedback, still non-musical',
    ],
  },
  {
    id: 'bomb-whistle-inbound',
    group: 'ordnance',
    seconds: 2.6,
    runtimeTarget: 'air-support bomb inbound whistle',
    prompt:
      'Incoming heavy bomb air whistle only: starts distant and high above, descends fast with wind pressure, ends just before impact. No explosion, no music, no voice, no background ambience.',
    variants: [
      'classic falling ordnance whistle, clear pitch fall, not cartoonish',
      'more realistic turbulent air rush with subtle tonal whistle',
      'darker heavier bomb body, less bright, strong approach movement',
    ],
  },
  {
    id: 'rocket-launch-whoosh',
    group: 'ordnance',
    seconds: 1.4,
    runtimeTarget: 'rocketLaunch replacement candidate',
    prompt:
      'A short unguided aircraft rocket launch: ignition cough, fast whoosh away from the launcher, brief tail flame pressure. No explosion, no music, no speech, no background.',
    variants: [
      'dry close launch with quick air tear',
      'heavier pod launch, deeper ignition, short tail',
      'brighter fast rocket streak, readable but not sci-fi',
    ],
  },
  {
    id: 'napalm-fire-crackle',
    group: 'ordnance',
    seconds: 5.0,
    runtimeTarget: 'napalm fire loop candidate',
    prompt:
      'A loopable close napalm fire crackle: thick liquid fuel burning, low roar, sticky pops, controlled length. No screams, no music, no radio, no wind ambience, no explosion.',
    variants: [
      'deep fuel roar, sparse sticky pops, dark and heavy',
      'closer crackle detail, less roar, usable under combat',
      'wider flame bed but still effect-only, no environmental background',
    ],
  },
  {
    id: 'helicopter-minigun-burst',
    group: 'aircraft',
    seconds: 1.7,
    runtimeTarget: 'minigunBurst / doorGunBurst replacement candidate',
    prompt:
      'A helicopter-mounted minigun burst: rapid mechanical brrt, dense 7.62 fire, short spin-up and spin-down, dry and punchy. No ricochets, no voices, no music, no background.',
    variants: [
      'close side-door gun perspective, mechanical and rattling',
      'Cobra chin gun perspective, tighter and faster brrt',
      'slightly distant external perspective, still clean and loopable in bursts',
    ],
  },
  {
    id: 'aircraft-cannon-burst',
    group: 'aircraft',
    seconds: 1.2,
    runtimeTarget: 'fixed-wing cannon / aircraft gun sweetener',
    prompt:
      'A short aircraft cannon burst from a Vietnam-era attack aircraft: heavy fast thuds with airframe vibration, dry and aggressive. No explosion, no music, no voice, no background.',
    variants: [
      'A-1 Skyraider style heavy gun run, chunky and mechanical',
      'F-4 fast cannon texture, tighter and brighter',
      'external flyby gun burst, slightly air-distanced but no ambience bed',
    ],
  },
  {
    id: 'smoke-marker-land-hiss',
    group: 'ordnance',
    seconds: 1.2,
    runtimeTarget: 'future throwable smoke marker landing',
    prompt:
      'A smoke marker canister landing in dirt: small metal bounce, soft bobble, primer pop, short clean smoke hiss beginning. No explosion, no music, no voice, no background.',
    variants: [
      'heavier canister, one dirt bounce, restrained hiss',
      'lighter metal wobble with subtle cloth gear rattle',
      'brighter primer pop and immediate smoke start',
    ],
  },
  {
    id: 'single-jungle-bird-call',
    group: 'future-location',
    seconds: 1.4,
    runtimeTarget: 'future location-aware animal one-shot only',
    reviewOnly: true,
    prompt:
      'A single distant Southeast Asian jungle bird call for a location-aware one-shot. Isolated sound only, no insect bed, no wind, no music, no radio static.',
    variants: [
      'far canopy, natural and sparse',
      'mid-distance bird call, short and non-repetitive',
      'low jungle animal call, subtle and not distracting',
    ],
  },
  {
    id: 'jungle-insect-bed-sketch',
    group: 'future-location',
    seconds: 6.0,
    runtimeTarget: 'future location-aware background bed only',
    reviewOnly: true,
    prompt:
      'A very subtle loopable jungle insect background sketch, low level and natural. No music, no radio static, no dramatic swells, no bird calls, no combat.',
    variants: [
      'night insects, restrained and low fatigue',
      'humid daytime insects, very sparse and quiet',
      'distant tree-line texture, barely-there background',
    ],
  },
  {
    id: 'ashau-day-jungle-loop',
    group: 'runtime-background',
    seconds: 10.0,
    runtimeTarget: 'future A Shau daytime location bed',
    reviewOnly: true,
    prompt:
      'A seamless loopable daytime A Shau Valley jungle ambience for a 1960s Southeast Asia field scene: humid dense canopy, distant insects, a few far birds, thick air. No music, no radio static, no foreground animals, no voices.',
    variants: [
      'lush valley canopy, warmer daylight, broad but subtle stereo field',
      'sparser high-canopy insects, tense humidity, less bird activity',
      'river-valley edge with distant canopy life, still low fatigue',
    ],
  },
  {
    id: 'ashau-night-jungle-loop',
    group: 'runtime-background',
    seconds: 10.0,
    runtimeTarget: 'future A Shau nighttime location bed',
    reviewOnly: true,
    prompt:
      'A seamless loopable nighttime jungle ambience for a 1960s A Shau Valley field scene: low insects, distant frogs, humid darkness, uneasy but natural. No music, no radio static, no voices.',
    variants: [
      'deep night insects and distant frogs, very low and tense',
      'wet valley night with sparse animal calls, no horror stinger',
      'quiet perimeter-listening mood, natural and restrained',
    ],
  },
  {
    id: 'firebase-perimeter-loop',
    group: 'runtime-background',
    seconds: 10.0,
    runtimeTarget: 'future firebase / motor-pool location bed',
    reviewOnly: true,
    prompt:
      'A seamless loopable 1960s Southeast Asia field perimeter ambience: distant generator, canvas tents moving softly, far helicopter rotor wash, occasional metallic equipment rattle. No music, no clear speech, no radio static.',
    variants: [
      'quiet daytime firebase, generator low and distant, hardware texture',
      'busy-but-subtle motor-pool edge, far rotors, no voices',
      'night perimeter watch, generator hum and distant rotor movement',
    ],
  },
  {
    id: 'distant-firefight-loop',
    group: 'runtime-background',
    seconds: 8.0,
    runtimeTarget: 'future distant battle state bed',
    reviewOnly: true,
    prompt:
      'A seamless loopable distant action ambience for a 1960s jungle field scene: far-off percussive pops, occasional distant low thump, muffled by terrain and vegetation. No foreground shots, no music, no voices, no radio static.',
    variants: [
      'very distant valley firefight, sparse and believable',
      'denser but still background-level firefight, terrain-muffled',
      'intermittent far contact, low-frequency mortar space, no loops obvious',
    ],
  },
  {
    id: 'monsoon-rain-canopy-loop',
    group: 'runtime-background',
    seconds: 10.0,
    runtimeTarget: 'future weather bed',
    reviewOnly: true,
    prompt:
      'A seamless loopable monsoon rain-on-jungle-canopy ambience: heavy tropical rain above leaves, wet ground patter, distant thunder barely present. No music, no speech, no radio static, no combat.',
    variants: [
      'heavy canopy rain, close leaf impacts, subdued thunder',
      'steady humid downpour, less thunder, useful under gameplay',
      'rain through tall valley canopy, wide and soft, not harsh white noise',
    ],
  },
  {
    id: 'spooky-gunship-orbit-bed',
    group: 'runtime-background',
    seconds: 8.0,
    runtimeTarget: 'future AC-47 Spooky orbit state layer',
    reviewOnly: true,
    prompt:
      'A loopable distant AC-47 Spooky aircraft orbit layer for a 1960s night field scene: old radial engines circling overhead, ominous prop drone, faint intermittent mechanical texture far away, eerie tactical presence. No music, no speech, no radio static, no copyrighted melody.',
    variants: [
      'night orbit overhead, engine drone and faint side-firing texture',
      'far AC-47 pylon turn presence, ominous but realistic',
      'slightly closer gunship pass with old-engine character, still background',
    ],
  },
];

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    all: false,
    dryRun: false,
    includeReviewOnly: false,
    ids: new Set(),
    outRoot: DEFAULT_OUT_ROOT,
    variants: 2,
    pollMs: 5000,
    list: false,
    model: 'seed-audio',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--all':
        opts.all = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--include-review-only':
        opts.includeReviewOnly = true;
        break;
      case '--list':
        opts.list = true;
        break;
      case '--id':
        for (const id of readValue(argv, ++i, arg).split(',')) {
          if (id.trim()) opts.ids.add(id.trim());
        }
        break;
      case '--out':
        opts.outRoot = readValue(argv, ++i, arg);
        break;
      case '--variants':
        opts.variants = parsePositiveInt(readValue(argv, ++i, arg), arg);
        break;
      case '--poll-ms':
        opts.pollMs = parsePositiveInt(readValue(argv, ++i, arg), arg);
        break;
      case '--model': {
        const model = readValue(argv, ++i, arg) as FalAudioModel;
        if (!ENDPOINTS[model]) throw new Error(`Unsupported model '${model}'. Supported: ${Object.keys(ENDPOINTS).join(', ')}`);
        opts.model = model;
        break;
      }
      default:
        throw new Error(`Unknown argument '${arg}'`);
    }
  }

  return opts;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function selectTargets(opts: Options): AudioTarget[] {
  const known = new Map(TARGETS.map((target) => [target.id, target]));
  for (const id of opts.ids) {
    if (!known.has(id)) throw new Error(`Unknown audio target '${id}'. Run with --list.`);
  }

  const selected = opts.all
    ? TARGETS
    : [...opts.ids].map((id) => known.get(id)!);

  return selected.filter((target) => opts.includeReviewOnly || !target.reviewOnly);
}

function buildPrompt(target: AudioTarget, variant: string): string {
  const isBackground = target.group === 'runtime-background' || target.id === 'jungle-insect-bed-sketch';
  const lead = isBackground
    ? 'Generate one seamless, loopable browser-game ambience layer.'
    : 'Generate one game-ready sound effect only.';
  const guardrail = isBackground
    ? 'No music, no copyrighted melody, no radio static hiss, no clear speech, no foreground UI cue.'
    : 'No music, no copyrighted melody, no constant background bed, no ambient static hiss, no spoken words unless explicitly requested.';
  const objectiveGuardrail = target.group === 'objectives'
    ? 'Objective/capture cues must sound like local physical objective-source audio heard nearby, not like radio comms, headset acknowledgement, HUD reward feedback, or global mission music.'
    : undefined;
  const tail = isBackground
    ? 'Leave a clean loop-friendly start and tail for browser-game mixing.'
    : 'Leave a clean start and clean tail for browser-game mixing.';
  return [
    lead,
    guardrail,
    `Target length: about ${target.seconds.toFixed(1)} seconds.`,
    `Use case: ${target.runtimeTarget}.`,
    target.prompt,
    objectiveGuardrail,
    `Stylistic variation: ${variant}.`,
    tail,
  ].filter((line): line is string => Boolean(line)).join('\n');
}

async function submitFalRequest(
  endpoint: string,
  apiKey: string,
  input: Record<string, unknown>,
): Promise<SubmitResponse> {
  return requestJson<SubmitResponse>(`https://queue.fal.run/${endpoint}`, apiKey, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function pollFalResult(endpoint: string, apiKey: string, submit: SubmitResponse, pollMs: number): Promise<FalAudioResult> {
  const statusUrl = submit.status_url ?? `https://queue.fal.run/${endpoint}/requests/${submit.request_id}/status`;
  const responseUrl = submit.response_url ?? `https://queue.fal.run/${endpoint}/requests/${submit.request_id}/response`;
  const started = Date.now();
  const maxMs = 15 * 60 * 1000;

  while (Date.now() - started < maxMs) {
    const url = statusUrl.includes('?') ? `${statusUrl}&logs=1` : `${statusUrl}?logs=1`;
    const status = await requestJson<StatusResponse>(url, apiKey, { method: 'GET' });
    if (status.status === 'COMPLETED') {
      if (status.error) throw new Error(`fal request ${submit.request_id} completed with error: ${status.error}`);
      return requestJson<FalAudioResult>(status.response_url ?? responseUrl, apiKey, { method: 'GET' });
    }
    if (status.error) throw new Error(`fal request ${submit.request_id} failed: ${status.error}`);
    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for fal request ${submit.request_id}`);
}

async function requestJson<T>(url: string, apiKey: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`fal request failed ${response.status} ${response.statusText}: ${text}`);
  }

  return response.json() as Promise<T>;
}

async function downloadAudio(url: string, file: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`audio download failed ${response.status} ${response.statusText}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

function audioUrlFromResult(result: FalAudioResult): FalAudioFile {
  if (typeof result.audio === 'string') return { url: result.audio };
  if (result.audio?.url) return result.audio;
  throw new Error(`fal result did not include audio.url: ${JSON.stringify(result)}`);
}

function makeRunDir(root: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(root, stamp);
}

async function writeReviewFiles(runDir: string, candidates: GeneratedCandidate[]): Promise<void> {
  await writeFile(join(runDir, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), candidates }, null, 2)}\n`);
  await writeFile(join(runDir, 'review.html'), buildReviewHtml(candidates));
  await writeFile(join(runDir, 'README.md'), buildReadme(candidates));
}

function buildReviewHtml(candidates: GeneratedCandidate[]): string {
  const rows = candidates.map((candidate) => {
    const audio = candidate.error
      ? `<strong>failed:</strong> ${escapeHtml(candidate.error)}`
      : candidate.file
        ? `<audio controls preload="metadata" src="./${escapeHtml(candidate.file)}"></audio>`
        : '<span>dry run</span>';
    return `<tr>
  <td>${escapeHtml(candidate.id)}</td>
  <td>${escapeHtml(candidate.variant)}</td>
  <td>${escapeHtml(candidate.runtimeTarget)}</td>
  <td>${audio}</td>
  <td><pre>${escapeHtml(candidate.prompt)}</pre></td>
</tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>TITJ fal.ai Audio Review</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #111; color: #eee; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #444; padding: 8px; vertical-align: top; }
    th { background: #222; text-align: left; }
    pre { white-space: pre-wrap; max-width: 560px; margin: 0; }
    audio { width: 260px; }
  </style>
</head>
<body>
  <h1>TITJ fal.ai Audio Review</h1>
  <p>Generated candidates are local review artifacts only. Do not move them into public assets until owner-approved.</p>
  <table>
    <thead><tr><th>ID</th><th>Variant</th><th>Runtime target</th><th>Audio</th><th>Prompt</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}

function buildReadme(candidates: GeneratedCandidate[]): string {
  const lines = [
    '# fal.ai Audio Review',
    '',
    'These files are local review candidates only. They are intentionally under `artifacts/` and ignored by git.',
    '',
    'Open `review.html` in a browser and audition each candidate. Approved clips should be normalized, renamed to the runtime key, documented with provenance, and only then copied into `public/assets/optimized/` or the relevant audio asset folder.',
    '',
    '## Candidates',
    '',
    '| ID | Variant | Runtime target | File |',
    '|---|---|---|---|',
  ];

  for (const candidate of candidates) {
    lines.push(`| ${candidate.id} | ${candidate.variant} | ${candidate.runtimeTarget} | ${candidate.file ?? candidate.error ?? 'dry run'} |`);
  }

  return `${lines.join('\n')}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function listTargets(): void {
  for (const target of TARGETS) {
    const suffix = target.reviewOnly ? ' (review-only)' : '';
    console.log(`${target.id}${suffix} - ${target.runtimeTarget}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.list) {
    listTargets();
    return;
  }

  const selected = selectTargets(opts);
  if (selected.length === 0) {
    console.log('No targets selected. Use --all or --id <target>. Run --list to inspect targets.');
    return;
  }

  const endpoint = ENDPOINTS[opts.model];
  const runDir = makeRunDir(opts.outRoot);
  await mkdir(runDir, { recursive: true });

  const apiKey = process.env.FAL_KEY;
  if (!opts.dryRun && !apiKey) {
    throw new Error('FAL_KEY is required. Set it in your shell; do not commit it.');
  }

  const candidates: GeneratedCandidate[] = [];
  for (const target of selected) {
    const variantCount = Math.min(opts.variants, target.variants.length);
    for (let index = 0; index < variantCount; index++) {
      const variant = target.variants[index];
      const prompt = buildPrompt(target, variant);
      const candidate: GeneratedCandidate = {
        id: target.id,
        group: target.group,
        runtimeTarget: target.runtimeTarget,
        variant,
        prompt,
        model: opts.model,
        endpoint,
        reviewOnly: target.reviewOnly === true,
      };

      if (!opts.dryRun) {
        console.log(`[fal-audio] ${target.id} variant ${index + 1}/${variantCount}`);
        const input = {
          prompt,
          output_format: 'ogg_opus',
          sample_rate: 48000,
          speed: 1,
          volume: 1,
        };
        try {
          const submit = await submitFalRequest(endpoint, apiKey!, input);
          const result = await pollFalResult(endpoint, apiKey!, submit, opts.pollMs);
          const audio = audioUrlFromResult(result);
          const fileName = `${target.id}-v${index + 1}.ogg`;
          await downloadAudio(audio.url!, join(runDir, fileName));
          candidate.file = fileName;
          candidate.sourceUrl = audio.url;
          candidate.requestId = submit.request_id;
          candidate.duration = audio.duration;
        } catch (error) {
          candidate.error = error instanceof Error ? error.message : String(error);
          console.warn(`[fal-audio] ${target.id} variant ${index + 1} failed: ${candidate.error}`);
        }
      }

      candidates.push(candidate);
    }
  }

  await writeReviewFiles(runDir, candidates);
  console.log(`[fal-audio] wrote ${runDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
