import type { LagBins } from './types'

export function buildDecayByScaleBin (lagBins: LagBins, scalesHours: number[]): Float32Array {
	const { B, midsHours } = lagBins
	const D = scalesHours.length
	const out = new Float32Array(D * B)

	for (let d = 0; d < D; d++) {
		const alpha = Math.max(1e-6, scalesHours[d])
		for (let b = 0; b < B; b++) {
			out[d * B + b] = Math.exp(-midsHours[b] / alpha)
		}
	}

	return out
}

export function buildInteractDecayByBin (lagBins: LagBins, decayScaleHours: number): Float32Array {
	const { B, midsHours } = lagBins
	const out = new Float32Array(B)
	const alpha = Math.max(1e-6, decayScaleHours)

	for (let b = 0; b < B; b++) {
		out[b] = Math.exp(-midsHours[b] / alpha)
	}

	return out
}
