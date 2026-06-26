# Kiln war-export import — 2026-06-25

99 Vietnam war assets generated in Kiln Studio (`google:gemini-3.5-flash`,
shared "Vietnam War" palette), staged via `scripts/stage-kiln-war-export.mjs`
and imported with `scripts/import-war-catalog.ts` as NET-NEW catalog entries
(action `new`) under `public/models/<group>/kiln-war-2026-06/`. They ADD to the
catalog beside the existing pixel-forge entries; no legacy GLB or catalog entry
was modified. Source plan: Kiln `tmp/war-export-plan.json`.

- Total: 99 (98 imported GLBs + 1 net-new REJECT kept catalog-only).
- Grade spread: A 15 / B 11 / C 73.
- Class spread: structures 44, aircraft 14, boats 5, ground 9, weapons 15, animals 11, props 1.
- Per-asset Kiln provenance (provider/model/prompt/grade) also lands in each
  `<slug>.provenance.json` in this directory; rejects are listed in
  `REROLL_REQUESTS.md`. Animals are Kiln's weakest output — flagged for re-roll.

| slug | class | pack | grade | budget | generationId | subject |
|---|---|---|:--:|:--:|---|---|
| a-1-skyraider-spad | aircraft | vehicles | C | PASS | c8089568-63de-4f30-a8ba-fb355868791a | A-1 Skyraider "Spad" |
| a-37-dragonfly-light | aircraft | vehicles | C | PASS | f391fe12-2c46-419a-b98f-f4130b5ea870 | A-37 Dragonfly light attack jet |
| ac-47-spooky-gunship | aircraft | vehicles | C | PASS | 8bf1d15f-40dc-438d-b4cd-09041adc41f6 | AC-47 "Spooky" gunship |
| ah-1g-cobra-attack | aircraft | vehicles | C | PASS | 1a5f1d33-3092-415a-a802-2ecf5016ec98 | AH-1G Cobra attack helicopter |
| b-52d-stratofortress-strategic | aircraft | vehicles | C | PASS | af16befd-1b61-44f4-927a-2c4df01e5703 | B-52D Stratofortress strategic bomber |
| c-130-hercules-tactical | aircraft | vehicles | C | PASS | 7d977b0d-02a8-4cc1-8b2a-66fbb514fdc6 | C-130 Hercules tactical transport |
| ch-47-chinook-heavy | aircraft | vehicles | C | PASS | b42a06b1-9903-4d27-b612-2dbc4bd6d02e | CH-47 Chinook heavy-lift helicopter |
| f-4-phantom-ii | aircraft | vehicles | C | PASS | 45294c5b-f363-468b-bc64-241520deeb6d | F-4 Phantom II fighter-bomber |
| hh-3e-jolly-green | aircraft | vehicles | C | PASS | a0f617ff-f235-4930-8cb1-0f5a9630298a | HH-3E "Jolly Green Giant" rescue helicopter |
| mig-17-fresco | aircraft | vehicles | C | PASS | 429f7d8e-e787-4a44-af57-183c6e6aa3e0 | MiG-17 "Fresco" |
| oh-6-cayuse-loach | aircraft | vehicles | C | PASS | ed5b9774-169d-4ffa-bc59-14503ec82715 | OH-6 Cayuse "Loach" light observation helicopter |
| ov-10-bronco-forward | aircraft | vehicles | C | PASS | 42bd854a-036e-4177-a002-0694f9d2143a | OV-10 Bronco forward-air-control aircraft |
| uh-1c-huey-gunship | aircraft | vehicles | C | PASS | 1e6bf3f5-4364-4c40-989a-b81bd343623e | UH-1C Huey gunship |
| uh-1h-huey-transport | aircraft | vehicles | C | PASS | 165df51e-b7c7-414c-9554-1528f91efee3 | UH-1H "Huey" transport helicopter |
| burmese-python-rest | animals | wildlife-and-props | C | REJECT | 8019283d-13b9-4d2d-aaa2-e36844660beb | Burmese python at rest |
| chinese-pond-heron-standing | animals | wildlife-and-props | C | PASS | 87128411-8b9b-4505-8de9-bfd71725b896 | Chinese pond heron standing hunched at the water's edge |
| domestic-water-buffalo-standing | animals | wildlife-and-props | A | PASS | 1ee263e8-6849-4997-9441-64606f753cc3 | domestic water buffalo standing placidly |
| flying-fox-fruit-bat | animals | wildlife-and-props | B | PASS | 7512d479-bf30-4085-b06d-b8fb9df14932 | flying-fox fruit bat roosting upside-down from a bare branch |
| indochinese-tiger-caught-mid | animals | wildlife-and-props | C | PASS | 43ec44a5-5a3f-4700-a28a-30f27f86010d | Indochinese tiger caught mid-stalk |
| king-cobra-reared-strike | animals | wildlife-and-props | C | PASS | 5f303b06-a0fd-4e2a-8617-2b53671f8813 | king cobra reared to strike |
| long-tailed-macaque-sitting | animals | wildlife-and-props | B | PASS | 466671d0-35e9-4f3e-b4d3-36dd5921d25b | long-tailed macaque sitting on its haunches |
| tokay-gecko-clinging-spread | animals | wildlife-and-props | C | PASS | abe766ce-c5c5-439d-8ad2-73ced8978599 | tokay gecko clinging spread-eagled to a surface |
| water-monitor-lizard-standing | animals | wildlife-and-props | C | PASS | af4fee93-876d-4c60-ae5b-2fb05ebcb976 | water monitor lizard standing in a high-walk pause |
| white-handed-gibbon-sitting | animals | wildlife-and-props | B | PASS | 3e74e55c-dd56-4a52-8898-055ccf8ff136 | white-handed gibbon sitting upright |
| wild-boar-standing-alert | animals | wildlife-and-props | B | PASS | 19ff7573-5fd4-4988-ac22-dc563a861b82 | wild boar standing alert |
| lcm-8-mike-boat | boats | vehicles | C | PASS | a22ae64b-3bba-4bfd-a9c5-5690dcbf7b0d | LCM-8 "Mike Boat" mechanized landing craft |
| pbr-river-patrol-boat | boats | vehicles | C | PASS | 48ae6297-51c8-44cf-ad13-3fe95e61619d | PBR river patrol boat |
| pcf-swift-boat-coastal | boats | vehicles | C | PASS | 161df0b2-31ec-4f71-8b67-3bf5ca37640e | PCF "Swift Boat" coastal patrol craft |
| small-inflatable-rubber-raiding | boats | vehicles | C | PASS | a0330cd5-1c69-4edb-83b5-54304fedb6f3 | small inflatable rubber raiding raft |
| vietnamese-sampan | boats | vehicles | A | PASS | 6fc27217-f89f-42e1-9625-70d8cf5ce20a | Vietnamese sampan |
| m113-armored-personnel-carrier | ground | vehicles | C | PASS | 936b6ac9-1c8f-47ed-acab-7b5f77357ff0 | M113 armored personnel carrier |
| m151-mutt | ground | vehicles | C | PASS | c8aaa62e-c162-4fa7-a929-fc860a169dc8 | M151 MUTT |
| m35-deuce-a-half | ground | vehicles | C | PASS | 994a6429-a151-4fc0-ba07-8f47cfecbd45 | M35 "Deuce and a Half" six-wheel cargo truck |
| m42-duster-self-propelled | ground | vehicles | C | PASS | c54705fa-53e5-4b72-9d41-fd47c5ebb0c0 | M42 Duster self-propelled anti-aircraft gun |
| m48-patton-main-battle | ground | vehicles | C | PASS | a1c1ce9f-271e-4973-abeb-6a0233e3afe0 | M48 Patton main battle tank |
| m50-ontos | ground | vehicles | C | PASS | 8174b59a-13e0-4ac7-85f4-660c21cce2c2 | M50 Ontos |
| pt-76-amphibious-light | ground | vehicles | C | PASS | 4ddadfce-bc6b-41fc-b293-7111ea15e9f3 | PT-76 amphibious light tank |
| t-54-main-battle | ground | vehicles | C | PASS | 147654a4-346e-4c5c-a86c-c3d1d434f76b | T-54 main battle tank |
| zil-157-six-wheel | ground | vehicles | C | PASS | bfda82b5-1551-4238-ba83-f47aa7aad62a | ZIL-157 six-wheel cargo truck |
| coopered-wooden-barrel-standing | props | wildlife-and-props | C | PASS | ca55b123-b0e3-4c53-866c-60c3cd1524ff | coopered wooden barrel standing upright |
| 105mm-howitzer-emplacement | structures | structures | C | EXCEPTION | 91778826-a21f-4bc1-b77d-549aecbb55af | 105mm howitzer emplacement |
| 37mm-anti-aircraft-gun | structures | structures | C | PASS | 0bd4ce44-f2ea-4aa3-963e-fa1b3e89961c | 37mm anti-aircraft gun |
| 55-gallon-steel-fuel | structures | structures | A | PASS | 87b2146a-c0b0-485b-b523-28927ad11772 | 55-gallon steel fuel drum |
| 81mm-mortar-emplacement | structures | structures | A | EXCEPTION | 259d2460-b291-4e85-b853-88000ee04c3b | 81mm mortar emplacement |
| an-prc-25-field | structures | structures | C | PASS | 1b8fd4e1-a31f-40a3-841f-3138787f608c | AN/PRC-25 field-radio stack |
| battle-damaged-vietnamese-shophouse | structures | buildings | C | PASS | 39bd305b-5212-4f58-8899-4a3659defd6a | battle-damaged Vietnamese shophouse |
| battle-damaged-vietnamese-village | structures | buildings | A | PASS | b282392f-2fbb-4822-b5bb-3f6c75006dba | battle-damaged Vietnamese village hut |
| defensive-perimeter-berm-section | structures | structures | A | EXCEPTION | cf5f7ffe-0410-4646-ac2b-6f995f664fc3 | defensive perimeter berm section about eight meters long |
| diesel-generator-shed | structures | structures | C | EXCEPTION | f7c33f10-cc72-4a6a-a035-fab044d78157 | diesel generator shed |
| elevated-water-tower-about | structures | structures | A | EXCEPTION | 995fa6da-84be-47d0-a8a2-746ea9923d10 | elevated water tower about nine meters tall |
| field-latrine | structures | structures | C | PASS | d605f22b-38bf-40b5-8d50-1344ab151742 | field latrine |
| field-medical-aid-station | structures | structures | C | PASS | 8f96c48a-a694-4a54-9381-3018154f33df | field medical aid station tent about six meters long |
| firebase-entrance-gate-about | structures | structures | A | EXCEPTION | 9ae61b8a-c764-47c2-bc80-084d53c49db4 | firebase entrance gate about five meters wide |
| firebase-guard-tower-about | structures | structures | C | EXCEPTION | fbe8ed9c-5b8c-442a-811c-2671d43c9417 | firebase guard tower about eight meters tall |
| french-colonial-rubber-plantation | structures | buildings | C | EXCEPTION | 404f542c-46c1-43bc-91ff-7c1b487e66d0 | French-colonial rubber-plantation mansion |
| french-colonial-villa | structures | buildings | C | EXCEPTION | 3c60658b-f5d0-442a-9d18-8cceaa7d2a08 | French-colonial villa |
| m18-claymore-mine-deployed | structures | structures | C | PASS | 22faf389-3ae7-4fbb-93f7-234cbb32cd3e | M18 Claymore mine deployed on its legs |
| medium-barracks-tent | structures | structures | C | EXCEPTION | 15bcf1eb-6c17-4d68-a0be-263037f8a9e3 | medium barracks tent |
| mekong-delta-stilt-house | structures | buildings | B | PASS | a1bae77b-2230-4cd4-b42f-ac45404970a3 | Mekong Delta stilt house standing about two meters above flood-prone ground on tall slender hardwood posts |
| military-ammunition-crate-about | structures | structures | C | PASS | c063f050-f1a7-43aa-a27f-637212dc61da | military ammunition crate about eighty centimeters long |
| military-command-tent | structures | structures | C | EXCEPTION | 0738ca56-522f-4f04-b8df-09524135325e | military command tent |
| modest-vietnamese-rural-schoolhouse | structures | buildings | C | PASS | b34b6d31-27b5-44d2-ab88-57743e850784 | modest Vietnamese rural schoolhouse |
| narrow-vietnamese-urban-shophouse | structures | buildings | C | PASS | b0d19366-796d-4ff8-a68f-a596948cbf61 | narrow Vietnamese urban shophouse |
| nva-earthen-bunker | structures | buildings | A | PASS | 419a723d-7052-41c1-901c-6d68b9d55e63 | NVA earthen bunker |
| open-air-vietnamese-street | structures | buildings | A | EXCEPTION | ea7e8f83-abd5-460c-b55b-647ad072161f | open-air Vietnamese street market stall |
| ornate-rural-vietnamese-buddhist | structures | buildings | C | PASS | d042fd7d-a245-4ab6-a46d-705119b6ba00 | ornate rural Vietnamese Buddhist temple hall |
| plain-utilitarian-concrete-town | structures | buildings | C | EXCEPTION | d1d13485-98dd-4213-bf8d-0c4f1a9d0e08 | plain utilitarian concrete town building |
| punji-stake-trap | structures | structures | C | PASS | 41c2bac5-faec-4375-87f0-1c068480c076 | punji-stake trap |
| radio-communications-tower-about | structures | structures | A | EXCEPTION | 838d36be-9a63-44e0-90f0-aa88384974e1 | radio communications tower about twelve meters tall |
| rural-warehouse-or-supply | structures | buildings | C | EXCEPTION | 1b03f3e3-8c77-4650-887d-6b9b520d289a | rural warehouse or supply depot |
| sa-2-guideline-surface | structures | structures | C | PASS | 540ed88c-3f96-4e79-8601-6b25ebd54241 | SA-2 Guideline surface-to-air missile on its launcher |
| simple-wooden-footbridge-over | structures | structures | B | PASS | 4ea1f3e5-6c96-40bc-bc51-8378668a988d | simple wooden footbridge over a stream |
| small-stone-arch-bridge | structures | buildings | C | PASS | 7d78dbd2-2e49-49f7-847b-a8c16fae2056 | small stone arch bridge over a canal |
| small-vietnamese-buddhist-pagoda | structures | buildings | C | PASS | ec404da1-3b20-4588-a111-7bf0067f34b4 | small Vietnamese Buddhist pagoda in the Mahayana style |
| small-vietnamese-catholic-mission | structures | buildings | C | EXCEPTION | f17f4bb6-9edd-432f-9dd9-e0e114c93fe9 | small Vietnamese Catholic mission church |
| small-vietnamese-rice-mill | structures | buildings | A | PASS | 8804d408-11aa-4809-8342-e47184239d2c | small Vietnamese rice mill |
| traditional-vietnamese-tea-house | structures | buildings | C | EXCEPTION | 2a817870-40c2-43a9-868f-c14b47678110 | traditional Vietnamese tea house |
| traditional-vietnamese-village-hut | structures | buildings | B | PASS | be0f8a4c-7e8e-493a-9b69-c55208bf3c7b | traditional Vietnamese village hut |
| two-man-foxhole-fighting | structures | structures | A | PASS | af7746af-07a5-447c-b8af-0f18e94ab60b | two-man foxhole fighting position |
| vc-tunnel-entrance | structures | structures | C | PASS | 994ef0dd-322a-4b9a-ab5b-adf7be7c3c3d | VC tunnel entrance |
| vietnamese-rice-granary-raised | structures | buildings | C | PASS | 2919f896-670d-41f6-b714-5e349de5036f | Vietnamese rice granary raised on stilts |
| vietnamese-rural-farmhouse | structures | buildings | C | PASS | af0deb26-40b0-4f5a-940e-e241992a85fc | Vietnamese rural farmhouse |
| wooden-supply-crate-about | structures | structures | C | PASS | 49309259-d095-42b7-94d9-807d804eeab5 | wooden supply crate about a meter long |
| zpu-4-quad-anti | structures | structures | A | EXCEPTION | 981b92fd-c9f9-407a-a187-e40272e1103d | ZPU-4 quad anti-aircraft gun |
| ak-47 | weapons | weapons | C | PASS | 3ad9d6a9-182d-4fb6-81de-70dd74a16a4d | AK-47 |
| dragunov-svd-sniper-rifle | weapons | weapons | C | PASS | d036282b-310a-4b28-9eb6-a89047a3e0e6 | Dragunov SVD sniper rifle |
| ithaca-37-pump-action | weapons | weapons | A | PASS | 6170e606-5c08-4c83-9715-e9ef3bf88a5e | Ithaca 37 pump-action 12-gauge shotgun |
| m14-battle-rifle | weapons | weapons | C | PASS | 62a58a11-f153-4451-9815-6c8bc878c3f7 | M14 battle rifle |
| m16a1-2 | weapons | weapons | B | PASS | 6c78b400-eb78-46fc-8327-a431103926f6 | M16A1 |
| m1911a1-colt | weapons | weapons | C | PASS | 5d34e9e2-4e54-4bd8-8d34-fba5e7bf6378 | M1911A1 Colt |
| m2-browning-2 | weapons | weapons | C | EXCEPTION | 59a43d49-a337-44df-ba35-588d08da6a5e | M2 Browning |
| m3a1-grease-gun | weapons | weapons | B | PASS | 75b71880-450b-451a-8dc1-2ecf98a84460 | M3A1 "Grease Gun" |
| m57-clicker | weapons | weapons | C | PASS | bcde10e2-d4cd-482c-97e9-8ac031196568 | M57 "clicker" |
| m60-pig-general-purpose | weapons | weapons | B | PASS | 94cbcef5-a72e-474b-bb87-d706cff1ee00 | M60 "The Pig" general-purpose machine gun |
| m79-thumper-40mm-grenade | weapons | weapons | C | PASS | 78c00daf-02be-428b-874c-794dd1a28092 | M79 "Thumper" 40mm grenade launcher |
| rpd-light-machine-gun | weapons | weapons | C | PASS | 2827c47c-d59e-45b4-8c0d-4135aac5f02e | RPD light machine gun |
| rpg-7 | weapons | weapons | C | EXCEPTION | c9197a56-615f-4f23-bf78-ae96ef354d7f | RPG-7 |
| sks-carbine | weapons | weapons | C | PASS | c9952c45-5e1d-48f4-925e-0770dc053513 | SKS carbine |
| usmc-ka-bar-fighting | weapons | weapons | B | PASS | 3c7b271e-2b9f-4800-a30e-11bf637a1499 | USMC KA-BAR fighting knife |

