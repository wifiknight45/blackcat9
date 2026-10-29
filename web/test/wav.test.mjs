// WAV encoder: a stub buffer goes in, a parseable RIFF comes out.
import test from "node:test";
import assert from "node:assert/strict";
import { bufferToWavBlob } from "../js/wav.js";

function stubBuffer() {
  const sr = 44100, len = 4410;
  const ch0 = new Float32Array(len), ch1 = new Float32Array(len);
  for (let i = 0; i < len; i++) ch0[i] = Math.sin(i / 10) * 0.5;
  return {
    numberOfChannels: 2, sampleRate: sr, length: len,
    getChannelData: (c) => (c === 0 ? ch0 : ch1),
    _ch0: ch0,
  };
}

test("wav roundtrip: header fields and interleaving", async () => {
  const stub = stubBuffer();
  const ab = await bufferToWavBlob(stub).arrayBuffer();
  const v = new DataView(ab);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(ab, o, n));
  assert.equal(str(0, 4), "RIFF");
  assert.equal(str(8, 4), "WAVE");
  assert.equal(v.getUint32(4, true), ab.byteLength - 8);
  assert.equal(v.getUint16(22, true), 2);          // channels
  assert.equal(v.getUint32(24, true), 44100);      // sample rate
  assert.equal(v.getUint32(28, true), 176400);     // byte rate
  assert.equal(v.getUint16(34, true), 16);         // bits per sample
  assert.equal(v.getUint32(40, true), 4410 * 2 * 2); // data bytes
  assert.equal(ab.byteLength, 44 + 4410 * 2 * 2);
  // frame 100: ch0 sample present, ch1 silent, interleaved L then R
  const s0 = v.getInt16(44 + 100 * 4, true);
  const s1 = v.getInt16(44 + 100 * 4 + 2, true);
  assert.equal(s1, 0);
  assert.ok(Math.abs(s0 - Math.round(stub._ch0[100] * 0x7fff)) <= 1);
});
