// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  analyzeWarAssetPayloadBuffer,
  summarizeWarAssetPayloadEntries,
} from './war-asset-payload-audit';

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

function makeChunk(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(payload.length, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, payload]);
}

function pad4(payload: Buffer, fill: number): Buffer {
  const pad = (4 - (payload.length % 4)) % 4;
  return pad > 0 ? Buffer.concat([payload, Buffer.alloc(pad, fill)]) : payload;
}

function makeGlb(json: unknown, bin: Buffer): Buffer {
  const jsonPayload = pad4(Buffer.from(JSON.stringify(json), 'utf-8'), 0x20);
  const binPayload = pad4(bin, 0);
  const chunks = [makeChunk(JSON_CHUNK_TYPE, jsonPayload), makeChunk(BIN_CHUNK_TYPE, binPayload)];
  const total = 12 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'utf-8');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  return Buffer.concat([header, ...chunks], total);
}

describe('war asset payload audit', () => {
  it('flags embedded uncompressed texture payloads separately from accessor bytes', () => {
    const data = makeGlb({
      buffers: [{ byteLength: 48 }],
      bufferViews: [
        { byteOffset: 0, byteLength: 16 },
        { byteOffset: 16, byteLength: 32 },
      ],
      accessors: [{ bufferView: 0 }],
      images: [{ mimeType: 'image/png', bufferView: 1 }],
      textures: [{ source: 0 }],
      materials: [{}, {}],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }, { attributes: { POSITION: 0 }, material: 1 }] }],
    }, Buffer.alloc(48, 7));

    const entry = analyzeWarAssetPayloadBuffer({
      slug: 'png-test',
      class: 'structures',
      path: 'structures/png-test.glb',
      budgetStatus: 'PASS',
      fileBytes: data.length,
      data,
    });

    expect(entry.accessorBufferBytes).toBe(16);
    expect(entry.embeddedImageBytes).toBe(32);
    expect(entry.embeddedCompressedTextureBytes).toBe(0);
    expect(entry.imageMimeBytes).toEqual({ 'image/png': 32 });
    expect(entry.flags).toContain('no-ktx2-or-basisu');
    expect(entry.flags).toContain('uncompressed-embedded-images');
    expect(entry.materialCount).toBe(2);
    expect(entry.primitiveCount).toBe(2);
  });

  it('recognizes KHR_texture_basisu and image/ktx2 as a compressed texture path', () => {
    const data = makeGlb({
      extensionsUsed: ['KHR_texture_basisu'],
      buffers: [{ byteLength: 48 }],
      bufferViews: [
        { byteOffset: 0, byteLength: 16 },
        { byteOffset: 16, byteLength: 32 },
      ],
      accessors: [{ bufferView: 0 }],
      images: [{ mimeType: 'image/ktx2', bufferView: 1 }],
      textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
      materials: [{}],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    }, Buffer.alloc(48, 3));

    const entry = analyzeWarAssetPayloadBuffer({
      slug: 'ktx2-test',
      class: 'props',
      path: 'props/ktx2-test.glb',
      budgetStatus: 'EXCEPTION',
      fileBytes: data.length,
      data,
    });
    const summary = summarizeWarAssetPayloadEntries([entry]);

    expect(entry.embeddedImageBytes).toBe(32);
    expect(entry.embeddedCompressedTextureBytes).toBe(32);
    expect(entry.imageMimeBytes).toEqual({ 'image/ktx2': 32 });
    expect(entry.flags).not.toContain('no-ktx2-or-basisu');
    expect(entry.flags).not.toContain('uncompressed-embedded-images');
    expect(summary.assetsWithCompressedTexturePath).toBe(1);
    expect(summary.assetsWithBasisuExtension).toBe(1);
    expect(summary.assetsWithKtx2Images).toBe(1);
    expect(summary.assetsWithUncompressedEmbeddedImages).toBe(0);
  });
});
