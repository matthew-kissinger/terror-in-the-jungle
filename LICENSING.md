# Licensing

This document records the licensing of **Terror in the Jungle**
(github.com/matthew-kissinger/terror-in-the-jungle) and its transition from MIT
to AGPL-3.0 + CC BY-SA 4.0. Matthew Kissinger is the sole copyright holder of
the original code and assets.

## Transition (forward-only)

- **Every commit PRIOR to the relicense commit** was made available under the
  **MIT License** and **remains MIT** for anyone who already has it. Git history
  is not rewritten or altered; nothing about previously published versions is
  revoked. The MIT terms continue to apply to those versions.
- **From the relicense commit forward**, this project is licensed as:
  - **Source code** — GNU Affero General Public License, version 3 or later
    (`AGPL-3.0-or-later`). See [LICENSE](LICENSE).
  - **Original non-code assets** authored by Matthew Kissinger — Creative
    Commons Attribution-ShareAlike 4.0 International (`CC-BY-SA-4.0`). See
    [LICENSE-ASSETS](LICENSE-ASSETS).

This change governs **new versions only**. It does not retroactively alter the
license of any previously published version or commit.

## Third-party and public-domain inputs (unaffected)

The relicense does **not** cover third-party or public-domain inputs, which keep
their own status. In particular, real-world **DEM / terrain elevation data**
(USGS 3DEP is US-government **public domain**) is unaffected, as are bundled
fonts and npm dependencies. See [THIRD-PARTY-ASSETS.md](THIRD-PARTY-ASSETS.md)
for the full inventory.

## Why AGPL + CC BY-SA

This game is served over a network (browser build). **AGPL-3.0** ensures that
modifications offered to users over a network stay open to those users;
**CC BY-SA 4.0** keeps the original art open and attributed. The structure
mirrors the [OpenFront.io](https://github.com/openfrontio/OpenFrontIO) project.

In-app notices identifying the copyright holder and the AGPL source location
appear on the startup / deploy screen and in the in-game Credits / About panel.
Modified versions must preserve these notices in reasonably visible locations.

## Contributing

Contributions are accepted under **AGPL-3.0-or-later** (code) and
**CC BY-SA 4.0** (original assets). By submitting a contribution you certify you
have the right to license it under these terms. See [README.md](README.md).
