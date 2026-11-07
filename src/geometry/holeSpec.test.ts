import { describe, expect, it } from 'vitest'
import {
  METRIC_THREADS,
  SCREW_CLEARANCE,
  DIN912_HEADS,
  ISO7380_HEADS,
  COUNTERSINK_90,
  HEAT_INSERTS,
  MAGNET_PRESETS,
} from './holeSpec'

describe('geometry/holeSpec.ts (Task 3.1)', () => {
  it('validates screw clearance table sanity: monotonic and clearance > nominal', () => {
    let prevNominal = 0
    let prevNormal = 0

    for (const thread of METRIC_THREADS) {
      const c = SCREW_CLEARANCE[thread]
      expect(c.nominal).toBeGreaterThan(prevNominal)
      expect(c.normal).toBeGreaterThan(prevNormal)

      // Clearance values must be strictly greater than nominal thread size
      expect(c.close).toBeGreaterThan(c.nominal)
      expect(c.normal).toBeGreaterThan(c.close)
      expect(c.loose).toBeGreaterThan(c.normal)

      prevNominal = c.nominal
      prevNormal = c.normal
    }
  })

  it('validates DIN 912 and ISO 7380 head dimensions sanity', () => {
    for (const thread of METRIC_THREADS) {
      const din = DIN912_HEADS[thread]
      const iso = ISO7380_HEADS[thread]
      const nom = SCREW_CLEARANCE[thread].nominal

      // Head diameter must exceed shank diameter
      expect(din.headDiameter).toBeGreaterThan(nom)
      expect(iso.headDiameter).toBeGreaterThan(nom)

      // Counterbore diameter must be larger than head diameter for 3D printing tolerance
      expect(din.cbDiameter).toBeGreaterThan(din.headDiameter)
      expect(iso.cbDiameter).toBeGreaterThan(iso.headDiameter)

      // Counterbore depth must provide clearance over head depth
      expect(din.cbDepth).toBeGreaterThan(din.headDepth)
      expect(iso.cbDepth).toBeGreaterThan(iso.headDepth)
    }
  })

  it('validates countersink 90° dimensions sanity', () => {
    for (const thread of METRIC_THREADS) {
      const cs = COUNTERSINK_90[thread]
      const nom = SCREW_CLEARANCE[thread].nominal

      expect(cs.angleDegrees).toBe(90)
      expect(cs.csDiameter).toBeGreaterThan(nom)
    }
  })

  it('validates heat-set inserts table sanity', () => {
    let prevHole = 0
    for (const thread of METRIC_THREADS) {
      const ins = HEAT_INSERTS[thread]
      const nom = SCREW_CLEARANCE[thread].nominal

      // Insert hole must be larger than the screw nominal thread
      expect(ins.holeDiameter).toBeGreaterThan(nom)
      expect(ins.holeDiameter).toBeGreaterThan(prevHole)
      expect(ins.holeDepth).toBeGreaterThan(3.0)

      prevHole = ins.holeDiameter
    }
  })

  it('validates magnet presets sanity', () => {
    expect(MAGNET_PRESETS.length).toBeGreaterThanOrEqual(5)
    for (const mag of MAGNET_PRESETS) {
      expect(mag.diameter).toBeGreaterThan(2.0)
      expect(mag.height).toBeGreaterThan(0.5)
      // Pocket with tolerance must be slightly larger than magnet
      expect(mag.pocketDiameter).toBeGreaterThan(mag.diameter)
      expect(mag.pocketDepth).toBeGreaterThan(mag.height)
    }
  })
})
