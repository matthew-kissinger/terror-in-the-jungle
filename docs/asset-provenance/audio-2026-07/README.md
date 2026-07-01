# July 2026 fal.ai Objective Audio Promotion

Runtime objective audio promoted on 2026-07-01 from local fal.ai review artifacts.

Source model: `bytedance/seed-audio-1.0` via `scripts/generate-fal-audio.ts`.

Runtime policy:

- No ambient static, background music, or global objective-complete stinger ships in this pass.
- Zone capture audio is local/proximity-gated at the captured objective.
- Task objective-complete audio is local/proximity-gated at the completed objective.
- `capture-confirmation-alt-v2.ogg` from `artifacts/audio/fal-review/2026-07-01T11-50-05-679Z` was rejected as too sharp and was not promoted; the approved v2 replacement is the newer file from `2026-07-01T12-14-27-741Z`.

## Promoted Clips

| Runtime key | Source review file | Duration | SHA-256 |
|---|---|---:|---|
| `objectiveCompleteLocal01` | `2026-07-01T11-50-05-679Z/objective-complete-feedback-v1.ogg` | 0.589s | `dd966a7317566fe51499ac2a80acd2fe966b1649f36db99e5f45df695d7ac7b9` |
| `objectiveCompleteLocal02` | `2026-07-01T11-50-05-679Z/objective-complete-feedback-v2.ogg` | 0.719s | `9f21fd1661bd6ef38877af202e1a734c774f0603490cc13e9c1d7fe1f254f36c` |
| `objectiveCompleteLocal03` | `2026-07-01T11-50-05-679Z/objective-complete-feedback-v3.ogg` | 0.280s | `6551805da30145ed1a714cc5bee354d378d7fee0772d24c898bc705c054852ed` |
| `objectiveCompleteLocal04` | `2026-07-01T11-50-05-679Z/objective-complete-feedback-v4.ogg` | 0.351s | `90721cb8a5a3ff26a83c3139506ddd5f963e128bb5acce380940ffa7932f8b4f` |
| `objectiveCompleteLocal05` | `2026-07-01T11-50-05-679Z/objective-complete-feedback-v5.ogg` | 0.367s | `4dd9351ef1fea0924e8e81f797307b1afbb225ad6b88ab6e45ce369ab31dcb5d` |
| `zoneCapturedLocal01` | `2026-07-01T11-50-05-679Z/capture-confirmation-alt-v1.ogg` | 0.256s | `8072ec0d3bd5a472fdffbcf0e78f40cb08c507cc75d18059cbada48782d1318c` |
| `zoneCapturedLocal02` | `2026-07-01T12-14-27-741Z/capture-confirmation-alt-v2.ogg` | 0.627s | `aad0747a12b182555755ded4d50d9c9dc56dcd7f505012970338a24674e2045f` |
| `zoneCapturedLocal03` | `2026-07-01T11-50-05-679Z/capture-confirmation-alt-v3.ogg` | 0.544s | `be041b4b6584dec1fe3700f6f1ba794d1244985b102789730c21e94971a1ea9b` |
| `zoneCapturedLocal04` | `2026-07-01T11-50-05-679Z/capture-confirmation-alt-v4.ogg` | 0.229s | `15127574ca9f9f48dd12af3f5791d968e80c2a27694e3dc6022782034a7d08bb` |
| `zoneCapturedLocal05` | `2026-07-01T11-50-05-679Z/capture-confirmation-alt-v5.ogg` | 0.540s | `1fdda240cb2e88216e02307d9b6408eb024f2b77cebe2b813150fc8db3beea68` |

All promoted clips were trimmed/normalized with `ffmpeg`, encoded as 48 kHz Ogg Opus, and installed under `public/assets/optimized/`.
